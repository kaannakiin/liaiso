#if NET10_0_OR_GREATER
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Sezzlee.AspNetCore;
using Sezzlee.AspNetCore.Discovery;

namespace Sezzlee.Tests;

/// <summary>
/// Writes the SDK's descriptors and ASP.NET's own OpenAPI document for the same controllers, so the
/// OpenAPI ingestion can be compared with framework discovery on one backend. Runs only when
/// SEZZLEE_PARITY_DIR names the output directory; the comparison itself is
/// packages/servers/openapi-mcp/test/parity.spec.ts.
/// </summary>
public sealed class OpenApiParityDump
{
    private static readonly JsonSerializerOptions Neutral = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
        WriteIndented = true,
    };

    [Fact]
    public async Task Dump()
    {
        string? directory = Environment.GetEnvironmentVariable("SEZZLEE_PARITY_DIR");
        if (string.IsNullOrEmpty(directory))
        {
            return;
        }

        WebApplicationBuilder builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Logging.ClearProviders();
        builder.Services.AddControllers().AddApplicationPart(typeof(SchemaHost).Assembly);
        builder.Services.AddOpenApi();
        builder.Services.AddSezzlee(options => options.Selection.Default = SelectionDefault.Include);

        await using WebApplication app = builder.Build();
        app.UseSezzleeCapture();
        app.UseRouting();
        app.MapControllers();
        app.MapOpenApi();
        app.MapSezzlee("/mcp");
        await app.StartAsync();

        string document = await app.GetTestClient().GetStringAsync("/openapi/v1.json");
        SezzleeCatalogProvider catalog = app.Services.GetRequiredService<SezzleeCatalogProvider>();
        var descriptors = catalog.Result.Entries
            .Select(entry => new { tool = entry.Tool.Name, descriptor = entry.Descriptor })
            .ToList();

        Directory.CreateDirectory(directory);
        await File.WriteAllTextAsync(Path.Combine(directory, "openapi.json"), document);
        await File.WriteAllTextAsync(
            Path.Combine(directory, "sdk-descriptors.json"),
            JsonSerializer.Serialize(descriptors, Neutral));
    }
}
#endif
