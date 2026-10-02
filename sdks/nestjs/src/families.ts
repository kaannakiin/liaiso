import {
  declaredSchemaProblem,
  type CatalogDiagnostic,
  type JsonSchemaObject,
  type SeverityTable,
  type ToolFamily,
  type ToolVariant,
} from "@sezzlee/core";
import type { McpToolEffect, McpVariantOptions } from "./decorators.js";

/**
 * One capability behind a dispatching operation, as a host's member source returns it.
 *
 * @param key the value written into the dispatch parameter; it never reaches the agent
 * @param body the member's own request body, published as its input schema
 */
export type McpFamilyMember = {
  readonly key: string | number;
  readonly name: string;
  readonly description: string;
  readonly body: JsonSchemaObject;
  readonly bodyRequired?: boolean;
} & McpToolEffect;

export type McpFamilySource = (context: {
  readonly signal: AbortSignal;
}) => Promise<readonly McpFamilyMember[]> | readonly McpFamilyMember[];

export type FamilyLoad =
  | { readonly state: "loaded"; readonly members: readonly McpFamilyMember[] }
  | {
      readonly state: "stale";
      readonly members: readonly McpFamilyMember[];
      readonly error: unknown;
    }
  | { readonly state: "failed"; readonly error: unknown };

export type FamilyLoads = ReadonlyMap<string, FamilyLoad>;

export class ToolFamilyOptions {
  private readonly registered = new Map<string, McpFamilySource>();
  loadTimeoutMs = 10_000;

  get sources(): ReadonlyMap<string, McpFamilySource> {
    return this.registered;
  }

  provide(name: string, source: McpFamilySource): this {
    this.registered.set(name, source);
    return this;
  }
}

async function loadOne(
  source: McpFamilySource,
  timeoutMs: number,
): Promise<readonly McpFamilyMember[]> {
  const signal = AbortSignal.timeout(timeoutMs);
  const aborted = new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason as Error), {
      once: true,
    });
  });
  return Promise.race([Promise.resolve(source({ signal })), aborted]);
}

/**
 * Loads every registered source once.
 *
 * A failing source keeps the members it last returned: dropping a family because its source was
 * briefly unreachable would take working tools offline on every transient error.
 *
 * @param previous the loads the current catalog was built from, or `undefined` before the first
 */
export async function loadFamilies(
  options: ToolFamilyOptions,
  previous: FamilyLoads | undefined,
): Promise<FamilyLoads> {
  const entries = await Promise.all(
    [...options.sources].map(
      async ([name, source]): Promise<[string, FamilyLoad]> => {
        try {
          const members = await loadOne(source, options.loadTimeoutMs);
          return [name, { state: "loaded", members }];
        } catch (error) {
          const last = previous?.get(name);
          return [
            name,
            last === undefined || last.state === "failed"
              ? { state: "failed", error }
              : { state: "stale", members: last.members, error },
          ];
        }
      },
    ),
  );
  return new Map(entries);
}

export type FamilyResolution =
  | { readonly kind: "none" }
  | {
      readonly kind: "members";
      readonly family: ToolFamily;
      readonly variants: readonly ToolVariant[];
      readonly diagnostics: readonly CatalogDiagnostic[];
    }
  | { readonly kind: "refused"; readonly diagnostic: CatalogDiagnostic };

export const sdkFamilySeverities = {
  unknown_family_source: "endpointDropped",
  family_source_failed: "endpointDropped",
  family_not_loaded: "endpointDropped",
  family_source_stale: "warning",
  family_member_rejected: "warning",
} as const satisfies SeverityTable;

type SdkFamilyCode = keyof typeof sdkFamilySeverities;

const diagnostic = (
  code: SdkFamilyCode,
  message: string,
): CatalogDiagnostic => ({ code, message });

const toolNamePattern = /^[a-z][a-z0-9_]{0,255}$/;

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Lowers one operation's family declaration into the variants its members become.
 *
 * A defect in one member is that member's alone: the rest of the family stays published and the
 * member is reported, because the members are host data and one bad row should not take every
 * sibling offline. Only a defect in the declaration itself refuses the operation.
 *
 * @param owner the operation's identity in diagnostics
 * @param declared the handler's own `@McpVariant`s; a member may not reuse their names
 * @param loads the member loads, or `undefined` when the sources have not loaded yet
 */
export function resolveFamily(
  family: ToolFamily & { readonly source?: string },
  owner: string,
  declared: readonly McpVariantOptions[],
  options: ToolFamilyOptions,
  loads: FamilyLoads | undefined,
): FamilyResolution {
  const lowered = { parameter: family.parameter };
  if (family.source === undefined) {
    return {
      kind: "members",
      family: lowered,
      variants: [],
      diagnostics: [],
    };
  }
  if (!options.sources.has(family.source)) {
    return refused(
      "unknown_family_source",
      `${owner} takes its members from source '${family.source}', which is not registered; register it with options.families.provide.`,
    );
  }
  const load = loads?.get(family.source);
  if (load === undefined) {
    return refused(
      "family_not_loaded",
      `${owner} was built before source '${family.source}' finished loading; the catalog is rebuilt when it does.`,
    );
  }
  if (load.state === "failed") {
    return refused(
      "family_source_failed",
      `${owner} has no members: source '${family.source}' failed and has never returned any (${reasonOf(load.error)}).`,
    );
  }
  const diagnostics: CatalogDiagnostic[] = [];
  if (load.state === "stale") {
    diagnostics.push(
      diagnostic(
        "family_source_stale",
        `${owner} keeps the members source '${family.source}' last returned; the latest load failed (${reasonOf(load.error)}).`,
      ),
    );
  }
  const names = new Set(declared.map((variant) => variant.name));
  const keys = new Set<string>();
  const variants: ToolVariant[] = [];
  for (const member of load.members) {
    const problem = memberProblem(member, names, keys);
    if (problem !== undefined) {
      diagnostics.push(
        diagnostic(
          "family_member_rejected",
          `${owner} drops member '${String(member.name)}': ${problem}.`,
        ),
      );
      continue;
    }
    names.add(member.name);
    keys.add(JSON.stringify(member.key));
    variants.push(lower(member, family.parameter));
  }
  return { kind: "members", family: lowered, variants, diagnostics };
}

function memberProblem(
  member: McpFamilyMember,
  names: ReadonlySet<string>,
  keys: ReadonlySet<string>,
): string | undefined {
  if (typeof member.name !== "string" || !toolNamePattern.test(member.name)) {
    return "its name does not match the tool-name pattern";
  }
  if (
    typeof member.description !== "string" ||
    member.description.trim() === ""
  ) {
    return "it has no description";
  }
  if (names.has(member.name)) {
    return "another member or variant has the same name";
  }
  if (
    !(typeof member.key === "string" || Number.isFinite(member.key)) ||
    keys.has(JSON.stringify(member.key))
  ) {
    return "its key is not a string or finite number, or repeats another member's";
  }
  const schema: unknown = member.body;
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return "its body is not a JSON Schema object";
  }
  const invalid = declaredSchemaProblem(member.body);
  return invalid === undefined ? undefined : `its body ${invalid}`;
}

function lower(member: McpFamilyMember, parameter: string): ToolVariant {
  const annotations = {
    ...(member.readOnly === undefined ? {} : { readOnlyHint: member.readOnly }),
    ...(member.destructive === undefined
      ? {}
      : { destructiveHint: member.destructive }),
    ...(member.idempotent === undefined
      ? {}
      : { idempotentHint: member.idempotent }),
  };
  return {
    name: member.name,
    description: member.description,
    arguments: [
      { name: parameter, hidden: { kind: "constant", value: member.key } },
    ],
    requestBody: {
      schema: member.body,
      ...(member.bodyRequired === undefined
        ? {}
        : { required: member.bodyRequired }),
    },
    ...(Object.keys(annotations).length === 0 ? {} : { annotations }),
  };
}

function refused(code: SdkFamilyCode, message: string): FamilyResolution {
  return { kind: "refused", diagnostic: diagnostic(code, message) };
}
