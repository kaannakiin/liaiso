import { All, Controller, Inject, Req, Res } from "@nestjs/common";
import { McpServer } from "@modelcontextprotocol/server";
import {
  CallerVisibilityProvider,
  extensionTokens,
  registerSezzleeTools,
  SezzleeCatalog,
  SezzleeDispatcher,
  SezzleeStreamableHttp,
  SEZZLEE_OPTIONS,
  type CallerScopeResolver,
  type InvokeResultMapper,
  type SezzleeOptions,
  type SezzleeRequestHandler,
} from "@sezzlee/sdk-nestjs";
import type { Request, Response } from "express";

@Controller()
export class McpController {
  constructor(
    private readonly streamableHttp: SezzleeStreamableHttp,
    private readonly catalog: SezzleeCatalog,
    private readonly dispatcher: SezzleeDispatcher,
    private readonly visibility: CallerVisibilityProvider,
    @Inject(extensionTokens.invokeResultMapper)
    private readonly mapper: InvokeResultMapper,
    @Inject(extensionTokens.callerScopeResolver)
    private readonly scopes: CallerScopeResolver,
    @Inject(SEZZLEE_OPTIONS) private readonly options: SezzleeOptions,
  ) {
    this.serve = this.streamableHttp.serve(() => {
      const server = new McpServer({ name: "demo-api", version: "0.0.0" });
      registerSezzleeTools(server, {
        catalog: this.catalog,
        dispatcher: this.dispatcher,
        mapper: this.mapper,
        visibility: this.visibility,
        scopes: this.scopes,
        options: this.options,
      });
      return server;
    });
  }

  private readonly serve: SezzleeRequestHandler;

  @All("mcp")
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.serve(req, res);
  }
}
