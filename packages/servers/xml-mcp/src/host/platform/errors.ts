import {
  FileSourceError,
  internalErrorMessage,
  internalErrorRecovery,
  type CoreErrorCode,
  type ErrorContext,
  type ErrorFactory,
} from "@sezzlee/file-core";
import { vocabulary } from "./vocabulary.js";

export type SezzleeXmlErrorCode =
  | CoreErrorCode
  | "malformed_xml"
  | "doctype_not_allowed"
  | "unsupported_encoding"
  | "query_not_supported"
  | "numeric_precision";

export class SezzleeXmlError extends FileSourceError {
  declare readonly code: SezzleeXmlErrorCode;

  constructor(code: SezzleeXmlErrorCode, message: string, recovery?: string) {
    super(code, message, recovery);
  }
}

export const fail: ErrorFactory<SezzleeXmlErrorCode> = (
  code,
  message,
  recovery,
) => new SezzleeXmlError(code, message, recovery);

export function asXmlError(
  error: unknown,
  context: ErrorContext = {},
): SezzleeXmlError {
  if (error instanceof SezzleeXmlError) {
    return error;
  }
  return new SezzleeXmlError(
    "internal_error",
    internalErrorMessage(error, context),
    internalErrorRecovery(vocabulary),
  );
}
