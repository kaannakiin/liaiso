import { describe, expect, it } from "vitest";
import {
  buildCatalog,
  SezzleeDispatchAborted,
  searchCatalog,
  type Auth,
  type CatalogBuild,
  type CatalogCandidate,
  type EndpointDescriptor,
  type RankerEvent,
  type RankRequest,
  type SearchRankerOptions,
  type ToolRanker,
  type VisibilityDecision,
} from "../src/index.js";

const auth: Auth = { anonymous: "no", policies: [], imperative: false };

const operation = (
  operationId: string,
  route: string,
  extra: Partial<EndpointDescriptor> = {},
): EndpointDescriptor => ({
  operationId,
  method: "GET",
  route,
  auth,
  ...extra,
});

const candidate = (
  descriptor: EndpointDescriptor,
  searchTerms?: readonly string[],
): CatalogCandidate => ({
  source: {},
  owner: `${descriptor.method} ${descriptor.route}`,
  descriptor,
  ...(searchTerms === undefined ? {} : { searchTerms }),
  declare: () => descriptor,
});

const build = (candidates: readonly CatalogCandidate[]): CatalogBuild =>
  buildCatalog(candidates, {
    selection: { default: "include" },
    providers: { has: () => false },
    severity: () => "warning",
    failOn: "fatal",
  });

const byId: Partial<EndpointDescriptor> = {
  parameters: [
    { name: "id", in: "path", required: true, schema: { type: "integer" } },
  ],
};

const catalog = build([
  candidate(operation("GetOrder", "/orders/{id}", byId)),
  candidate(operation("ListOrders", "/orders")),
  candidate(operation("Health", "/health")),
  candidate(operation("AuditLog", "/audit")),
]);

interface Answer {
  readonly total: number;
  readonly results: readonly { readonly name: string }[];
}

const hidden = new Set(["audit_log"]);

async function search(
  query: string,
  ranker: Partial<SearchRankerOptions> & { ranker: ToolRanker },
  extra: { signal?: AbortSignal; tags?: readonly string[] } = {},
) {
  const events: RankerEvent[] = [];
  const response = await searchCatalog({
    catalog,
    query,
    limit: undefined,
    detail: undefined,
    tags: extra.tags,
    decide: (entry): VisibilityDecision =>
      hidden.has(entry.tool.name) ? "deny" : "allow",
    visible: (decision) => decision !== "deny",
    ranker: {
      timeoutMs: 1_000,
      onFailure: "fallback",
      report: (event) => events.push(event),
      ...ranker,
    },
    ...(extra.signal === undefined ? {} : { signal: extra.signal }),
  });
  return { response, events };
}

const namesOf = (payload: unknown): readonly string[] =>
  (payload as Answer).results.map((result) => result.name);

const answering = (names: unknown): ToolRanker => ({
  rank: async () => names as readonly string[],
});

describe("searchCatalog with a host ranker", () => {
  it("returns the ranker's order and still applies visibility", async () => {
    const { response } = await search("order", {
      ranker: answering(["audit_log", "health", "list_orders"]),
    });

    expect(response.isError).toBe(false);
    expect(namesOf(response.payload)).toEqual(["health", "list_orders"]);
    expect((response.payload as Answer).total).toBe(3);
  });

  it("hands the ranker the published documents and a live signal, never a caller", async () => {
    let seen: RankRequest | undefined;
    await search("order", {
      ranker: {
        rank: async (request) => {
          seen = request;
          return [];
        },
      },
    });

    expect(seen?.query).toBe("order");
    expect(seen?.catalog).toBe(catalog.rankCatalog);
    expect(seen?.signal.aborted).toBe(false);
    expect(Object.keys(seen ?? {}).sort()).toEqual([
      "catalog",
      "query",
      "signal",
    ]);
    expect(Object.isFrozen(catalog.rankCatalog.documents)).toBe(true);
  });

  it("never consults the ranker for a listing", async () => {
    let calls = 0;
    const { response } = await search("", {
      ranker: {
        rank: async () => {
          calls += 1;
          return [];
        },
      },
    });

    expect(calls).toBe(0);
    expect(namesOf(response.payload)).toEqual([
      "get_order",
      "health",
      "list_orders",
    ]);
  });

  it("reports dropped names on the host channel only", async () => {
    const { response, events } = await search("order", {
      ranker: answering(["ghost", "get_order", "get_order"]),
    });

    expect(namesOf(response.payload)).toEqual(["get_order"]);
    expect(events).toEqual([
      { kind: "ignored", unknown: ["ghost"], duplicate: ["get_order"] },
    ]);
    expect(JSON.stringify(response.payload)).not.toContain("ghost");
  });

  it("falls back to BM25 when the ranker misses its deadline", async () => {
    const { response, events } = await search("order", {
      timeoutMs: 10,
      ranker: { rank: () => new Promise<readonly string[]>(() => undefined) },
    });

    expect(namesOf(response.payload)).toEqual(["list_orders", "get_order"]);
    expect(events).toEqual([{ kind: "fallback", reason: "timeout" }]);
  });

  it("falls back when the ranker throws, even synchronously", async () => {
    const failure = new Error("vector store down");
    const { response, events } = await search("order", {
      ranker: {
        rank: () => {
          throw failure;
        },
      },
    });

    expect(namesOf(response.payload)).toEqual(["list_orders", "get_order"]);
    expect(events).toEqual([
      { kind: "fallback", reason: "threw", error: failure },
    ]);
  });

  it("falls back on an answer that is not a list of names", async () => {
    const { events } = await search("order", {
      ranker: answering({ names: ["health"] }),
    });

    expect(events).toEqual([{ kind: "fallback", reason: "invalid_answer" }]);
  });

  it("refuses with a retryable envelope when the host chose error", async () => {
    const { response } = await search("order", {
      onFailure: "error",
      ranker: answering("health"),
    });

    expect(response.isError).toBe(true);
    expect(response.payload).toEqual({
      error: "search_ranker_unavailable",
      message:
        "Search is unavailable: the ranker did not answer this query. Call search_tools again later.",
      retryable: true,
    });
  });

  it("propagates the caller's cancellation instead of falling back", async () => {
    const caller = new AbortController();
    const pending = search(
      "order",
      {
        ranker: { rank: () => new Promise<readonly string[]>(() => undefined) },
      },
      { signal: caller.signal },
    );
    caller.abort();

    await expect(pending).rejects.toBeInstanceOf(SezzleeDispatchAborted);
  });

  it("applies the tag filter to the ranker's answer without reordering it", async () => {
    const tagged = build([
      candidate(
        operation("GetOrder", "/orders/{id}", { ...byId, tags: ["Orders"] }),
      ),
      candidate(operation("ListOrders", "/orders", { tags: ["Orders"] })),
      candidate(operation("Health", "/health", { tags: ["System"] })),
    ]);
    const response = await searchCatalog({
      catalog: tagged,
      query: "order",
      limit: undefined,
      detail: undefined,
      tags: ["orders"],
      decide: () => "allow",
      visible: () => true,
      ranker: {
        ranker: answering(["health", "list_orders", "get_order"]),
        timeoutMs: 0,
        onFailure: "fallback",
      },
    });

    expect(namesOf(response.payload)).toEqual(["list_orders", "get_order"]);
  });
});

describe("searchTerms in the catalog", () => {
  it("indexes declared terms and cleans them like tags", () => {
    const built = build([
      candidate(operation("CreateOrder", "/orders", { method: "POST" }), [
        "Sipariş",
        "siparis",
        "",
      ]),
    ]);

    expect(built.entries[0]?.descriptor.searchTerms).toEqual(["Sipariş"]);
    expect(
      built.diagnostics
        .map((diagnostic) => diagnostic.code)
        .filter((code) => code.endsWith("_search_term")),
    ).toEqual(["duplicate_search_term", "empty_search_term"]);
    expect(built.index.search("sipar", 10)).toEqual(["create_order"]);
    expect(built.rankCatalog.documents[0]?.searchTerms).toEqual(["Sipariş"]);
  });

  it("prefers the candidate's declaration over the descriptor's own", () => {
    const built = build([
      candidate(
        operation("CreateOrder", "/orders", { searchTerms: ["from-document"] }),
        ["from-host"],
      ),
    ]);

    expect(built.entries[0]?.descriptor.searchTerms).toEqual(["from-host"]);
  });
});
