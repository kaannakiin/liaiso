# How to read a document a few pages at a time

`read_pages` returns ten pages per call unless you say otherwise. Use this page to read fewer, to
read chosen pages in the order you want, and to continue a read that stopped.

The examples use [annual-report.pdf](/samples/pdf-mcp/annual-report.pdf), four pages, and the `pdf`
helper from [Reading your first PDF](/docs/pdf-mcp/reading-your-first-pdf):

```sh
pdf() {
  npx -y @modelcontextprotocol/inspector --cli sezzlee-pdf ~/sezzlee-pdf \
    --method tools/call --tool-name "$@" | jq '.content[0].text | fromjson'
}
```

## Read from the start, a few pages per call

`maxPages` caps the pages in one answer, up to 50:

```sh
pdf read_pages --tool-arg filePath=annual-report.pdf maxPages=2 \
  | jq -c '{pages: [.pages[].page], truncated, truncationReason}'
```

```json
{"pages":[1,2],"truncated":true,"truncationReason":"maxPages"}
```

`truncated` is `true` and `truncationReason` says why: the call stopped at `maxPages`, not at the end
of the document. The answer also carries a `nextCursor`. Pass it back, with the same `filePath`, to
get the next pages:

```sh
CURSOR=$(pdf read_pages --tool-arg filePath=annual-report.pdf maxPages=2 | jq -r .nextCursor)
pdf read_pages --tool-arg filePath=annual-report.pdf "cursor=$CURSOR" \
  | jq -c '{pages: [.pages[].page], truncated}'
```

```json
{"pages":[3,4],"truncated":false}
```

The second call returned pages 3 and 4 although it did not repeat `maxPages`: the cursor holds the
position, not the page size, so you may change `maxPages` between calls without skipping or
repeating a page. When `truncated` is `false` there is no `nextCursor` and the read is complete.

## Read chosen pages

`pages` lists the page numbers to read, from 1, in the order you want them back:

```sh
pdf read_pages --tool-arg filePath=annual-report.pdf 'pages=[4,1]' \
  | jq -c '[.pages[] | {page, heading: (.markdown | split("\n")[0])}]'
```

```json
[{"page":4,"heading":"# 4. Outlook"},{"page":1,"heading":"# Northwind Supplies"}]
```

A page number the document does not have is refused rather than answered with an empty page:

```sh
pdf read_pages --tool-arg filePath=annual-report.pdf 'pages=[7]'
```

```text
{"error":{"code":"tool_is_error","message":"Tool 'read_pages' returned isError:true."}}
{
  "error": "invalid_argument",
  "message": "The document has 4 pages; page 7 does not exist.",
  "recovery": "Call describe_document to read pageCount."
}
```

The first line comes from the Inspector; the object under it is the server's answer.

When a chosen selection does not fit in one answer, its `nextCursor` continues through the rest of
that selection and never wanders into pages you did not name. Because the cursor already carries the
selection, a call that passes both `cursor` and `pages` is refused with `invalid_argument`.

## When a single page is too large

An answer has a budget of 512 KiB. If the next page would not fit, the call stops before it, with
`truncationReason: "maxPayloadBytes"`. If the first page of an answer alone does not fit, its
Markdown is cut and the page is marked `truncatedMarkdown: true`, and `nextCursor` resumes inside
that page at the first character that was not sent. On the next call the same page comes back with
`markdownOffset`, the number of its characters already delivered. Keep passing `nextCursor` until
`truncated` is `false`; joining the pieces gives the page whole.

## When a cursor stops working

A cursor lasts ten minutes. After that, or if the file changed on disk, the call fails with
`invalid_cursor` or `stale_cursor`; start again without a cursor. A cursor is tied to its `ocr`
setting too, since OCR changes the text a page answers with, so passing it with a different `ocr`
value is refused with `invalid_argument`.
