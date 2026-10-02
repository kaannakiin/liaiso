import "reflect-metadata";
import { Controller, Get, UseGuards } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { SezzleeCatalog } from "../src/catalog.js";
import { McpTool } from "../src/decorators.js";
import { SezzleeModule } from "../src/sezzlee.module.js";
import type { CatalogDiagnostic, VisibilityDeclaration } from "../src/index.js";

class AnonymousGuard {
  canActivate(): boolean {
    return true;
  }

  describeVisibility(): VisibilityDeclaration {
    return { anonymous: "yes", policies: [] };
  }
}

@Controller("declared")
class DeclaresTermsController {
  @Get()
  @McpTool({
    name: "declares_terms",
    description: "Creates a purchase.",
    searchTerms: ["sipariş", "satın alma"],
  })
  @UseGuards(AnonymousGuard)
  create(): void {}

  @Get("duplicate")
  @McpTool({
    name: "duplicate_terms",
    description: "Creates a purchase.",
    searchTerms: ["Sipariş", "siparis", ""],
  })
  @UseGuards(AnonymousGuard)
  duplicate(): void {}
}

@Controller("inherited")
@McpTool({ searchTerms: ["fatura"] })
class TermedContainerController {
  @Get()
  @McpTool({ name: "inherits_terms", description: "Lists rows." })
  @UseGuards(AnonymousGuard)
  list(): void {}
}

@Controller("undeclared")
class UndeclaredController {
  @Get()
  @McpTool({ name: "undeclared_terms", description: "Lists rows." })
  @UseGuards(AnonymousGuard)
  list(): void {}
}

@Controller("plain")
class PlainController {
  @Get()
  @McpTool({ name: "plain_terms", description: "Lists rows." })
  @UseGuards(AnonymousGuard)
  list(): void {}
}

describe("search term declaration", () => {
  let catalog: SezzleeCatalog;
  let diagnostics: readonly CatalogDiagnostic[];

  const termsOf = (name: string): readonly string[] | undefined =>
    catalog.current.byName.get(name)?.descriptor.searchTerms;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        SezzleeModule.forRoot((options) => {
          options.searchTerms = (container) =>
            container === "UndeclaredController" ? ["merkez"] : undefined;
        }),
      ],
      controllers: [
        DeclaresTermsController,
        TermedContainerController,
        UndeclaredController,
        PlainController,
      ],
    }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    catalog = app.get(SezzleeCatalog);
    diagnostics = catalog.diagnostics;
  });

  it("indexes the declared terms", () => {
    expect(termsOf("declares_terms")).toEqual(["sipariş", "satın alma"]);
    expect(catalog.current.index.search("satın", 10)[0]).toBe("declares_terms");
  });

  it("keeps a container's terms when the operation marker declares none", () => {
    expect(termsOf("inherits_terms")).toEqual(["fatura"]);
  });

  it("drops terms that fold onto an earlier one or to nothing, and says so", () => {
    expect(termsOf("duplicate_terms")).toEqual(["Sipariş"]);
    expect(
      diagnostics
        .map((diagnostic) => diagnostic.code)
        .filter((code) => code.endsWith("_search_term"))
        .sort(),
    ).toEqual(["duplicate_search_term", "empty_search_term"]);
  });

  it("falls back to the host rule and has no container-derived default", () => {
    expect(termsOf("undeclared_terms")).toEqual(["merkez"]);
    expect(termsOf("plain_terms")).toBeUndefined();
  });

  it("never publishes the terms on the tool an agent loads", () => {
    expect(
      catalog.current.byName.get("declares_terms")?.tool,
    ).not.toHaveProperty("searchTerms");
  });
});
