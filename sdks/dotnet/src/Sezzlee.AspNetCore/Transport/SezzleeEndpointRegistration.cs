using Microsoft.AspNetCore.Http;

namespace Sezzlee.AspNetCore.Transport;

internal sealed class SezzleeEndpointRegistration
{
    public PathString? Pattern { get; set; }
}
