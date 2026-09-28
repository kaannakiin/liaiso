using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Liaiso.AspNetCore;
using Liaiso.AspNetCore.Discovery;

namespace Liaiso.Tests;

/// <remarks>
/// The twin of "search term declaration" in sdks/nestjs/test/search-terms.spec.ts. The declaring
/// operations are minimal APIs for the reason <see cref="TagDeclarationHostTests"/> gives: a
/// controller that reports a diagnostic would report it in every host of this assembly.
/// </remarks>
public sealed class SearchTermsHostTests : IAsyncLifetime
{
    private WebApplication _app = null!;
    private LiaisoCatalogProvider _catalog = null!;

    public async Task InitializeAsync()
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Logging.ClearProviders();
        builder.Services.AddControllers().AddApplicationPart(typeof(SearchTermsHostTests).Assembly);
        builder.Services.AddLiaiso(options => options.SearchTerms = container =>
            container.EndsWith(nameof(TagsUndeclaredController), StringComparison.Ordinal)
                ? ["merkez"]
                : null);

        _app = builder.Build();
        _app.UseLiaisoCapture();
        _app.UseRouting();
        _app.MapControllers();
        _app.MapGet("/terms/declared", () => "ok")
            .WithMetadata(new McpToolAttribute { Name = "declares_terms", SearchTerms = ["sipariş", "satın alma"] });
        _app.MapGet("/terms/duplicate", () => "ok")
            .WithMetadata(new McpToolAttribute { Name = "duplicate_terms", SearchTerms = ["Sipariş", "siparis", ""] });
        _app.MapLiaiso("/mcp");
        await _app.StartAsync();

        _catalog = _app.Services.GetRequiredService<LiaisoCatalogProvider>();
    }

    public async Task DisposeAsync() => await _app.DisposeAsync();

    private IReadOnlyList<string>? TermsOf(string name) => _catalog.Find(name)?.Descriptor.SearchTerms;

    [Fact]
    public void S1_DeclaredTermsAreIndexed()
    {
        Assert.Equal(["sipariş", "satın alma"], TermsOf("declares_terms"));
        Assert.Equal("declares_terms", _catalog.Search("satın", 10)[0].Tool.Name);
    }

    [Fact]
    public void S2_ContainerTermsSurviveAnOperationMarkerThatDeclaresNone()
    {
        Assert.Equal(["fatura"], TermsOf("inherits_tags"));
    }

    [Fact]
    public void S3_TermsFoldingOntoAnEarlierOneOrToNothingAreDroppedAndReported()
    {
        Assert.Equal(["Sipariş"], TermsOf("duplicate_terms"));
        Assert.Equal(
            [DiagnosticCodes.DuplicateSearchTerm, DiagnosticCodes.EmptySearchTerm],
            _catalog.Result.Diagnostics
                .Select(d => d.Code)
                .Where(code => code.EndsWith("_search_term", StringComparison.Ordinal))
                .Order(StringComparer.Ordinal)
                .ToArray());
    }

    [Fact]
    public void S4_HostRuleAppliesAndThereIsNoContainerDerivedDefault()
    {
        Assert.Equal(["merkez"], TermsOf("undeclared_tags"));
        Assert.Null(TermsOf("declares_tags"));
    }
}
