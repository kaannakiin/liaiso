using Microsoft.AspNetCore.Http;

namespace Sezzlee.AspNetCore;

internal sealed class PipelineHolder
{
    public RequestDelegate? Pipeline { get; set; }

    public bool Registered { get; set; }
}
