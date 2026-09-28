# Why a scanned page is never shown as empty

A PDF page can look full on screen and still hold no text at all. A scan, a photographed receipt and
a signed page that was printed and scanned back are pictures. The text layer an extractor reads is
simply not there. This page explains how the server reports such a page, and why it refuses to call
it empty.

## Two different kinds of "no text"

A page with no extracted text is one of two things. Either it is genuinely blank, or it has content
the extractor cannot read. To an agent those two call for opposite conclusions. A blank page says
nothing. An unreadable page might say exactly what the agent is looking for.

An extractor that returns an empty string for both hands the agent a silent wrong answer: "the
contract has no payment terms" instead of "the payment terms are on a page I could not read". So
every page the server returns carries two separate flags:

- `needsOcr: true` means the engine found no text it could trust on the page. Where it can tell why,
  `ocrReason` says so, for example `scanned`.
- `empty: true` means the page was read and is blank. It is never `true` for a page that needs OCR.

The Markdown of a page that needs OCR is an empty string. The flags, not the string, are what an
agent should read.

## The same rule for search

A search can only look at text that exists, so a page that needs OCR is skipped. The answer counts
it in `unsearchablePages`, sets `coverageComplete` to `false`, and adds a note in words: an empty
result is not proof the text is absent from the document. Coverage is reported on every answer, not
only on empty ones. A search that found three matches on readable pages may have missed a fourth on
a scanned one.

## Why the page list comes from each page

`describe_document` reports both a document-level `documentType` and a page-level
`pagesNeedingOcr`, and they come from two different parts of the engine on purpose. The engine's
document classifier looks at the document as a whole. Measured on the pinned engine version, a
ten-page document with one scanned page was classified as image-based with all ten pages flagged.
Building the OCR page list from it would send ten pages to a model to recover one. The list is built
from each page's own extraction instead, which flagged the one page.

`classificationConfidence` belongs to the classifier's verdict. It says how sure the classifier is
that the document is, say, `mixed`. It says nothing about how accurate any extracted text is.

## What OCR changes, and what it does not

With an OCR binding and `ocr: true`, a page that needs OCR is sent to the provider, and its answer
replaces the empty text. The page then reports `source: "ocr"` and `needsOcr: false`. Two cases keep
the page marked `needsOcr` even then. One is a provider that returns an empty transcription: the
model saying nothing is not evidence that the page is blank. The other is a provider that answers
for a page it was not asked about: that answer is dropped, so it cannot overwrite a page whose own
text was trusted. [Why OCR is a plug-in and off by
default](/docs/pdf-mcp/why-ocr-is-a-plug-in-and-off-by-default) covers the rest.
