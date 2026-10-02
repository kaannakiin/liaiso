import {
  armDeadline,
  SezzleeDispatchAborted,
  untilAbandoned,
} from "./invoke/deadline.js";
import { tokenize, type SearchDocument, type ToolIndex } from "./search.js";

type ListField<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends readonly string[] ? K : never;
}[keyof T];

/**
 * One tool as a host ranker sees it: every index field of `SearchDocument`, with each list present
 * (empty rather than absent) so a ranker never has to tell the two apart.
 */
export type RankDocument = Omit<SearchDocument, ListField<SearchDocument>> & {
  readonly [K in ListField<SearchDocument>]-?: NonNullable<SearchDocument[K]>;
};

/**
 * @param version changes whenever the catalog is rebuilt; a ranker that embeds documents ahead of
 * time re-embeds when it changes
 */
export interface RankCatalog {
  readonly version: number;
  readonly documents: readonly RankDocument[];
}

/**
 * @param signal aborted when the ranker's deadline expires or the caller cancels
 */
export interface RankRequest {
  readonly query: string;
  readonly catalog: RankCatalog;
  readonly signal: AbortSignal;
}

/**
 * A host's replacement for the BM25 ranking of a non-empty query.
 *
 * @returns tool names, most relevant first; a tool left out is not in the result
 */
export interface ToolRanker {
  rank(request: RankRequest): PromiseLike<readonly string[]>;
}

export type RankerFailureReason = "timeout" | "threw" | "invalid_answer";

export type RankerEvent =
  | {
      readonly kind: "fallback";
      readonly reason: RankerFailureReason;
      readonly error?: unknown;
    }
  | {
      readonly kind: "ignored";
      readonly unknown: readonly string[];
      readonly duplicate: readonly string[];
    };

export type RankerFailureMode = "fallback" | "error";

/**
 * @param timeoutMs the ranker's deadline in whole milliseconds; zero means none
 * @param report the host channel for fallbacks and dropped names; never part of the answer
 */
export interface SearchRankerOptions {
  readonly ranker: ToolRanker;
  readonly timeoutMs: number;
  readonly onFailure: RankerFailureMode;
  readonly report?: (event: RankerEvent) => void;
}

export const defaultRankerTimeoutMs = 10_000;

export const rankerFailureMessages = {
  timeout: "the search ranker did not answer within its deadline",
  threw: "the search ranker threw",
  invalid_answer:
    "the search ranker answered something other than a list of tool names",
} as const satisfies Record<RankerFailureReason, string>;

export function describeRankerEvent(
  event: RankerEvent,
  onFailure: RankerFailureMode,
): string {
  switch (event.kind) {
    case "fallback":
      return onFailure === "fallback"
        ? `search_tools: ${rankerFailureMessages[event.reason]}; the query was ranked with BM25 instead.`
        : `search_tools: ${rankerFailureMessages[event.reason]}; the call was refused as search_ranker_unavailable.`;
    case "ignored":
      return `search_tools: the search ranker named tools that were dropped (unknown: ${JSON.stringify(event.unknown)}, repeated: ${JSON.stringify(event.duplicate)}).`;
  }
}

export interface NormalizedRanking {
  readonly names: readonly string[];
  readonly unknown: readonly string[];
  readonly duplicate: readonly string[];
}

let catalogVersion = 0;

export function rankCatalogOf(
  documents: readonly SearchDocument[],
): RankCatalog {
  catalogVersion += 1;
  return Object.freeze({
    version: catalogVersion,
    documents: Object.freeze(
      documents.map((document) =>
        Object.freeze({
          ...document,
          tags: Object.freeze([...(document.tags ?? [])]),
          searchTerms: Object.freeze([...(document.searchTerms ?? [])]),
          alternateRoutes: Object.freeze([...(document.alternateRoutes ?? [])]),
          parameters: Object.freeze([...(document.parameters ?? [])]),
        }),
      ),
    ),
  });
}

/**
 * Guard: the mode is decided by the tokenizer BM25 uses, so no query is a listing under one ranker
 * and a search under the other.
 */
export function isListQuery(query: string | undefined): boolean {
  return tokenize(query).length === 0;
}

export function isNameList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every((entry: unknown) => typeof entry === "string")
  );
}

/**
 * @returns `undefined` when the answer is not a list of strings
 */
export function normalizeRanking(
  index: ToolIndex,
  answer: unknown,
  tags: readonly string[] | undefined,
): NormalizedRanking | undefined {
  if (!isNameList(answer)) {
    return undefined;
  }
  const seen = new Set<string>();
  const unknown: string[] = [];
  const duplicate: string[] = [];
  const known: string[] = [];
  for (const name of answer) {
    if (!index.has(name)) {
      unknown.push(name);
    } else if (seen.has(name)) {
      duplicate.push(name);
    } else {
      seen.add(name);
      known.push(name);
    }
  }
  return { names: index.retainTagged(known, tags), unknown, duplicate };
}

export type RankerConsultation =
  | { readonly kind: "answered"; readonly answer: unknown }
  | {
      readonly kind: "failed";
      readonly reason: Exclude<RankerFailureReason, "invalid_answer">;
      readonly error?: unknown;
    };

export async function consultRanker(
  options: SearchRankerOptions,
  query: string,
  catalog: RankCatalog,
  signal: AbortSignal | undefined,
): Promise<RankerConsultation> {
  const abandonment = armDeadline({
    ...(signal === undefined ? {} : { signal }),
    timeoutMs: options.timeoutMs,
  });
  try {
    const answer: unknown = await untilAbandoned(
      (async () =>
        options.ranker.rank({
          query,
          catalog,
          signal: abandonment.signal,
        }))(),
      abandonment.signal,
      abandonment.reason,
    );
    return { kind: "answered", answer };
  } catch (error) {
    /**
     * Guard: the caller's own cancellation is not a ranker failure. Falling back would spend a
     * BM25 pass on an answer nobody is left to read, and an `error` host would publish a
     * retryable refusal for a call that was never going to be retried.
     */
    if (error instanceof SezzleeDispatchAborted) {
      if (error.reason === "caller") {
        throw error;
      }
      return { kind: "failed", reason: "timeout" };
    }
    return { kind: "failed", reason: "threw", error };
  } finally {
    abandonment.dispose();
  }
}
