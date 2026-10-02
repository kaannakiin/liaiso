import { describe, expect, it } from "vitest";
import { buildGatewayCatalog, configSchema } from "../src/index.js";

const document = {
  openapi: "3.1.0",
  info: { title: "t", version: "1" },
  servers: [{ url: "https://api.test/v1" }],
  security: [],
  paths: {
    "/orders": {
      post: {
        operationId: "createOrder",
        "x-sezzlee-search-terms": ["sipariş"],
        responses: { "200": { description: "ok" } },
      },
      get: {
        operationId: "listOrders",
        "x-sezzlee-search-terms": ["from-document"],
        responses: { "200": { description: "ok" } },
      },
    },
  },
};

async function build(searchTerms: Record<string, string[]>) {
  return buildGatewayCatalog(
    document,
    configSchema.parse({
      source: "inline",
      selection: { default: "include" },
      searchTerms,
    }),
    new Map(),
    [],
    undefined,
    undefined,
  );
}

describe("gateway search terms", () => {
  it("carries the document's extension into the index", async () => {
    const { catalog } = await build({});

    expect(catalog.byName.get("create_order")?.descriptor.searchTerms).toEqual([
      "sipariş",
    ]);
    expect(catalog.index.search("sipar", 10)).toEqual(["create_order"]);
  });

  it("lets the configuration replace the extension for one operation", async () => {
    const { catalog } = await build({ "GET /orders": ["katalog"] });

    expect(catalog.byName.get("list_orders")?.descriptor.searchTerms).toEqual([
      "katalog",
    ]);
    expect(catalog.index.search("from-document", 10)).toEqual([]);
  });
});
