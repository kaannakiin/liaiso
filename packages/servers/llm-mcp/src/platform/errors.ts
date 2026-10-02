import {
  internalErrorMessage,
  internalErrorRecovery,
  McpSourceError,
  type ErrorContext,
  type ErrorFactory,
  type SourceErrorCode,
} from "@sezzlee/mcp-core";
import { vocabulary } from "./vocabulary.js";

export type SezzleeLlmErrorCode =
  | SourceErrorCode
  | "backend_unavailable"
  | "backend_refused"
  | "outside_workspace"
  | "file_not_found"
  | "not_text"
  | "input_too_large"
  | "unparsable_output";

export class SezzleeLlmError extends McpSourceError {
  declare readonly code: SezzleeLlmErrorCode;
}

export const fail: ErrorFactory<SezzleeLlmErrorCode> = (
  code,
  message,
  recovery,
) => new SezzleeLlmError(code, message, recovery);

export function asLlmError(
  error: unknown,
  context: ErrorContext = {},
): McpSourceError {
  if (error instanceof McpSourceError) {
    return error;
  }
  return fail(
    "internal_error",
    internalErrorMessage(error, context),
    internalErrorRecovery(vocabulary),
  );
}
