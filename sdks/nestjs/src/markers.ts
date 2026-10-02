const SEZZLEE_REQUEST = Symbol("sezzlee.request");
const SEZZLEE_PROBE = Symbol("sezzlee.probe");
const SEZZLEE_SHORT_CIRCUIT = Symbol("sezzlee.probe.short-circuited");

type Marked = Record<symbol, boolean | undefined>;

export function markSyntheticRequest(request: object, probe: boolean): void {
  const marked = request as Marked;
  marked[SEZZLEE_REQUEST] = true;
  if (probe) {
    marked[SEZZLEE_PROBE] = true;
  }
}

export function markShortCircuited(request: object): void {
  (request as Marked)[SEZZLEE_SHORT_CIRCUIT] = true;
}

export function isSezzleeRequest(request: unknown): boolean {
  return reads(request, SEZZLEE_REQUEST);
}

export function isSezzleeProbe(request: unknown): boolean {
  return reads(request, SEZZLEE_PROBE);
}

export function wasShortCircuited(request: unknown): boolean {
  return reads(request, SEZZLEE_SHORT_CIRCUIT);
}

function reads(request: unknown, key: symbol): boolean {
  return (
    typeof request === "object" &&
    request !== null &&
    (request as Marked)[key] === true
  );
}
