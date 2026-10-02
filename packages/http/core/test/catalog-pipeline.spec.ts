import { describe, expect, it } from "vitest";
import {
  buildCatalog,
  compose,
  SezzleeArgumentError,
  type CatalogCandidate,
  type Auth,
  type EndpointDescriptor,
  type JsonSchemaObject,
  type ToolVariant,
} from "../src/index.js";

const auth: Auth = { anonymous: "no", policies: [], imperative: false };

const balancesKey = "3f2c9a1e-8b4d-4c6a-9e21-7d5b0c4a1f10";

const member = (
  name: string,
  description: string,
  key: string,
  properties: Record<string, JsonSchemaObject>,
): ToolVariant => ({
  name,
  description,
  arguments: [{ name: "methodId", hidden: { kind: "constant", value: key } }],
  requestBody: { schema: { type: "object", properties } },
});

const dispatcher: EndpointDescriptor = {
  operationId: "InvokeDynamicMethod",
  container: "DynamicMethodController",
  method: "POST",
  route: "/Rest/InvokeDynamicMethod/{methodId}",
  parameters: [
    {
      name: "methodId",
      in: "path",
      required: true,
      schema: { type: "string" },
    },
  ],
  requestBody: { schema: { type: "object" } },
  family: { parameter: "methodId" },
  variants: [
    member(
      "list_customer_balances",
      "Müşteri bakiyelerini listeler.",
      balancesKey,
      { minBalance: { type: "number" } },
    ),
    member(
      "list_delayed_orders",
      "Gecikmiş siparişleri listeler.",
      "b27e5d04-61a3-4f8e-a0c9-2e8d7f13b5a6",
      { days: { type: "integer" } },
    ),
  ],
  auth,
};

const candidate = (descriptor: EndpointDescriptor): CatalogCandidate => ({
  source: {},
  owner: `${descriptor.method} ${descriptor.route}`,
  descriptor,
  declare: () => descriptor,
});

const build = (descriptors: readonly EndpointDescriptor[]) =>
  buildCatalog(descriptors.map(candidate), {
    selection: { default: "include" },
    providers: { has: () => false },
    severity: () => "endpointDropped",
    failOn: "fatal",
  });

describe("buildCatalog", () => {
  it("drops only the operation whose declaration is refused", () => {
    const conflicting: EndpointDescriptor = {
      operationId: "Report",
      method: "GET",
      route: "/reports",
      toolName: "run_report",
      variants: [{ name: "run_sales_report", description: "Sales." }],
      auth,
    };
    const plain: EndpointDescriptor = {
      operationId: "ListOrders",
      method: "GET",
      route: "/orders",
      auth,
    };

    const catalog = build([conflicting, plain]);

    expect(catalog.entries.map((entry) => entry.tool.name)).toEqual([
      "list_orders",
    ]);
    expect(catalog.diagnostics.map((d) => d.code)).toContain(
      "variant_declaration_conflict",
    );
  });

  it("publishes a family member per tool, searchable by its own terms", () => {
    const catalog = build([dispatcher]);

    expect(catalog.entries.map((entry) => entry.tool.name)).toEqual([
      "list_customer_balances",
      "list_delayed_orders",
    ]);
    expect(catalog.index.search("bakiye", 10)[0]).toBe(
      "list_customer_balances",
    );
    expect(catalog.index.search(balancesKey, 10)).toEqual([]);
    for (const entry of catalog.entries) {
      expect(entry.tool.inputSchema.properties).not.toHaveProperty("methodId");
    }
  });

  it("writes the member key into the dispatch segment and refuses it as an argument", () => {
    const entry = build([dispatcher]).byName.get("list_customer_balances");
    const template = entry?.template;
    if (template === undefined) {
      return expect.unreachable("the member has a template");
    }

    const composed = compose(template, { minBalance: 1000 });

    expect(composed.pathAndQuery).toBe(
      `/Rest/InvokeDynamicMethod/${balancesKey}`,
    );
    expect(composed.body).toMatchObject({ value: { minBalance: 1000 } });
    expect(() =>
      compose(template, { minBalance: 1000, methodId: "other" }),
    ).toThrow(SezzleeArgumentError);
  });

  it("publishes nothing for a family without members", () => {
    const { variants: _variants, ...empty } = dispatcher;

    const catalog = build([empty]);

    expect(catalog.entries).toEqual([]);
    expect(catalog.diagnostics.map((d) => d.code)).toEqual([
      "family_without_members",
    ]);
  });
});
