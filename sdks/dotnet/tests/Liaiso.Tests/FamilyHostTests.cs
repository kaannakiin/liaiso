using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Liaiso.AspNetCore;
using Liaiso.AspNetCore.Discovery;

namespace Liaiso.Tests;

internal static class Members
{
    public const string BalancesKey = "3f2c9a1e-8b4d-4c6a-9e21-7d5b0c4a1f10";
    public const string DelayedKey = "b27e5d04-61a3-4f8e-a0c9-2e8d7f13b5a6";

    public static McpFamilyMember Balances => new(
        BalancesKey,
        "list_customer_balances",
        "Müşteri bakiyelerini listeler.",
        new JsonObject
        {
            ["type"] = "object",
            ["properties"] = new JsonObject { ["minBalance"] = new JsonObject { ["type"] = "number" } },
        })
    {
        ReadOnly = true,
    };

    public static McpFamilyMember Delayed => new(
        DelayedKey,
        "list_delayed_orders",
        "Gecikmiş siparişleri listeler.",
        new JsonObject
        {
            ["type"] = "object",
            ["properties"] = new JsonObject { ["days"] = new JsonObject { ["type"] = "integer" } },
            ["required"] = new JsonArray("days"),
        });
}

public abstract class FamilyHost : InvokeHost
{
    [ApiController]
    [Route("/Rest")]
    public sealed class DynamicMethodController : ControllerBase
    {
        [HttpPost("InvokeDynamicMethod/{methodId}")]
        [McpTool(Description = "Invokes a server method by its id.")]
        [McpToolFamily("methodId", Source = "methods")]
        public IActionResult Invoke(string methodId, [FromBody] JsonElement body) =>
            Ok(new { methodId, received = body });
    }

    [ApiController]
    [Route("/Legacy")]
    public sealed class UnregisteredSourceController : ControllerBase
    {
        [HttpPost("Invoke/{methodId}")]
        [McpTool(Description = "Invokes a legacy method by its id.")]
        [McpToolFamily("methodId", Source = "legacy")]
        public IActionResult Invoke(string methodId, [FromBody] JsonElement body) => Ok();
    }

    [ApiController]
    [Route("/Rest/Orders")]
    public sealed class OrdersController : ControllerBase
    {
        [HttpGet]
        [McpTool(Name = "list_orders", Description = "Siparişleri listeler.")]
        public IActionResult List() => Ok(Array.Empty<object>());
    }

    private int _loads;

    /// <summary>What the source answers on each load, the last answer repeating.</summary>
    protected abstract IReadOnlyList<Func<IReadOnlyList<McpFamilyMember>>> Answers { get; }

    protected override Type[] Controllers =>
        [typeof(DynamicMethodController), typeof(UnregisteredSourceController), typeof(OrdersController)];

    protected override void Configure(IMvcBuilder mvc) =>
        mvc.Services.Configure<LiaisoOptions>(options => options.Families.Provide(
            "methods",
            (_, _) =>
            {
                Func<IReadOnlyList<McpFamilyMember>> answer = Answers[Math.Min(_loads, Answers.Count - 1)];
                _loads += 1;
                return ValueTask.FromResult(answer());
            }));

    private protected LiaisoCatalogProvider Catalog => Services.GetRequiredService<LiaisoCatalogProvider>();

    private protected string[] Names => [.. Catalog.Result.Entries.Select(e => e.Tool.Name).Order(StringComparer.Ordinal)];

    private protected string[] Codes => [.. Catalog.Result.Diagnostics.Select(d => d.Code)];
}

public sealed class FamilyHostTests : FamilyHost
{
    protected override IReadOnlyList<Func<IReadOnlyList<McpFamilyMember>>> Answers =>
        [() => [Members.Balances, Members.Delayed]];

    [Fact]
    public async Task FH1_EachMemberIsATool_WithItsOwnBody_AndNoDispatchParameter()
    {
        Assert.Equal(["list_customer_balances", "list_delayed_orders", "list_orders"], Names);

        JsonNode schema = await LoadInputSchemaAsync("list_customer_balances");

        Assert.True(JsonNode.DeepEquals(
            new JsonObject { ["minBalance"] = new JsonObject { ["type"] = "number" } },
            schema["properties"]), schema.ToJsonString());
        Assert.True(Catalog.Find("list_customer_balances")!.Tool.Annotations.ReadOnlyHint);
    }

    [Fact]
    public void FH2_SearchFindsAMemberByItsOwnTerms_AndNeverByItsKey()
    {
        Assert.Equal("list_customer_balances", Catalog.Search("bakiye", 10)[0].Tool.Name);
        Assert.Empty(Catalog.Search(Members.BalancesKey, 10));
    }

    [Fact]
    public async Task FH3_InvokeWritesTheMembersKey_AndRefusesItAsAnArgument()
    {
        JsonElement body = await InvokeAsync("list_customer_balances", new { minBalance = 1000 });

        Assert.Equal(Members.BalancesKey, body.GetProperty("methodId").GetString());
        Assert.Equal(1000, body.GetProperty("received").GetProperty("minBalance").GetInt32());

        (JsonElement refused, bool isError) = await InvokeRawAsync(
            "list_customer_balances", new { minBalance = 1000, methodId = Members.DelayedKey });
        Assert.True(isError);
        Assert.Equal("unknown_argument", refused.GetProperty("error").GetString());
    }

    [Fact]
    public void FH4_AFamilyWhoseSourceIsNotRegisteredPublishesNothing()
    {
        Assert.DoesNotContain(Catalog.Result.Entries, e => e.Descriptor.Route.StartsWith("/Legacy", StringComparison.Ordinal));
        Assert.Contains(DiagnosticCodes.UnknownFamilySource, Codes);
    }

    [Fact]
    public async Task FH5_AReloadAdvancesTheGenerationAndSignalsTheChangeToken()
    {
        long generation = Catalog.Generation;
        bool signalled = false;
        using IDisposable _ = Catalog.GetChangeToken().RegisterChangeCallback(_ => signalled = true, null);

        await Catalog.ReloadAsync();

        Assert.Equal(generation + 1, Catalog.Generation);
        Assert.True(signalled);
    }
}

public sealed class FamilyStaleHostTests : FamilyHost
{
    protected override IReadOnlyList<Func<IReadOnlyList<McpFamilyMember>>> Answers =>
        [() => [Members.Balances], () => throw new InvalidOperationException("database unreachable")];

    [Fact]
    public async Task FS1_AFailedReloadKeepsTheMembersTheSourceLastReturned()
    {
        await Catalog.ReloadAsync();

        Assert.Equal(["list_customer_balances", "list_orders"], Names);
        Assert.Contains(DiagnosticCodes.FamilySourceStale, Codes);
    }
}

public sealed class FamilyFailedHostTests : FamilyHost
{
    protected override IReadOnlyList<Func<IReadOnlyList<McpFamilyMember>>> Answers =>
        [() => throw new InvalidOperationException("database unreachable")];

    [Fact]
    public void FF1_ASourceThatNeverReturnedDropsTheFamily()
    {
        Assert.Equal(["list_orders"], Names);
        Assert.Contains(DiagnosticCodes.FamilySourceFailed, Codes);
    }
}

public sealed class FamilyRejectedMemberHostTests : FamilyHost
{
    protected override IReadOnlyList<Func<IReadOnlyList<McpFamilyMember>>> Answers =>
        [() => [Members.Balances, Members.Delayed with { Name = "List-Delayed" }]];

    [Fact]
    public void FR1_AnIllFormedMemberIsDropped_AndItsSiblingsKept()
    {
        Assert.Equal(["list_customer_balances", "list_orders"], Names);
        Assert.Contains(DiagnosticCodes.FamilyMemberRejected, Codes);
    }
}

public sealed class FamilyFatalReloadHostTests : FamilyHost
{
    protected override IReadOnlyList<Func<IReadOnlyList<McpFamilyMember>>> Answers =>
        [() => [Members.Balances], () => [Members.Delayed with { Name = "list_orders" }]];

    [Fact]
    public async Task FX1_AReloadThatWouldTurnTheCatalogFatalIsRefused_AndTheCurrentOneKept()
    {
        long generation = Catalog.Generation;

        await Assert.ThrowsAsync<LiaisoCatalogException>(async () => await Catalog.ReloadAsync());

        Assert.Equal(["list_customer_balances", "list_orders"], Names);
        Assert.Equal(generation, Catalog.Generation);
    }
}
