using Microsoft.Extensions.Options;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace Sezzlee.AspNetCore.Transport;

internal sealed class ToolCollectionSetup(IOptions<SezzleeOptions> sezzleeOptions) : IPostConfigureOptions<McpServerOptions>
{
    public void PostConfigure(string? name, McpServerOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        SezzleeToolCollection collection = new();
        IEnumerable<McpServerTool> existing = options.ToolCollection ?? [];
        foreach (McpServerTool tool in existing)
        {
            collection.Add(new SezzleeBudgetTool(tool, sezzleeOptions));
        }
        options.ToolCollection = collection;

        options.Capabilities ??= new ServerCapabilities();
        options.Capabilities.Tools ??= new ToolsCapability();
        options.Capabilities.Tools.ListChanged = true;
    }
}
