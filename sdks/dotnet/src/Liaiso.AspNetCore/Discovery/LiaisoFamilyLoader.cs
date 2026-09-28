using Microsoft.Extensions.Hosting;

namespace Liaiso.AspNetCore.Discovery;

internal sealed class LiaisoFamilyLoader(LiaisoCatalogProvider catalog) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken) => catalog.LoadFamiliesAsync(cancellationToken);

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
