using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Liaiso.AspNetCore;
using Liaiso.AspNetCore.Discovery;
using Liaiso.AspNetCore.Search;
using Liaiso.AspNetCore.Tools;

namespace Liaiso.Tests;

internal sealed class StubRanker(Func<ToolRankRequest, CancellationToken, Task<IReadOnlyList<string>>> answer) : IToolRanker
{
    public int Calls;
    public ToolRankRequest? Last;

    public async ValueTask<IReadOnlyList<string>> RankAsync(ToolRankRequest request, CancellationToken cancellationToken)
    {
        Interlocked.Increment(ref Calls);
        Last = request;
        return await answer(request, cancellationToken);
    }
}

/// <remarks>
/// The twin of "host ranker" in sdks/nestjs/test/ranker.spec.ts. The meta-tools are built by
/// <see cref="ActivatorUtilities"/>, the way the MCP server builds them, so the ranker arrives
/// through DI exactly as a host registers it.
/// </remarks>
public sealed class RankerHostTests
{
    private static async Task<(WebApplication App, LiaisoMetaTools Tools)> StartAsync(
        IToolRanker ranker, Action<LiaisoOptions>? configure = null)
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Logging.ClearProviders();
        builder.Services.AddControllers().AddApplicationPart(typeof(RankerHostTests).Assembly);
        builder.Services.AddSingleton(ranker);
        builder.Services.AddLiaiso(options => configure?.Invoke(options));

        WebApplication app = builder.Build();
        app.UseLiaisoCapture();
        app.UseRouting();
        app.MapControllers();
        app.MapGet("/ranked/one", () => "ok")
            .WithMetadata(new McpToolAttribute { Name = "ranked_one" })
            .AllowAnonymous();
        app.MapGet("/ranked/two", () => "ok")
            .WithMetadata(new McpToolAttribute { Name = "ranked_two" })
            .AllowAnonymous();
        app.MapLiaiso("/mcp");
        await app.StartAsync();
        return (app, ActivatorUtilities.CreateInstance<LiaisoMetaTools>(app.Services));
    }

    private static async Task<JsonElement> SearchAsync(LiaisoMetaTools tools, string query)
    {
        using JsonDocument document = JsonDocument.Parse(
            VisibilityHost.TextOf(await tools.SearchTools(query, LiaisoMetaTools.MaxLimit)));
        return document.RootElement.Clone();
    }

    private static string[] NamesOf(JsonElement answer) =>
        [.. answer.GetProperty("results").EnumerateArray().Select(card => card.GetProperty("name").GetString()!)];

    [Fact]
    public async Task K1_RankerOrderWinsAndUnknownNamesAreDropped()
    {
        StubRanker ranker = new((_, _) => Task.FromResult<IReadOnlyList<string>>(["ghost", "ranked_two", "ranked_one"]));
        (WebApplication app, LiaisoMetaTools tools) = await StartAsync(ranker);
        await using (app)
        {
            Assert.Equal(["ranked_two", "ranked_one"], NamesOf(await SearchAsync(tools, "ranked")));
            Assert.Equal("ranked", ranker.Last!.Query);
            Assert.Contains(ranker.Last.Catalog.Documents, document => document.Name == "ranked_one");
        }
    }

    [Fact]
    public async Task K2_ListingNeverReachesTheRanker()
    {
        StubRanker ranker = new((_, _) => Task.FromResult<IReadOnlyList<string>>([]));
        (WebApplication app, LiaisoMetaTools tools) = await StartAsync(ranker);
        await using (app)
        {
            Assert.NotEmpty(NamesOf(await SearchAsync(tools, "")));
            Assert.Equal(0, ranker.Calls);
        }
    }

    /// <remarks>
    /// Guard: the ranker here ignores its token. The deadline still frees the call, because the
    /// wait is abandoned rather than cancelled cooperatively.
    /// </remarks>
    [Fact]
    public async Task K3_DeadlineFallsBackToBm25EvenWhenTheRankerIgnoresCancellation()
    {
        StubRanker ranker = new((_, _) => new TaskCompletionSource<IReadOnlyList<string>>().Task);
        (WebApplication app, LiaisoMetaTools tools) = await StartAsync(
            ranker, options => options.Search.RankerTimeout = TimeSpan.FromMilliseconds(50));
        await using (app)
        {
            Assert.Equal(["ranked_one", "ranked_two"], NamesOf(await SearchAsync(tools, "ranked")));
        }
    }

    [Fact]
    public async Task K4_ErrorModeRefusesWithoutLeakingTheFailure()
    {
        StubRanker ranker = new((_, _) => throw new InvalidOperationException("vector store down"));
        (WebApplication app, LiaisoMetaTools tools) = await StartAsync(
            ranker, options => options.Search.OnRankerFailure = RankerFailureMode.Error);
        await using (app)
        {
            JsonElement answer = await SearchAsync(tools, "ranked");
            Assert.Equal("search_ranker_unavailable", answer.GetProperty("error").GetString());
            Assert.True(answer.GetProperty("retryable").GetBoolean());
            Assert.DoesNotContain("vector store", answer.GetRawText(), StringComparison.Ordinal);
        }
    }
}
