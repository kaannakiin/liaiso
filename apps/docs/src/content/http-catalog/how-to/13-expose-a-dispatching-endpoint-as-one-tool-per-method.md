# How to expose a dispatching endpoint as one tool per method

Some backends route many capabilities through one endpoint: `POST /Rest/InvokeDynamicMethod/{methodId}`,
where each `methodId` names a different server method with a different body. Published as one tool,
that endpoint is unusable — the agent does not know which ids exist, what each one does, or what body
each one takes, and search can only ever return the one generic tool.

A **tool family** publishes the endpoint as one tool per method instead. Each member has its own name,
description, body schema and behaviour hints, and its id is written into the route by the SDK, so the
agent never sees it.

Use a family when the id selects a **capability**: a different id means a different body and a
different action. When the id selects a **record** — `GET /orders/{orderId}` — it is an ordinary
argument and one tool is right.

## Declare the family

Mark the dispatch parameter and name the source the members come from. The endpoint still needs its
selection marker.

```csharp
[HttpPost("/Rest/InvokeDynamicMethod/{methodId}")]
[Authorize]
[McpTool(Description = "Invokes a server method by its id.")]
[McpToolFamily("methodId", Source = DemoDynamicMethods.Source)]
public IActionResult Invoke(string methodId, [FromBody] JsonElement body) =>
    DemoDynamicMethods.Find(methodId) is { } method
        ? Ok(new { methodId, method = method.Name, received = body })
        : NotFound();
```

```ts
@Post("InvokeDynamicMethod/:methodId")
@HttpCode(200)
@McpTool({ description: "Invokes a server method by its id." })
@McpToolFamily({ parameter: "methodId", source: dynamicMethodsSource })
@UseGuards(JwtGuard)
invoke(
  @Param("methodId") methodId: string,
  @Body() body: Record<string, unknown>,
): unknown { ... }
```

The endpoint's own body can stay opaque (`JsonElement`, `Record<string, unknown>`): each member
declares its own.

## Provide the members

A source returns one entry per method: the key the route expects, a tool name, a description, the
body as JSON Schema, and optionally whether the method only reads or destroys data.

```csharp
builder.Services.AddSezzlee(options =>
{
    options.Families.Provide(DemoDynamicMethods.Source, DemoDynamicMethods.LoadAsync);
});
```

```csharp
new McpFamilyMember(
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
```

```ts
SezzleeModule.forRoot((options) => {
  options.families.provide(dynamicMethodsSource, () => dynamicMethods);
});
```

```ts
{
  key: "e91b3c7f-0d2a-48e5-b6f4-5a1c9d8e2b07",
  name: "assign_courier",
  description: "Assigns a courier to an order.",
  body: {
    type: "object",
    properties: {
      orderNumber: { type: "string" },
      courierCode: { type: "string" },
    },
    required: ["orderNumber", "courierCode"],
  },
  destructive: true,
},
```

A source is usually a query against the table your backend already dispatches from. It runs once at
startup and again on every reload — never per request — and every caller sees the same members.

- **ASP.NET Core:** the delegate receives an `IServiceProvider` from its own scope, so it can resolve a
  `DbContext`. There is no `HttpContext` while it runs.
- **NestJS:** the source runs in `onApplicationBootstrap`, after your own providers are ready, and
  receives an `AbortSignal` that fires at `options.families.loadTimeoutMs`.

Write the description for the agent, not for the method's author: it is what search ranks the member
by.

## Reload when the methods change

Members are loaded again when you reload the catalog:

```csharp
await app.Services.GetRequiredService<ISezzleeCatalogChangeSource>().ReloadAsync();
```

```ts
await app.get(SezzleeCatalog).reload();
```

A reload advances the catalog generation and sends `tools/list_changed`. It is refused, and the
current catalog kept, when the new members would make the catalog fatal — typically a member whose
name another tool already has. If the source fails, the members it last returned stay published and
`family_source_stale` is reported.

## What the agent sees

The demos carry the same three members. Driving one of them with the
[agent-client](https://github.com/sezzlee/mcp/tree/main/sdks/nestjs/samples/agent-client) against
either demo:

```sh
SEZZLEE_AUTH=token SEZZLEE_USER=alice node sdks/nestjs/samples/agent-client/dist/main.js --scenario family
```

```text
step                                   ok    detail
search_tools "courier"                 ok    assign_courier
load_tool assign_courier               ok    {"properties":["orderNumber","courierCode"],"annotations":{"destructiveHint":true}}
invoke_tool assign_courier             ok    {"status":200,"body":{"methodId":"e91b3c7f-0d2a-48e5-b6f4-5a1c9d8e2b07","method":"assign_courier","received":{"orderNumber":"ORD-1001","courierCode":"COURIER-7"}}}
invoke_tool assign_courier + methodId  ok    {"error":"unknown_argument","message":"Unknown argument(s): methodId. Allowed: courierCode, orderNumber.","retryable":false}
search_tools <member key>              ok    0 results
```

Search found the member by its own description, its schema carries only its own fields, the backend
received the member's key, sending `methodId` anyway was refused rather than routed to another
method, and the key is not a search term.

## If a member is missing

Look for these codes in the startup log ([How to find out why a tool is missing](/docs/http-catalog/find-out-why-a-tool-is-missing)):

- `family_member_rejected` — one member was dropped: its name does not match the tool-name pattern,
  its description is empty, its name or key repeats another's, or its body schema references outside
  its own `$defs`. The rest of the family is kept.
- `unknown_family_source`, `family_source_failed` — no member was published: the source is not
  registered, or it failed before it ever returned.
- `name_collision` — a member has the name of another tool. This one is fatal.

## What a family will not do

- **Authorize per method.** Every member shares the endpoint's authorization and visibility. Whether
  a caller may run a given method is your dispatcher's decision, exactly as it is for your existing
  clients.
- **Vary by caller.** Every caller sees the same members. A caller who may not run a method still
  sees it, and your backend refuses the call.
- **Hide the parameter's name.** The route every member shares still contains `methodId`, so a
  search for "method" matches all of them. Only the key's value is withheld.

The normative rules are in
[tool-families.md](https://github.com/sezzlee/mcp/blob/main/packages/http/spec/tool-families.md).
