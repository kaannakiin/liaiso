# How to plug in your own search

`search_tools` ranks with BM25 over each operation's name, description, route, arguments and tags.
That works when the agent's words appear in your operations' text. When they do not — a synonym, a
business term, a second language — you have two ways in. Try the first one before the second.

## Add words the operation does not contain

`SearchTerms` is extra search vocabulary. It is indexed like the description, at the same weight,
and it is never shown to the agent: not on the card, not in `load_tool`, not in the answer's `tags`.

```csharp
app.MapGet("/terms/declared", () => "ok")
    .WithMetadata(new McpToolAttribute { Name = "declares_terms", SearchTerms = ["sipariş", "satın alma"] });
```

```ts
@Get()
@McpTool({
  name: "declares_terms",
  description: "Creates a purchase.",
  searchTerms: ["sipariş", "satın alma"],
})
create(): void {}
```

On a controller, an attribute argument has to be an array creation expression, so it is written
`[McpTool(SearchTerms = new[] { "fatura" })]`.

Declaration works the way tags do. The method's declaration wins over the class's, and a method
that declares none keeps the class's. For containers you cannot decorate there is a central rule,
`options.SearchTerms` / `options.searchTerms`, keyed by the container. Unlike tags there is no
default: an operation with no declaration has no search terms.

Two terms that fold alike (`Sipariş`, `siparis`) are reported as `duplicate_search_term` and the
second is dropped, because it would double that word's weight. A term that folds to nothing is
reported as `empty_search_term`.

For the OpenAPI gateway, put the terms on the operation in the document:

```json
{
  "post": {
    "operationId": "createOrder",
    "x-liaiso-search-terms": ["sipariş", "  ", "satın alma"],
    "responses": { "200": { "description": "ok" } }
  }
}
```

A blank entry is dropped, and a value that is not an array of strings is reported as
`search_terms_invalid` and ignored. When you cannot edit the document, the gateway configuration
takes the same vocabulary keyed by operation, and it replaces the extension for that operation:

```json
{ "searchTerms": { "GET /orders": ["katalog"] } }
```

## Replace the ranking

If you already run a retriever — a vector index, an embedding service — bind it as the ranker. It
receives the query and the catalog, and returns tool names, most relevant first. The examples below
bind a ranker that answers a fixed list, which is what the SDKs' own tests do; yours calls your
retriever at that point.

```csharp
internal sealed class StubRanker(Func<ToolRankRequest, CancellationToken, Task<IReadOnlyList<string>>> answer) : IToolRanker
{
    public async ValueTask<IReadOnlyList<string>> RankAsync(ToolRankRequest request, CancellationToken cancellationToken) =>
        await answer(request, cancellationToken);
}

IToolRanker ranker = new StubRanker((_, _) => Task.FromResult<IReadOnlyList<string>>(["ghost", "ranked_two", "ranked_one"]));
builder.Services.AddSingleton(ranker);
builder.Services.AddLiaiso(options => options.Search.RankerTimeout = TimeSpan.FromMilliseconds(50));
```

```ts
const ranker: ToolRanker = {
  rank: async () => ["audit_log", "list_orders", "get_order"],
};

LiaisoModule.forRoot(
  (options) => {
    options.search.rankerTimeoutMs = 20;
  },
  { toolRanker: { useValue: ranker } },
);
```

`useClass` and `useFactory` work as for every other extension point, so a ranker with its own
dependencies is an `@Injectable()` class. Your controller does not change: the ranker reaches
`search_tools` through the catalog that `registerLiaisoTools` already receives.

To embed the OpenAPI gateway in your own process, pass the ranker to `createOpenApiMcpServer` as
`{ ranker: { ranker, timeoutMs, onFailure } }`. The `liaiso-openapi` CLI reads only a JSON
configuration, so it cannot bind one.

### What the ranker decides, and what it does not

The ranker decides **order and relevance**. A tool it leaves out is not in the result, and an empty
list is an empty result. Everything else stays in the SDK, whatever the ranker answers:

- A tool the caller may not see is removed from its answer, so a ranker cannot leak one. In the tests
  these examples come from, `audit_log` is hidden from the caller and `ghost` does not exist, and
  neither is in the result.
- A name that is not in the catalog is dropped, and a repeated name keeps its first position. Both
  are logged on the host, never shown to the agent.
- The `tags` filter, `limit`, `total`, card or schema shape, and the payload budget apply as usual.

The ranker receives the catalog as documents projected from the **published** schemas, so an
argument you hid never reaches it. It does not receive the caller's identity. Authorization belongs
in your pipeline, not in search.

An empty query is a listing and never reaches the ranker.

### When the ranker fails

The ranker runs under its own deadline: 10 seconds by default, zero for none. A retriever that is
slow for a large catalog is expected, so set the deadline to what yours needs. Past 60 seconds a
stock MCP client gives up first.

A missed deadline, a throw, or an answer that is not a list of names is a failure. The host's
setting (`options.Search.OnRankerFailure` / `options.search.onRankerFailure`) decides what happens
next:

| Setting              | What the agent gets                                                   |
| -------------------- | --------------------------------------------------------------------- |
| `fallback` (default) | A normal answer ranked by BM25. The failure is logged on the host     |
| `error`              | `search_ranker_unavailable`, `retryable: true`. Nothing else is shown |

If the caller cancels, that is not a failure: the call stops, with no fallback and no error.

`catalog.version` changes whenever the catalog is rebuilt, for example on a reload or when a
family source loads. Re-embed when it changes.
