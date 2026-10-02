using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sezzlee.AspNetCore.Discovery;

namespace DemoApi.Controllers;

/// <remarks>
/// One route dispatching on a method id, published as one tool per method. The response echoes
/// the key the route received and the method it resolved to, which is the direct evidence that
/// the constant the composer wrote is the one the dispatcher read.
/// </remarks>
[ApiController]
public sealed class DynamicMethodsController : ControllerBase
{
    [HttpPost("/Rest/InvokeDynamicMethod/{methodId}")]
    [Authorize]
    [McpTool(Description = "Invokes a server method by its id.")]
    [McpToolFamily("methodId", Source = DemoDynamicMethods.Source)]
    public IActionResult Invoke(string methodId, [FromBody] JsonElement body) =>
        DemoDynamicMethods.Find(methodId) is { } method
            ? Ok(new { methodId, method = method.Name, received = body })
            : NotFound();
}
