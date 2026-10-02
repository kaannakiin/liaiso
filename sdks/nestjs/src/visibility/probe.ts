import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { of, type Observable } from "rxjs";
import type { VisibilityDecision } from "@sezzlee/core";
import type { CatalogEntry } from "../catalog.js";
import { SezzleeDispatcher, type ProbeResult } from "../dispatcher.js";
import { SezzleeDispatchAborted } from "../synthetic-context.js";
import {
  isSezzleeProbe,
  markShortCircuited,
  wasShortCircuited,
} from "../markers.js";
import type { OuterRequest, SezzleeOptions } from "../options.js";

@Injectable()
export class SezzleeProbeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request: unknown = context.switchToHttp().getRequest();
    if (!isSezzleeProbe(request)) {
      return next.handle();
    }
    markShortCircuited(request as object);
    return of(undefined);
  }
}

export interface ProbeEvaluator {
  canProbe(entry: CatalogEntry): boolean;
  probe(
    entry: CatalogEntry,
    outer: OuterRequest | undefined,
  ): Promise<VisibilityDecision>;
}

export class SezzleeProbeEvaluator implements ProbeEvaluator {
  private readonly disabled = new Map<string, string>();

  constructor(
    private readonly dispatcher: SezzleeDispatcher,
    private readonly options: SezzleeOptions,
  ) {}

  clearDisabled(): void {
    this.disabled.clear();
  }

  canProbe(entry: CatalogEntry): boolean {
    return entry.template !== undefined && !this.disabled.has(entry.tool.name);
  }

  async probe(
    entry: CatalogEntry,
    outer: OuterRequest | undefined,
  ): Promise<VisibilityDecision> {
    const path = this.pathFor(entry);
    let result: ProbeResult;
    try {
      result = await this.dispatcher.probe(
        entry.descriptor.method,
        path,
        outer,
      );
    } catch (error) {
      if (!(error instanceof SezzleeDispatchAborted)) {
        throw error;
      }
      this.disabled.set(
        entry.tool.name,
        "the probe was abandoned before the pipeline produced a response",
      );
      return "unknown";
    }

    if (result.status === 401 || result.status === 403) {
      return "deny";
    }
    if (result.shortCircuited && result.status < 400) {
      return "allow";
    }
    this.disabled.set(
      entry.tool.name,
      result.status === 404
        ? "the probe path did not route; declare a value in visibility.probeValues"
        : "the response came back without the short-circuit marker",
    );
    return "unknown";
  }

  private pathFor(entry: CatalogEntry): string {
    return entry.descriptor.route.replaceAll(
      /\{([^}]+)\}/g,
      (_match, name: string) =>
        encodeURIComponent(
          constantFor(entry, name) ??
            this.options.visibility.probeValues.get(name.toLowerCase()) ??
            placeholderFor(entry, name),
        ),
    );
  }
}

/**
 * Guard: a family member is reachable only through its own key, so a placeholder or a host probe
 * value would probe a different member, or none, and report its verdict for this one.
 */
function constantFor(entry: CatalogEntry, name: string): string | undefined {
  const fill = entry.template?.parameters.find(
    (parameter) => parameter.name === name && parameter.location === "path",
  )?.fill;
  if (fill?.kind !== "constant") {
    return undefined;
  }
  const value: unknown = fill.value;
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? String(value)
    : undefined;
}

function placeholderFor(entry: CatalogEntry, name: string): string {
  const parameter = entry.descriptor.parameters?.find(
    (candidate) => candidate.name === name && candidate.in === "path",
  );
  switch (parameter?.schema.type) {
    case "integer":
    case "number":
      return "1";
    case "boolean":
      return "true";
    default:
      break;
  }
  if (parameter?.schema.format === "uuid") {
    return "00000000-0000-0000-0000-000000000000";
  }
  if (parameter?.schema.format === "date-time") {
    return "2000-01-01";
  }
  return "probe";
}

export { wasShortCircuited };
