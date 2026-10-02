using Microsoft.Extensions.Primitives;

namespace Sezzlee.AspNetCore;

public interface ISezzleeCatalogChangeSource
{
    long Generation { get; }

    IChangeToken GetChangeToken();

    ValueTask ReloadAsync(CancellationToken cancellationToken = default);
}
