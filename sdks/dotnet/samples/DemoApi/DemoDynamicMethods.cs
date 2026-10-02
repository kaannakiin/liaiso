using System.Text.Json.Nodes;
using Sezzlee.AspNetCore.Discovery;

namespace DemoApi;

/// <remarks>
/// Stands in for a backend's own table of dispatchable methods. The agent-client <c>family</c>
/// scenario asserts these names, keys and bodies, and the NestJS demo carries the same three.
/// </remarks>
public static class DemoDynamicMethods
{
    public const string Source = "dynamic-methods";

    public static readonly IReadOnlyList<McpFamilyMember> Members =
    [
        new(
            Guid.Parse("3f2c9a1e-8b4d-4c6a-9e21-7d5b0c4a1f10"),
            "list_customer_balances",
            "Lists customer balances, optionally above a minimum.",
            new JsonObject
            {
                ["type"] = "object",
                ["properties"] = new JsonObject
                {
                    ["minBalance"] = new JsonObject
                    {
                        ["type"] = "number",
                        ["description"] = "Lowest balance to include.",
                    },
                },
            })
        {
            ReadOnly = true,
        },
        new(
            Guid.Parse("b27e5d04-61a3-4f8e-a0c9-2e8d7f13b5a6"),
            "list_delayed_orders",
            "Lists orders delivered later than promised.",
            new JsonObject
            {
                ["type"] = "object",
                ["properties"] = new JsonObject
                {
                    ["days"] = new JsonObject { ["type"] = "integer", ["minimum"] = 1 },
                },
                ["required"] = new JsonArray("days"),
            })
        {
            ReadOnly = true,
        },
        new(
            Guid.Parse("e91b3c7f-0d2a-48e5-b6f4-5a1c9d8e2b07"),
            "assign_courier",
            "Assigns a courier to an order.",
            new JsonObject
            {
                ["type"] = "object",
                ["properties"] = new JsonObject
                {
                    ["orderNumber"] = new JsonObject { ["type"] = "string" },
                    ["courierCode"] = new JsonObject { ["type"] = "string" },
                },
                ["required"] = new JsonArray("orderNumber", "courierCode"),
            })
        {
            Destructive = true,
        },
    ];

    public static ValueTask<IReadOnlyList<McpFamilyMember>> LoadAsync(
        IServiceProvider services, CancellationToken cancellationToken) => ValueTask.FromResult(Members);

    public static McpFamilyMember? Find(string key) =>
        Members.FirstOrDefault(m => string.Equals(m.Key.ToString(), key, StringComparison.OrdinalIgnoreCase));
}
