import type { Vocabulary as SourceVocabulary } from "@sezzlee/mcp-core";

export interface Vocabulary<
  TToolName extends string,
> extends SourceVocabulary<TToolName> {
  readonly rootLabel: string;
  readonly readableLabel: string;
  readonly tooLargeRecovery: string;
}
