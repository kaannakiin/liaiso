import "reflect-metadata";
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  type INestApplication,
} from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { SezzleeArgumentError, SezzleeCatalogError } from "@sezzlee/core";
import { afterEach, describe, expect, it } from "vitest";
import { SezzleeCatalog } from "../src/catalog.js";
import { McpTool, McpToolFamily } from "../src/decorators.js";
import { SezzleeDispatcher } from "../src/dispatcher.js";
import type { McpFamilyMember, McpFamilySource } from "../src/families.js";
import { SezzleeModule } from "../src/sezzlee.module.js";
import type { SezzleeOptions } from "../src/options.js";
import type { VisibilityDeclaration } from "../src/index.js";

class AnonymousGuard {
  canActivate(): boolean {
    return true;
  }

  describeVisibility(): VisibilityDeclaration {
    return { anonymous: "yes", policies: [] };
  }
}

@Controller("Rest")
class DynamicMethodController {
  @Post("InvokeDynamicMethod/:methodId")
  @McpTool({ description: "Invokes a server method by its id." })
  @McpToolFamily({ parameter: "methodId", source: "methods" })
  @UseGuards(AnonymousGuard)
  invoke(
    @Param("methodId") methodId: string,
    @Body() body: Record<string, unknown>,
  ): unknown {
    return { methodId, received: body };
  }
}

@Controller("Legacy")
class UnregisteredSourceController {
  @Post("Invoke/:methodId")
  @McpTool({ description: "Invokes a legacy method by its id." })
  @McpToolFamily({ parameter: "methodId", source: "legacy" })
  @UseGuards(AnonymousGuard)
  invoke(
    @Param("methodId") _methodId: string,
    @Body() _body: Record<string, unknown>,
  ): void {}
}

@Controller("orders")
class OrdersController {
  @Get()
  @McpTool({ name: "list_orders", description: "Siparişleri listeler." })
  @UseGuards(AnonymousGuard)
  list(): unknown[] {
    return [];
  }
}

const balancesKey = "3f2c9a1e-8b4d-4c6a-9e21-7d5b0c4a1f10";

const balances: McpFamilyMember = {
  key: balancesKey,
  name: "list_customer_balances",
  description: "Müşteri bakiyelerini listeler.",
  body: {
    type: "object",
    properties: { minBalance: { type: "number" } },
  },
  readOnly: true,
};

const delayed: McpFamilyMember = {
  key: "b27e5d04-61a3-4f8e-a0c9-2e8d7f13b5a6",
  name: "list_delayed_orders",
  description: "Gecikmiş siparişleri listeler.",
  body: {
    type: "object",
    properties: { days: { type: "integer" } },
    required: ["days"],
  },
};

const sequence =
  (...answers: ReadonlyArray<readonly McpFamilyMember[] | Error>) =>
  (): McpFamilySource => {
    let call = 0;
    return () => {
      const answer = answers[Math.min(call, answers.length - 1)];
      call += 1;
      if (answer instanceof Error) {
        throw answer;
      }
      return answer as readonly McpFamilyMember[];
    };
  };

let open: INestApplication | undefined;

afterEach(async () => {
  await open?.close();
  open = undefined;
});

async function compile(
  configure: (options: SezzleeOptions) => void,
  controllers: NewableFunction[] = [DynamicMethodController, OrdersController],
): Promise<{ moduleRef: TestingModule; app: INestApplication }> {
  const moduleRef = await Test.createTestingModule({
    imports: [SezzleeModule.forRoot(configure)],
    controllers: controllers as never,
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  open = app;
  return { moduleRef, app };
}

async function start(
  source: McpFamilySource,
  configure: (options: SezzleeOptions) => void = () => {},
): Promise<{ catalog: SezzleeCatalog; dispatcher: SezzleeDispatcher }> {
  const { app } = await compile((options) => {
    options.families.provide("methods", source);
    configure(options);
  });
  await app.init();
  return {
    catalog: app.get(SezzleeCatalog),
    dispatcher: app.get(SezzleeDispatcher),
  };
}

const codesOf = (catalog: SezzleeCatalog): string[] =>
  catalog.current.diagnostics.map((diagnostic) => diagnostic.code);

const namesOf = (catalog: SezzleeCatalog): string[] =>
  [...catalog.current.byName.keys()].sort();

describe("tool families", () => {
  it("publishes one tool per member, searchable by its own terms and never by its key", async () => {
    const { catalog } = await start(() => [balances, delayed]);

    expect(namesOf(catalog)).toEqual([
      "list_customer_balances",
      "list_delayed_orders",
      "list_orders",
    ]);
    expect(catalog.current.index.search("bakiye", 10)[0]).toBe(
      "list_customer_balances",
    );
    expect(catalog.current.index.search(balancesKey, 10)).toEqual([]);
    const tool = catalog.find("list_customer_balances")?.tool;
    expect(tool?.inputSchema.properties).toEqual({
      minBalance: { type: "number" },
    });
    expect(tool?.annotations).toEqual({
      destructiveHint: false,
      readOnlyHint: true,
    });
  });

  it("dispatches a member with its own key and refuses the key as an argument", async () => {
    const { catalog, dispatcher } = await start(() => [balances, delayed]);
    const template = catalog.find("list_customer_balances")?.template;
    if (template === undefined) {
      return expect.unreachable("the member has a template");
    }

    const result = await dispatcher.dispatch(
      template,
      { minBalance: 1000 },
      { headers: {} },
    );

    expect(result.status).toBe(201);
    expect(JSON.parse(result.body)).toEqual({
      methodId: balancesKey,
      received: { minBalance: 1000 },
    });
    await expect(
      dispatcher.dispatch(
        template,
        { minBalance: 1000, methodId: delayed.key },
        { headers: {} },
      ),
    ).rejects.toBeInstanceOf(SezzleeArgumentError);
  });

  it("publishes nothing for a family whose source is not registered", async () => {
    const { app } = await compile(() => {}, [UnregisteredSourceController]);
    await app.init();
    const catalog = app.get(SezzleeCatalog);

    expect(namesOf(catalog)).toEqual([]);
    expect(codesOf(catalog)).toContain("unknown_family_source");
  });

  it("drops an ill-formed member and keeps its siblings", async () => {
    const { catalog } = await start(() => [
      balances,
      { ...delayed, name: "List-Delayed" },
    ]);

    expect(namesOf(catalog)).toEqual(["list_customer_balances", "list_orders"]);
    expect(codesOf(catalog)).toContain("family_member_rejected");
  });

  it("drops the family when its source fails before ever returning", async () => {
    const { catalog } = await start(() => {
      throw new Error("database unreachable");
    });

    expect(namesOf(catalog)).toEqual(["list_orders"]);
    expect(codesOf(catalog)).toContain("family_source_failed");
  });

  it("treats a source that outlives its timeout as failed", async () => {
    const { catalog } = await start(
      () => new Promise<never>(() => {}),
      (options) => {
        options.families.loadTimeoutMs = 20;
      },
    );

    expect(codesOf(catalog)).toContain("family_source_failed");
  });

  it("keeps the last members when a reload's load fails", async () => {
    const { catalog } = await start(
      sequence([balances], new Error("database unreachable"))(),
    );
    const generation = catalog.generation;

    await catalog.reload();

    expect(namesOf(catalog)).toEqual(["list_customer_balances", "list_orders"]);
    expect(codesOf(catalog)).toContain("family_source_stale");
    expect(catalog.generation).toBe(generation + 1);
  });

  it("advances the generation and notifies when membership changes", async () => {
    const { catalog } = await start(
      sequence([balances], [balances, delayed])(),
    );
    let notified = 0;
    catalog.onChange(() => {
      notified += 1;
    });

    await catalog.reload();

    expect(namesOf(catalog)).toContain("list_delayed_orders");
    expect(notified).toBe(1);
  });

  it("refuses a reload that would turn a valid catalog fatal and keeps the current one", async () => {
    const { catalog } = await start(
      sequence([balances], [{ ...delayed, name: "list_orders" }])(),
    );
    const generation = catalog.generation;

    await expect(catalog.reload()).rejects.toBeInstanceOf(SezzleeCatalogError);

    expect(namesOf(catalog)).toEqual(["list_customer_balances", "list_orders"]);
    expect(catalog.generation).toBe(generation);
  });

  it("rebuilds a catalog read before its members loaded", async () => {
    const { moduleRef, app } = await compile((options) => {
      options.families.provide("methods", () => [balances]);
    });
    const catalog = moduleRef.get(SezzleeCatalog);
    expect(codesOf(catalog)).toContain("family_not_loaded");
    const generation = catalog.generation;

    await app.init();

    expect(namesOf(catalog)).toContain("list_customer_balances");
    expect(catalog.generation).toBe(generation + 1);
  });
});
