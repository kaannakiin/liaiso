using ModelContextProtocol.Server;

namespace Sezzlee.AspNetCore.Transport;

internal sealed class SezzleeToolCollection() : McpServerPrimitiveCollection<McpServerTool>(StringComparer.Ordinal)
{
    public void NotifyChanged() => RaiseChanged();
}
