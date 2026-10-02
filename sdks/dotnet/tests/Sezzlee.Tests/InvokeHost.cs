using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ApplicationParts;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ModelContextProtocol.Protocol;
using Sezzlee.AspNetCore;
using Sezzlee.AspNetCore.Caching;
using Sezzlee.AspNetCore.Errors;
using Sezzlee.AspNetCore.Tools;
using Sezzlee.AspNetCore.Visibility;

namespace Sezzlee.Tests;

public abstract class InvokeHost : IAsyncLifetime
{
    private sealed class NestedControllers(params Type[] controllers)
        : IApplicationFeatureProvider<ControllerFeature>
    {
        public void PopulateFeature(IEnumerable<ApplicationPart> parts, ControllerFeature feature)
        {
            foreach (TypeInfo controller in controllers.Select(type => type.GetTypeInfo()))
            {
                if (!feature.Controllers.Contains(controller))
                {
                    feature.Controllers.Add(controller);
                }
            }
        }
    }

    private WebApplication _app = null!;
    private SezzleeMetaTools _tools = null!;

    private protected IServiceProvider Services => _app.Services;

    protected virtual Type[] Controllers => [];

    protected virtual void Configure(IMvcBuilder mvc)
    {
    }

    protected virtual void Map(WebApplication app)
    {
    }

    public async Task InitializeAsync()
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Logging.ClearProviders();
        Configure(builder.Services.AddControllers().ConfigureApplicationPartManager(manager =>
            manager.FeatureProviders.Add(new NestedControllers(Controllers))));
        builder.Services.AddSezzlee();

        _app = builder.Build();
        _app.UseSezzleeCapture();
        _app.UseRouting();
        _app.MapControllers();
        Map(_app);
        _app.MapSezzlee("/mcp");
        await _app.StartAsync();

        _tools = new SezzleeMetaTools(
            _app.Services.GetRequiredService<SezzleeCatalogProvider>(),
            _app.Services.GetRequiredService<SezzleeDispatcher>(),
            _app.Services.GetRequiredService<IInvokeResultMapper>(),
            _app.Services.GetRequiredService<CallerVisibilityProvider>(),
            _app.Services.GetRequiredService<ICallerScopeResolver>(),
            _app.Services.GetRequiredService<IOptions<SezzleeOptions>>(),
            new FixedContext(new DefaultHttpContext()),
            _app.Services.GetRequiredService<ILogger<SezzleeMetaTools>>());
    }

    public async Task DisposeAsync() => await _app.DisposeAsync();

    protected async Task<(JsonElement Raw, bool IsError)> InvokeRawAsync(string name, object arguments)
    {
        CallToolResult result = await _tools.InvokeTool(
            name, JsonSerializer.SerializeToElement(arguments), CancellationToken.None);
        string text = ((TextContentBlock)result.Content[0]).Text;
        return (JsonDocument.Parse(text).RootElement.Clone(), result.IsError == true);
    }

    protected async Task<JsonElement> InvokeAsync(string name, object arguments)
    {
        (JsonElement raw, bool isError) = await InvokeRawAsync(name, arguments);
        Assert.False(isError, raw.GetRawText());
        Assert.Equal(200, raw.GetProperty("status").GetInt32());
        return raw.GetProperty("body");
    }

    protected async Task<JsonNode> LoadInputSchemaAsync(string name)
    {
        CallToolResult result = await _tools.LoadTool(name, CancellationToken.None);
        return JsonNode.Parse(((TextContentBlock)result.Content[0]).Text)!["inputSchema"]!;
    }
}
