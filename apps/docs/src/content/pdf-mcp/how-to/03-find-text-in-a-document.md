# How to find text in a document

`find_in_document` finds literal text in the pages of one PDF and reports the page, the line and the
text around each match. Use it before reading, to know which pages to read.

The examples use the two sample documents and the `pdf` helper from [Reading your first
PDF](/docs/pdf-mcp/reading-your-first-pdf):

```sh
pdf() {
  npx -y @modelcontextprotocol/inspector --cli liaiso-pdf ~/liaiso-pdf \
    --method tools/call --tool-name "$@" | jq '.content[0].text | fromjson'
}
```

## Search for a phrase

```sh
pdf find_in_document --tool-arg filePath=annual-report.pdf query=Rotterdam \
  | jq -c '.matches[] | {page, line, context}'
```

```json
{"page":1,"line":7,"context":"er of orders rose to 11,245, and the average order value was EUR 350. Two warehouses were consolidated into one in Rotterdam in March."}
{"page":4,"line":3,"context":"For 2026 we expect revenue growth between 4% and 6%. A second carrier for the West region starts in April to reduce late delivery. Capital expenditure is planned at EUR 240,000, mostly for the Rotterdam site."}
```

`query` is matched as written. It is never a regular expression or a query language, so `.`, `*`
and `(` are ordinary characters. `context` is the line the match is on, cut to at most 240
characters around the match.

## Match regardless of case

Matching is case-sensitive by default. `caseSensitive=false` folds the letters A to Z only:

```sh
pdf find_in_document --tool-arg filePath=annual-report.pdf query=WEST caseSensitive=false \
  | jq -c '[.matches[] | .page]'
```

```json
[2,2,3,4]
```

Letters outside A to Z are compared exactly even then, so `İ` and `i`, or `É` and `é`, do not match
each other. Search for each spelling separately when that matters.

## Match a whole line

`matchMode=exact` matches a line whose whole text, trimmed, equals the query. Headings are lines of
their own, so this finds a section title and nothing that merely mentions it:

```sh
pdf find_in_document --tool-arg filePath=annual-report.pdf query="# 3. Risks" matchMode=exact \
  | jq -c '.matches[] | {page, line}'
```

```json
{"page":3,"line":1}
```

The query includes the `# ` because the text searched is the page's Markdown, the same text
`read_pages` returns.

## Page through many matches

`maxResults` caps the matches in one answer, 50 by default and 200 at most. When more remain,
`truncated` is `true` and `nextCursor` continues the search:

```sh
pdf find_in_document --tool-arg filePath=annual-report.pdf query=West maxResults=2 \
  | jq -c '{matches: [.matches[] | .page], truncated}'
```

```json
{"matches":[2,2],"truncated":true}
```

Pass `nextCursor` back with the same `filePath`, `query`, `matchMode` and `caseSensitive`; a cursor
passed with different ones is refused with `invalid_argument`. You may change `maxResults` between
calls.

## Know what the search could not see

A page without a text layer, such as a scan, has nothing to search. It is counted in
`unsearchablePages`, and `coverageComplete` is `false`:

```sh
pdf find_in_document --tool-arg filePath=supply-agreement.pdf query="late delivery" \
  | jq -c '{matches: [.matches[] | .page], unsearchablePages, pagesNeedingOcr, coverageComplete}'
```

```json
{"matches":[1],"unsearchablePages":1,"pagesNeedingOcr":[2],"coverageComplete":false}
```

The phrase was found on page 1, but page 2 was not searched. Treat an answer with `coverageComplete:
false` as "found in the pages that could be read", never as "absent from the document". To search
the scanned pages as well, pass `ocr=true` to a server started with an OCR binding; see [How to read
scanned pages with OCR](/docs/pdf-mcp/read-scanned-pages-with-ocr).
