import "reflect-metadata";
import { Controller, Get, UseGuards } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { McpServer } from "@modelcontextprotocol/server";
import { afterAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { LiaisoCatalog } from "../src/catalog.js";
import type { CallerScopeResolver } from "../src/cache.js";
import { McpTool } from "../src/decorators.js";
import { LiaisoDispatcher } from "../src/dispatcher.js";
import { extensionTokens } from "../src/extension-points.js";
import type {
  RankRequest,
  ToolRanker,
  VisibilityDeclaration,
} from "../src/index.js";
import type { InvokeResultMapper } from "../src/invoke-result-mapper.js";
import { LiaisoModule } from "../src/liaiso.module.js";
import { registerLiaisoTools } from "../src/meta-tools.js";
import { LIAISO_OPTIONS, type LiaisoOptions } from "../src/options.js";
import { CallerVisibilityProvider } from "../src/visibility/provider.js";

class AnonymousGuard {
  canActivate(): boolean {
    return true;
  }

  describeVisibility(): VisibilityDeclaration {
    return { anonymous: "yes", policies: [] };
  }
}

class DeniedGuard {
  canActivate(): boolean {
    return false;
  }

  describeVisibility(): VisibilityDeclaration {
    return { anonymous: "no", policies: [] };
  }
}

@Controller()
class OrdersController {
  @Get("orders/:id")
  @McpTool({ name: "get_order", description: "Fetches one order." })
  @UseGuards(AnonymousGuard)
  getOrder(): void {}

  @Get("orders")
  @McpTool({ name: "list_orders", description: "Lists orders." })
  @UseGuards(AnonymousGuard)
  listOrders(): void {}

  @Get("audit")
  @McpTool({ name: "audit_log", description: "Reads the audit log." })
  @UseGuards(DeniedGuard)
  audit(): void {}
}

interface Wire {
  readonly content: { readonly text: string }[];
  readonly isError?: boolean;
}

type Handler = (args: Record<string, unknown>, ctx: unknown) => Promise<Wire>;

const apps: INestApplication[] = [];

async function searchWith(
  ranker: ToolRanker | undefined,
  configure: (options: LiaisoOptions) => void = () => undefined,
): Promise<(args: Record<string, unknown>) => Promise<Wire>> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      LiaisoModule.forRoot(
        (options) => {
          options.visibility.onUnknown = "hide";
          configure(options);
        },
        ranker === undefined ? undefined : { toolRanker: { useValue: ranker } },
      ),
    ],
    controllers: [OrdersController],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  apps.push(app);
  const handlers = new Map<string, Handler>();
  const server = {
    registerTool: (name: string, _config: unknown, handler: Handler) => {
      handlers.set(name, handler);
    },
  } as unknown as McpServer;
  registerLiaisoTools(server, {
    catalog: app.get(LiaisoCatalog),
    dispatcher: app.get(LiaisoDispatcher),
    mapper: app.get<InvokeResultMapper>(extensionTokens.invokeResultMapper),
    visibility: app.get(CallerVisibilityProvider),
    scopes: app.get<CallerScopeResolver>(extensionTokens.callerScopeResolver),
    options: app.get<LiaisoOptions>(LIAISO_OPTIONS),
  });
  const search = handlers.get("search_tools") as Handler;
  return (args) => search({ limit: 20, detail: "card", ...args }, {});
}

const namesOf = (wire: Wire): readonly string[] =>
  (
    JSON.parse(wire.content[0]?.text ?? "{}") as {
      results: { name: string }[];
    }
  ).results.map((result) => result.name);

afterAll(async () => {
  await Promise.all(apps.map((app) => app.close()));
});

describe("host ranker", () => {
  it("is reached through the extension token with no change to the host's wiring", async () => {
    let seen: RankRequest | undefined;
    const search = await searchWith({
      rank: async (request) => {
        seen = request;
        return ["audit_log", "list_orders", "get_order"];
      },
    });

    const wire = await search({ query: "order" });

    expect(namesOf(wire)).toEqual(["list_orders", "get_order"]);
    expect(
      seen?.catalog.documents.map((document) => document.name).sort(),
    ).toEqual(["audit_log", "get_order", "list_orders"]);
  });

  it("is absent by default, which leaves BM25 in place", async () => {
    const search = await searchWith(undefined);

    expect(namesOf(await search({ query: "order" }))).toEqual([
      "list_orders",
      "get_order",
    ]);
  });

  it("falls back to BM25 when it misses the host's deadline", async () => {
    const search = await searchWith(
      { rank: () => new Promise<readonly string[]>(() => undefined) },
      (options) => {
        options.search.rankerTimeoutMs = 20;
      },
    );

    const wire = await search({ query: "order" });

    expect(wire.isError).not.toBe(true);
    expect(namesOf(wire)).toEqual(["list_orders", "get_order"]);
  });

  it("refuses when the host chose error over fallback", async () => {
    const search = await searchWith(
      {
        rank: async () => {
          throw new Error("vector store down");
        },
      },
      (options) => {
        options.search.onRankerFailure = "error";
      },
    );

    const wire = await search({ query: "order" });

    expect(wire.isError).toBe(true);
    expect(JSON.parse(wire.content[0]?.text ?? "{}")).toMatchObject({
      error: "search_ranker_unavailable",
      retryable: true,
    });
    expect(wire.content[0]?.text).not.toContain("vector store");
  });

  it("rejects a negative deadline at configuration time", async () => {
    await expect(
      searchWith(undefined, (options) => {
        options.search.rankerTimeoutMs = -1;
      }),
    ).rejects.toThrow("search.rankerTimeoutMs");
  });
});
