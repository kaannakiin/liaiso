# Why a document is extracted once and whole

`read_pages` answers a few pages at a time, but the server does not extract a few pages at a time.
The first call on a document extracts every page, keeps the result, and serves every later page and
search from it. This page explains why, and what it means for paging.

## Selecting pages does not make extraction cheap

It seems obvious that reading page 7 of a 200-page document should cost a two-hundredth of reading
all of it. Measured on the pinned engine version, it does not: a synthetic 200-page text document
took 21.1 ms to extract whole and 7.0 ms for a single page. Most of the cost is fixed: parsing the
file's structure, fonts and cross-references, whatever is asked for afterwards. Selecting one page
saves a third, not 199 parts in 200.

So the server extracts each document once and keeps it in memory. Two documents are kept by
default, and each holds the Markdown of every page, which is why the number is small. A call on a
third document evicts the least recently used one. `describe_document`, `read_pages` and
`find_in_document` all read the same cached extraction, so calling `describe_document` first costs
nothing extra, and skipping it saves nothing either.

The same reasoning sets the ceilings. A document over 32 MiB or with more than 2,000 pages is
refused, the second as soon as the page count is known and before any page is extracted. An
extraction that runs past 20 seconds fails the call. Real documents with embedded fonts and images
are much slower than the synthetic one, and nothing measured bounds them, so these are safe limits
rather than measured ones.

## What a cursor remembers

Because the whole document is available, paging is only a matter of where to resume. A `read_pages`
cursor holds a page number, plus a character offset when a page was too large for one answer. It
does not hold the page size, so `maxPages` may change between calls without skipping or repeating a
page. With an explicit `pages` selection, the cursor carries the rest of that selection and never
wanders outside it. A `find_in_document` cursor holds a page and a match position on it, together
with how many unsearchable pages the walk has passed, so coverage is still reported correctly on
the last page of results.

A cursor is also tied to what would change its meaning. It records the document's content
fingerprint, so a file changed on disk answers `stale_cursor` instead of pages of a different
document. It records the options that decide the text or the matches, such as `ocr` for a read, or
`query`, `matchMode`, `caseSensitive` and `ocr` for a search. Passing it with different ones is
refused. A cursor that resumes inside a page also carries a digest of that page's text. OCR can
answer differently the second time a page is transcribed, and an offset measured in the old text
would skip or repeat content without any sign that it had. That case answers `stale_cursor` too.

A cursor expires after ten minutes.
