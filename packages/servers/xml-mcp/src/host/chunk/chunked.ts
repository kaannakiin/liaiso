import { isRefusal, scanRecordBoundaries } from "./boundary.js";
import type {
  DescribeFacts,
  NamespaceAlias,
  RootFacts,
} from "../../model/describe.js";
import type {
  BoundaryScan,
  NamespaceDeclaration,
  ScanRefusal,
  ScanResume,
  ShapeSurvey,
} from "../../model/scan.js";
import { SezzleeXmlError } from "../platform/errors.js";
import { wrapRecord } from "./fragment.js";
import { limits } from "../platform/limits.js";
import { clark, formatAddress, type NodeAddress } from "../../model/node.js";
import type {
  Cell,
  ChunkPage,
  ChunkProbe,
  ColumnReport,
  ItemSelector,
  RecordPage,
  RecordProbe,
  Row,
} from "../../model/query.js";

const fragmentsPerRequest = 32;

const xmlReservedUri = "http://www.w3.org/XML/1998/namespace";

const rebuild =
  "Re-encode the document as UTF-8, or split it so each part fits the resident byte budget and is read whole.";

export function refusalError(refusal: ScanRefusal): SezzleeXmlError {
  switch (refusal.reason) {
    case "not_record_shaped":
      return new SezzleeXmlError(
        "unsupported_for_format",
        "This document is above the resident byte budget, so it is read in chunked mode, and chunked mode carries only record-shaped documents: repeating sibling elements under one parent. No repeating record sits at that address.",
        "Call describe_document for the repetition candidates this document does have, or split the file so each part is read whole.",
      );
    case "record_too_large":
      return new SezzleeXmlError(
        "resource_limit",
        `Record ${String(refusal.occurrence)} is ${String(refusal.bytes)} bytes on its own, above the ${String(limits.maxChunkBytes)} byte chunk budget.`,
        "Split the file so no single record exceeds the chunk budget.",
      );
    case "utf16":
      return new SezzleeXmlError(
        "unsupported_encoding",
        "Chunked mode finds record boundaries by scanning bytes, and this document is UTF-16, where a markup character is not one byte.",
        rebuild,
      );
    case "unsupported_encoding":
      return new SezzleeXmlError(
        "unsupported_encoding",
        `This document declares ${refusal.declared}. Chunked mode reads one record at a time and cannot carry that declaration into a single record, so the bytes would be decoded as UTF-8 and produce silently wrong text.`,
        rebuild,
      );
    case "malformed":
      return new SezzleeXmlError(
        "malformed_xml",
        `The document is not well-formed XML at byte ${String(refusal.offset)}.`,
        "Fix the markup and read the file again.",
      );
  }
}

export type ChunkAsk = (
  fragments: readonly Uint8Array[],
  firstOccurrence: number,
  probe: ChunkProbe,
) => Promise<ChunkPage>;

export interface SpanCache {
  scan(
    stamp: string,
    bytes: Uint8Array,
    selector: ItemSelector,
    from?: ScanResume,
  ): BoundaryScan | ScanRefusal;
  clear(): void;
  readonly size: number;
}

export function createSpanCache(maxEntries: number): SpanCache {
  const cache = new Map<string, BoundaryScan | ScanRefusal>();
  return {
    scan(stamp, bytes, selector, from) {
      const key = [
        stamp,
        formatAddress(selector.ancestors),
        clark(selector.name),
        String(from?.ordinal ?? 1),
      ].join("\u0000");
      const cached = cache.get(key);
      if (cached !== undefined) {
        cache.delete(key);
        cache.set(key, cached);
        return cached;
      }
      const outcome = scanRecordBoundaries(bytes, selector, {
        maxRecordBytes: limits.maxChunkBytes,
        maxSpans: limits.maxItemVisits,
        ...(from === undefined ? {} : { from }),
      });
      cache.set(key, outcome);
      while (cache.size > maxEntries) {
        const oldest = cache.keys().next();
        if (oldest.done === true) break;
        cache.delete(oldest.value);
      }
      return outcome;
    },
    clear() {
      cache.clear();
    },
    get size() {
      return cache.size;
    },
  };
}

function countInto(reports: ColumnReport[], cells: readonly Cell[]): void {
  cells.forEach((cell, index) => {
    const report = reports[index];
    if (report === undefined) return;
    reports[index] = {
      label: report.label,
      missingCount: report.missingCount + (cell.status === "missing" ? 1 : 0),
      emptyCount: report.emptyCount + (cell.status === "empty" ? 1 : 0),
      multipleCount:
        report.multipleCount +
        (cell.status === "multiple" || cell.status === "list" ? 1 : 0),
      mixedCount:
        report.mixedCount + ("mixed" in cell && cell.mixed === true ? 1 : 0),
    };
  });
}

export interface ChunkedProjection {
  readonly page: RecordPage;
  readonly byteOf: (ordinal: number) => number | undefined;
}

/**
 * Projects a record page from the span table. `probe.offset` counts matched
 * records and ordinals count physical ones; the two coincide only without a
 * filter, so a resumed scan starts its match count at `probe.offset` instead
 * of deriving it from the window's first ordinal.
 */
export async function projectRecordsChunked(
  bytes: Uint8Array,
  scan: BoundaryScan,
  probe: RecordProbe,
  ask: ChunkAsk,
): Promise<ChunkedProjection> {
  const base = scan.firstOrdinal - 1;
  const windowed = scan.offsets.length / 2;
  const total = base + windowed;
  const filtered = probe.where.length > 0;
  const resumed = scan.resumedFromHint;
  const byteOf = (ordinal: number): number | undefined => {
    if (ordinal === total + 1) return scan.lookahead;
    const slot = (ordinal - 1 - base) * 2;
    return slot >= 0 && slot < scan.offsets.length
      ? (scan.offsets[slot] as number)
      : undefined;
  };
  const chunkProbe: ChunkProbe = {
    columns: probe.columns,
    where: probe.where,
    match: probe.match,
    caseSensitive: probe.caseSensitive,
    maxItemVisits: probe.maxItemVisits,
    maxChars: probe.maxChars,
    maxCellValues: probe.maxCellValues,
  };

  const reports: ColumnReport[] = probe.columns.map((column) => ({
    label: column.label,
    missingCount: 0,
    emptyCount: 0,
    multipleCount: 0,
    mixedCount: 0,
  }));
  const rows: Row[] = [];
  let matched = resumed
    ? probe.offset
    : filtered
      ? 0
      : Math.min(probe.offset, total);
  let index = resumed || filtered ? base : matched;
  let next: number | undefined;

  while (index < total) {
    const take = Math.min(fragmentsPerRequest, total - index);
    const fragments: Uint8Array[] = [];
    for (let i = index - base; i < index - base + take; i += 1) {
      fragments.push(
        wrapRecord(
          bytes,
          scan.offsets[i * 2] as number,
          scan.offsets[i * 2 + 1] as number,
          scan.context,
        ),
      );
    }
    const page = await ask(fragments, index + 1, chunkProbe);
    for (const row of page.rows) {
      const position = matched;
      matched += 1;
      if (position < probe.offset) continue;
      if (rows.length >= probe.maxRows) {
        next ??= position;
        continue;
      }
      countInto(reports, row.cells);
      rows.push(row);
    }
    index += take;
    if (!filtered && rows.length >= probe.maxRows) {
      if (index < total) next ??= probe.offset + rows.length;
      matched = total;
      break;
    }
  }

  const page: RecordPage = {
    rows,
    columns: reports,
    itemParentAddress: probe.item.ancestors,
    itemName: probe.item.name,
    scannedItems: scan.scanned,
    matchedItems: matched,
    totalItems: total,
    totalItemsExact: false,
    complete: scan.complete && next === undefined,
    ...(next === undefined ? {} : { next }),
    resumeOrdinal: total + 1,
  };
  return { page, byteOf };
}

export { isRefusal };

/**
 * Assigns namespace aliases by the same rule as surveyNamespaces, duplicated
 * rather than imported: that module walks a libxml2 tree, and a runtime import
 * would pull the engine into the host process.
 */
export function aliasesOf(
  declarations: readonly NamespaceDeclaration[],
): readonly NamespaceAlias[] {
  const seen = new Map<string, Set<string>>();
  for (const declaration of declarations) {
    if (declaration.uri === "") continue;
    const prefixes = seen.get(declaration.uri) ?? new Set<string>();
    if (declaration.prefix !== "") prefixes.add(declaration.prefix);
    seen.set(declaration.uri, prefixes);
  }
  const taken = new Set<string>();
  const aliases: NamespaceAlias[] = [];
  let synthetic = 0;
  for (const [uri, prefixes] of seen) {
    const declaredPrefixes = [...prefixes].sort();
    const candidate =
      uri === xmlReservedUri ? "xml" : (declaredPrefixes[0] ?? undefined);
    let alias: string;
    if (candidate !== undefined && !taken.has(candidate)) alias = candidate;
    else {
      do {
        synthetic += 1;
        alias = `ns${String(synthetic)}`;
      } while (taken.has(alias));
    }
    taken.add(alias);
    aliases.push({
      uri,
      alias,
      declaredPrefixes,
      synthetic: alias !== candidate,
    });
  }
  return aliases;
}

export function describeChunked(
  survey: ShapeSurvey,
  root: RootFacts,
  declaredEncoding: string | null,
  maxCandidates: number,
): DescribeFacts {
  const rootAddress: NodeAddress = [
    {
      namespaceUri: root.namespaceUri,
      localName: root.localName,
      occurrence: 1,
    },
  ];
  const candidates = survey.candidates.slice(0, maxCandidates);
  const best = candidates[0];
  return {
    root,
    rootAddress,
    declaredEncoding,
    warningCount: 0,
    namespaces: aliasesOf(survey.namespaces),
    namespacesComplete: survey.complete,
    structure: {
      elementCount: survey.elementCount,
      elementCountExact: survey.complete,
      maxDepth: survey.maxDepth,
      maxDepthExact: survey.complete,
    },
    repetitionCandidates: candidates.map((candidate) => ({
      namespaceUri: candidate.name.namespaceUri,
      localName: candidate.name.localName,
      address: [...rootAddress, { ...candidate.name, occurrence: 1 }],
      count: candidate.count,
      countExact: survey.complete,
    })),
    mixedContent: [],
    exampleAddress:
      best === undefined
        ? rootAddress
        : [...rootAddress, { ...best.name, occurrence: 1 }],
  };
}
