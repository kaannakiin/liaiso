using System.Globalization;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Sezzlee.AspNetCore.Naming;
using Sezzlee.AspNetCore.Spec;
using Microsoft.Extensions.DependencyInjection;

namespace Sezzlee.AspNetCore.Discovery;

/// <summary>The value a family member writes into the dispatch parameter; it never reaches the agent.</summary>
public readonly record struct McpFamilyKey
{
    private readonly string? _text;
    private readonly long? _number;

    private McpFamilyKey(string? text, long? number)
    {
        _text = text;
        _number = number;
    }

    public static implicit operator McpFamilyKey(string value) =>
        new(value ?? throw new ArgumentNullException(nameof(value)), null);

    public static implicit operator McpFamilyKey(long value) => new(null, value);

    public static implicit operator McpFamilyKey(Guid value) => new(value.ToString("D"), null);

    internal JsonNode ToNode() => _number is { } number ? JsonValue.Create(number) : JsonValue.Create(_text ?? string.Empty);

    public override string ToString() =>
        _number?.ToString(CultureInfo.InvariantCulture) ?? _text ?? string.Empty;
}

/// <summary>One capability behind a dispatching operation, as a host's member source returns it.</summary>
/// <param name="Body">The member's own request body, published as its input schema.</param>
public sealed record McpFamilyMember(McpFamilyKey Key, string Name, string Description, JsonObject Body)
{
    public bool? BodyRequired { get; init; }
    public bool? ReadOnly { get; init; }
    public bool? Destructive { get; init; }
    public bool? Idempotent { get; init; }
}

/// <summary>Returns a family's members. It runs in its own service scope, outside any request.</summary>
public delegate ValueTask<IReadOnlyList<McpFamilyMember>> McpFamilySource(
    IServiceProvider services, CancellationToken cancellationToken);

public sealed class ToolFamilyOptions
{
    private readonly Dictionary<string, McpFamilySource> _sources = new(StringComparer.Ordinal);

    public IReadOnlyDictionary<string, McpFamilySource> Sources => _sources;

    public TimeSpan LoadTimeout { get; set; } = TimeSpan.FromSeconds(10);

    public ToolFamilyOptions Provide(string name, McpFamilySource source)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentNullException.ThrowIfNull(source);
        _sources[name] = source;
        return this;
    }
}

internal abstract record FamilyLoad
{
    internal sealed record Loaded(IReadOnlyList<McpFamilyMember> Members) : FamilyLoad;

    internal sealed record Stale(IReadOnlyList<McpFamilyMember> Members, Exception Error) : FamilyLoad;

    internal sealed record Failed(Exception Error) : FamilyLoad;
}

internal abstract record FamilyResolution
{
    internal sealed record Members(
        ToolFamily Family, IReadOnlyList<ToolVariant> Variants, IReadOnlyList<CatalogDiagnostic> Diagnostics)
        : FamilyResolution;

    internal sealed record Refused(CatalogDiagnostic Diagnostic) : FamilyResolution;
}

internal static partial class FamilyReader
{
    /// <summary>Loads every registered source once.</summary>
    /// <remarks>
    /// A failing source keeps the members it last returned: dropping a family because its source
    /// was briefly unreachable would take working tools offline on every transient error.
    /// </remarks>
    public static async Task<IReadOnlyDictionary<string, FamilyLoad>> LoadAsync(
        ToolFamilyOptions options,
        IServiceScopeFactory? scopes,
        IReadOnlyDictionary<string, FamilyLoad>? previous,
        CancellationToken cancellationToken)
    {
        (string Name, FamilyLoad Load)[] loads = await Task.WhenAll(options.Sources.Select(async entry =>
        {
            try
            {
                using CancellationTokenSource deadline =
                    CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                deadline.CancelAfter(options.LoadTimeout);
                IReadOnlyList<McpFamilyMember> members = await LoadOneAsync(
                    entry.Value, scopes, deadline.Token).WaitAsync(deadline.Token);
                return (entry.Key, (FamilyLoad)new FamilyLoad.Loaded(members));
            }
            catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
            {
                FamilyLoad load = previous?.GetValueOrDefault(entry.Key) switch
                {
                    FamilyLoad.Loaded last => new FamilyLoad.Stale(last.Members, ex),
                    FamilyLoad.Stale last => new FamilyLoad.Stale(last.Members, ex),
                    _ => new FamilyLoad.Failed(ex),
                };
                return (entry.Key, load);
            }
        }));
        return loads.ToDictionary(l => l.Name, l => l.Load, StringComparer.Ordinal);
    }

    private static async Task<IReadOnlyList<McpFamilyMember>> LoadOneAsync(
        McpFamilySource source, IServiceScopeFactory? scopes, CancellationToken cancellationToken)
    {
        if (scopes is null)
        {
            return await source(EmptyServices.Instance, cancellationToken);
        }
        await using AsyncServiceScope scope = scopes.CreateAsyncScope();
        return await source(scope.ServiceProvider, cancellationToken);
    }

    /// <summary>Lowers one operation's family declaration into the variants its members become.</summary>
    /// <remarks>
    /// A defect in one member is that member's alone: the rest of the family stays published,
    /// because members are host data and one bad row should not take every sibling offline. Only
    /// a defect in the declaration itself refuses the operation.
    /// </remarks>
    public static FamilyResolution Resolve(
        McpToolFamilyAttribute declaration,
        string owner,
        IReadOnlyList<ToolVariant>? declared,
        ToolFamilyOptions options,
        IReadOnlyDictionary<string, FamilyLoad>? loads)
    {
        ToolFamily family = new() { Parameter = declaration.Parameter };
        if (declaration.Source is null)
        {
            return new FamilyResolution.Members(family, [], []);
        }
        if (!options.Sources.ContainsKey(declaration.Source))
        {
            return Refused(
                DiagnosticCodes.UnknownFamilySource,
                $"{owner} takes its members from source '{declaration.Source}', which is not registered; register it with options.Families.Provide.");
        }
        FamilyLoad? load = loads?.GetValueOrDefault(declaration.Source);
        List<CatalogDiagnostic> diagnostics = [];
        IReadOnlyList<McpFamilyMember> members;
        switch (load)
        {
            case null:
                return Refused(
                    DiagnosticCodes.FamilyNotLoaded,
                    $"{owner} was built before source '{declaration.Source}' finished loading; the catalog is rebuilt when it does.");
            case FamilyLoad.Failed failed:
                return Refused(
                    DiagnosticCodes.FamilySourceFailed,
                    $"{owner} has no members: source '{declaration.Source}' failed and has never returned any ({failed.Error.Message}).");
            case FamilyLoad.Stale stale:
                diagnostics.Add(new CatalogDiagnostic(
                    DiagnosticCodes.FamilySourceStale,
                    $"{owner} keeps the members source '{declaration.Source}' last returned; the latest load failed ({stale.Error.Message})."));
                members = stale.Members;
                break;
            case FamilyLoad.Loaded loaded:
                members = loaded.Members;
                break;
            default:
                throw new InvalidOperationException($"Unhandled family load {load.GetType().Name}.");
        }

        HashSet<string> names = new((declared ?? []).Select(v => v.Name), StringComparer.Ordinal);
        HashSet<string> keys = new(StringComparer.Ordinal);
        List<ToolVariant> variants = [];
        foreach (McpFamilyMember member in members)
        {
            string? problem = ProblemOf(member, names, keys);
            if (problem is not null)
            {
                diagnostics.Add(new CatalogDiagnostic(
                    DiagnosticCodes.FamilyMemberRejected,
                    $"{owner} drops member '{member.Name}': {problem}."));
                continue;
            }
            names.Add(member.Name);
            keys.Add(member.Key.ToNode().ToJsonString());
            variants.Add(Lower(member, declaration.Parameter));
        }
        return new FamilyResolution.Members(family, variants, diagnostics);
    }

    private static string? ProblemOf(McpFamilyMember member, HashSet<string> names, HashSet<string> keys)
    {
        if (member.Name is null || !ToolName().IsMatch(member.Name))
        {
            return "its name does not match the tool-name pattern";
        }
        if (string.IsNullOrWhiteSpace(member.Description))
        {
            return "it has no description";
        }
        if (names.Contains(member.Name))
        {
            return "another member or variant has the same name";
        }
        if (keys.Contains(member.Key.ToNode().ToJsonString()))
        {
            return "its key repeats another member's";
        }
        if (member.Body is null)
        {
            return "its body is not a JSON Schema object";
        }
        string? invalid = FamilyRules.DeclaredSchemaProblem(member.Body);
        return invalid is null ? null : $"its body {invalid}";
    }

    private static ToolVariant Lower(McpFamilyMember member, string parameter)
    {
        bool annotated = member.ReadOnly is not null || member.Destructive is not null || member.Idempotent is not null;
        return new ToolVariant
        {
            Name = member.Name,
            Description = member.Description,
            Arguments =
            [
                new ArgumentCuration
                {
                    Name = parameter,
                    Hidden = new ArgumentFill { Kind = ArgumentFillKind.Constant, Value = member.Key.ToNode() },
                },
            ],
            RequestBody = new VariantRequestBody
            {
                Schema = (JsonObject)member.Body.DeepClone(),
                Required = member.BodyRequired,
            },
            Annotations = annotated
                ? new ToolAnnotations
                {
                    ReadOnlyHint = member.ReadOnly,
                    DestructiveHint = member.Destructive,
                    IdempotentHint = member.Idempotent,
                }
                : null,
        };
    }

    private static FamilyResolution Refused(string code, string message) =>
        new FamilyResolution.Refused(new CatalogDiagnostic(code, message));

    [GeneratedRegex("^[a-z][a-z0-9_]{0,255}$")]
    private static partial Regex ToolName();

    private sealed class EmptyServices : IServiceProvider
    {
        public static readonly EmptyServices Instance = new();

        public object? GetService(Type serviceType) => null;
    }
}
