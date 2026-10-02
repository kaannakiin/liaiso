namespace Sezzlee.AspNetCore.Search;

/// <summary>
/// A host's replacement for the BM25 ranking of a non-empty <c>search_tools</c> query. Register it
/// in DI; visibility, the tag filter, <c>limit</c> and the payload budget still apply to its answer.
/// </summary>
public interface IToolRanker
{
    /// <returns>Tool names, most relevant first; a tool left out is not in the result.</returns>
    ValueTask<IReadOnlyList<string>> RankAsync(ToolRankRequest request, CancellationToken cancellationToken);
}

/// <summary>One tool as a ranker sees it: every index field, projected from the published schema.</summary>
public sealed record RankDocument(
    string Name,
    string? Description,
    IReadOnlyList<string> Tags,
    IReadOnlyList<string> SearchTerms,
    string Route,
    IReadOnlyList<string> AlternateRoutes,
    IReadOnlyList<string> Parameters);

/// <param name="Version">Changes whenever the catalog is rebuilt, so a ranker that embeds ahead of time knows when to embed again.</param>
public sealed record RankCatalog(long Version, IReadOnlyList<RankDocument> Documents);

public sealed record ToolRankRequest(string Query, RankCatalog Catalog);

public enum RankerFailureMode
{
    Fallback,
    Error,
}

public sealed class SearchOptions
{
    public const int DefaultRankerTimeoutMs = 10_000;

    /// <summary>
    /// How long <c>search_tools</c> waits for an <see cref="IToolRanker"/>. <see cref="TimeSpan.Zero"/>
    /// means no deadline. Values at or above one minute are unreachable through a stock MCP client.
    /// </summary>
    public TimeSpan RankerTimeout { get; set; } = TimeSpan.FromMilliseconds(DefaultRankerTimeoutMs);

    /// <summary>
    /// <see cref="RankerFailureMode.Fallback"/> ranks with BM25 and logs; <see cref="RankerFailureMode.Error"/>
    /// answers <c>search_ranker_unavailable</c>.
    /// </summary>
    public RankerFailureMode OnRankerFailure { get; set; } = RankerFailureMode.Fallback;
}

internal enum RankerFailureReason
{
    Timeout,
    Threw,
    InvalidAnswer,
}

internal sealed record NormalizedRanking(
    IReadOnlyList<string> Names, IReadOnlyList<string> Unknown, IReadOnlyList<string> Duplicate);

internal static class Ranking
{
    private static long _version;

    public static RankCatalog CatalogOf(IEnumerable<SearchDocument> documents) => new(
        Interlocked.Increment(ref _version),
        documents.Select(d => new RankDocument(
            d.Name,
            d.Description,
            d.Tags.ToArray(),
            (d.SearchTerms ?? []).ToArray(),
            d.Route,
            (d.AlternateRoutes ?? []).ToArray(),
            (d.Parameters ?? []).ToArray())).ToArray());

    /// <returns><see langword="null"/> when the answer is not a list of names.</returns>
    public static NormalizedRanking? Normalize(
        ToolIndex index, IReadOnlyList<string?>? answer, IReadOnlyList<string>? tags)
    {
        if (answer is null || answer.Any(name => name is null))
        {
            return null;
        }
        HashSet<string> seen = new(StringComparer.Ordinal);
        List<string> unknown = [];
        List<string> duplicate = [];
        List<string> known = [];
        foreach (string name in answer.Cast<string>())
        {
            if (!index.Has(name))
            {
                unknown.Add(name);
            }
            else if (!seen.Add(name))
            {
                duplicate.Add(name);
            }
            else
            {
                known.Add(name);
            }
        }
        return new NormalizedRanking(index.RetainTagged(known, tags), unknown, duplicate);
    }

    public static string FailureMessage(RankerFailureReason reason, RankerFailureMode mode) =>
        (reason switch
        {
            RankerFailureReason.Timeout => "search_tools: the search ranker did not answer within its deadline",
            RankerFailureReason.Threw => "search_tools: the search ranker threw",
            RankerFailureReason.InvalidAnswer =>
                "search_tools: the search ranker answered something other than a list of tool names",
            _ => throw new ArgumentOutOfRangeException(nameof(reason)),
        }) + (mode == RankerFailureMode.Fallback
            ? "; the query was ranked with BM25 instead."
            : "; the call was refused as search_ranker_unavailable.");
}
