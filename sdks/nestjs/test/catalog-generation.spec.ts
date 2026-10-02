import "reflect-metadata";
import {
  All,
  Controller,
  Get,
  Req,
  Res,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { McpServer } from "@modelcontextprotocol/server";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import type { Request, Response } from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CallerScopeResolver } from "../src/cache.js";
import { SezzleeCatalog } from "../src/catalog.js";
import { McpTool } from "../src/decorators.js";
import { SezzleeDispatcher } from "../src/dispatcher.js";
import { extensionTokens } from "../src/extension-points.js";
import type { InvokeResultMapper } from "../src/invoke-result-mapper.js";
import {
  catalogGenerationMetaKey,
  registerSezzleeTools,
} from "../src/meta-tools.js";
import { SEZZLEE_OPTIONS, type SezzleeOptions } from "../src/options.js";
import { SezzleeModule } from "../src/sezzlee.module.js";
import {
  SezzleeStreamableHttp,
  type SezzleeRequestHandler,
} from "../src/transport/streamable-http.js";
import { CallerVisibilityProvider } from "../src/visibility/provider.js";

interface Connected {
  ip?: string;
  socket: { remoteAddress?: string; remotePort?: number };
}

@Controller()
@McpTool()
class EchoController {
  @Get("whoami")
  whoami(@Req() req: Request): {
    ip: string | undefined;
    remoteAddress: string | undefined;
    remotePort: number | undefined;
  } {
    const connected = req as unknown as Connected;
    return {
      ip: connected.ip,
      remoteAddress: connected.socket.remoteAddress,
      remotePort: connected.socket.remotePort,
    };
  }
}

let mapper: InvokeResultMapper | undefined;
let scopes: CallerScopeResolver | undefined;
let options: SezzleeOptions | undefined;

@Controller()
class GenerationMcpController {
  private readonly serve: SezzleeRequestHandler;

  constructor(
    private readonly streamableHttp: SezzleeStreamableHttp,
    private readonly catalog: SezzleeCatalog,
    private readonly dispatcher: SezzleeDispatcher,
    private readonly visibility: CallerVisibilityProvider,
  ) {
    this.serve = this.streamableHttp.serve(() => {
      const server = new McpServer({ name: "generation", version: "0.0.0" });
      registerSezzleeTools(server, {
        catalog: this.catalog,
        dispatcher: this.dispatcher,
        mapper: mapper as InvokeResultMapper,
        visibility: this.visibility,
        scopes: scopes as CallerScopeResolver,
        options: options as SezzleeOptions,
      });
      return server;
    });
  }

  @All("mcp")
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.serve(req, res);
  }
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("nest catalog generation and connection reflection", () => {
  let app: INestApplication;
  let baseUrl: string;
  let catalog: SezzleeCatalog;
  let client: Client;
  let notifications = 0;

  const generationsOf = async (): Promise<number[]> => {
    const listed = await client.listTools();
    return listed.tools.map(
      (tool) => (tool._meta ?? {})[catalogGenerationMetaKey] as number,
    );
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SezzleeModule.forRoot()],
      controllers: [EchoController, GenerationMcpController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    await app.listen(0);
    baseUrl = await app.getUrl();

    catalog = app.get(SezzleeCatalog);
    mapper = app.get<InvokeResultMapper>(extensionTokens.invokeResultMapper);
    scopes = app.get<CallerScopeResolver>(extensionTokens.callerScopeResolver);
    options = app.get<SezzleeOptions>(SEZZLEE_OPTIONS);

    client = new Client(
      { name: "generation-probe", version: "0.0.0" },
      {
        versionNegotiation: { mode: "auto" },
        listChanged: {
          tools: {
            autoRefresh: false,
            debounceMs: 0,
            onChanged: () => {
              notifications += 1;
            },
          },
        },
      },
    );
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)),
    );
  });

  afterAll(async () => {
    await client.close();
    await app.close();
  });

  it("G1: every meta-tool carries the catalog generation in _meta", async () => {
    const generations = await generationsOf();
    expect(generations.length).toBe(3);
    for (const generation of generations) {
      expect(generation).toBe(catalog.generation);
    }
  });

  it("G2: a catalog reload restamps the next answer and notifies once", async () => {
    const before = await generationsOf();
    const notifiedBefore = notifications;

    await catalog.reload();
    await waitFor(() => notifications > notifiedBefore);

    const after = await generationsOf();
    expect(after.every((generation) => generation === catalog.generation)).toBe(
      true,
    );
    expect(Math.min(...after)).toBeGreaterThan(Math.max(...before));
    expect(notifications - notifiedBefore).toBe(1);
  });

  it("G3: the synthetic request reflects the outer connection", async () => {
    const name = [...catalog.current.byName.keys()].find((candidate) =>
      candidate.endsWith("whoami"),
    );
    expect(name).toBeDefined();

    const result = (await client.callTool({
      name: "invoke_tool",
      arguments: { name, arguments: {} },
    })) as unknown as {
      content: { text: string }[];
      isError?: boolean;
    };
    expect(result.isError).not.toBe(true);
    const outcome = JSON.parse(result.content[0]?.text ?? "{}") as {
      body?: { ip?: string; remoteAddress?: string; remotePort?: number };
    };
    const echoed = outcome.body ?? {};
    expect(echoed.remoteAddress).toBeDefined();
    expect(["127.0.0.1", "::1", "::ffff:127.0.0.1"]).toContain(
      echoed.remoteAddress,
    );
    expect(echoed.ip).toBe(echoed.remoteAddress);
    expect(typeof echoed.remotePort).toBe("number");
  });
});
