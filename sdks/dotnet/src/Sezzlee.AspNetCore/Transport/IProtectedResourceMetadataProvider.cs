using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using ModelContextProtocol.Authentication;

namespace Sezzlee.AspNetCore.Transport;

public interface IProtectedResourceMetadataProvider
{
    ValueTask<ProtectedResourceMetadata?> GetAsync(HttpContext context, CancellationToken cancellationToken);
}

internal sealed class OptionsProtectedResourceMetadataProvider(IOptions<SezzleeOptions> options)
    : IProtectedResourceMetadataProvider
{
    public ValueTask<ProtectedResourceMetadata?> GetAsync(HttpContext context, CancellationToken cancellationToken) =>
        new(options.Value.ResourceServer.Metadata);
}
