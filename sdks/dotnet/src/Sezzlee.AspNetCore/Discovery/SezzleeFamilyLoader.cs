using Microsoft.Extensions.Hosting;

namespace Sezzlee.AspNetCore.Discovery;

internal sealed class SezzleeFamilyLoader(SezzleeCatalogProvider catalog) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken) => catalog.LoadFamiliesAsync(cancellationToken);

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
