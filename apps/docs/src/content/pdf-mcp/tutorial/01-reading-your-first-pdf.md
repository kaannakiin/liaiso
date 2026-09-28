# Reading your first PDF

By the end of this page you will have read a report's table as Markdown, found every mention of a
phrase across its pages, and seen how the server answers when part of a document is a scan it cannot
read.

You will call the tools yourself, the way an agent does, so you can see exactly what the agent
receives. You need Node.js 22 or later, `jq`, and a Mac with Apple silicon, Linux or Windows.

## 1. Install the server

```sh
npm install -g @liaiso/pdf-mcp
```

This puts the `liaiso-pdf` command on your path.

## 2. Give it a folder

The server reads one folder and nothing outside it:

```sh
mkdir -p ~/liaiso-pdf
```

Download [annual-report.pdf](/samples/pdf-mcp/annual-report.pdf) and
[supply-agreement.pdf](/samples/pdf-mcp/supply-agreement.pdf) and save both into `~/liaiso-pdf`. The
report has four pages of text, one of them a table. The agreement has three pages, and the middle
one is a scanned image, as signed pages often are.

## 3. Make calling a tool short

The MCP Inspector can start the server and call one tool from the command line. Define a shell
function so each call below is one line:

```sh
pdf() {
  npx -y @modelcontextprotocol/inspector --cli liaiso-pdf ~/liaiso-pdf \
    --method tools/call --tool-name "$@" | jq '.content[0].text | fromjson'
}
```

Every tool answers with one text item that holds JSON; the `jq` at the end unpacks it.

## 4. See what the server can read

```sh
pdf list_documents | jq -c '.files[] | {filePath, sizeBytes}'
```

```json
{"filePath":"annual-report.pdf","sizeBytes":4354}
{"filePath":"supply-agreement.pdf","sizeBytes":62167}
```

`list_documents` never opens a file, so these are candidates: a file with a `.pdf` extension that is
not really a PDF shows up here and fails only when it is read.

## 5. Look at the report before reading it

```sh
pdf describe_document --tool-arg filePath=annual-report.pdf \
  | jq -c '{pageCount, documentType, pagesNeedingOcr, pagesWithTables}'
```

```json
{"pageCount":4,"documentType":"text_based","pagesNeedingOcr":[],"pagesWithTables":[2]}
```

Four pages, all with a text layer, so nothing needs OCR. Page 2 holds a table.

## 6. Read the table

Ask for that one page. Page numbers start at 1:

```sh
pdf read_pages --tool-arg filePath=annual-report.pdf 'pages=[2]' \
  | jq -r '.pages[0].markdown'
```

```text
# 2. Revenue by region

Revenue is reported in euros, net of returns.

|Region|Revenue|Orders|Growth|
|---|---|---|---|
|North|1,240,000|3,410|+8.2%|
|South|980,500|2,875|+3.1%|
|East|1,105,250|3,020|+11.4%|
|West|612,800|1,940|-2.6%|
|Total|3,938,550|11,245|+5.9%|

West is the only region that shrank; see section 3 for the late delivery issue.

```

The page comes back as Markdown: the heading is a heading and the table is a table, so an agent can
read the numbers by column instead of guessing where one ends and the next begins.

## 7. Find every mention of a phrase

Search the whole report for "late delivery". The search is literal, and `caseSensitive=false` also
matches "Late delivery" at the start of a sentence:

```sh
pdf find_in_document --tool-arg filePath=annual-report.pdf query="late delivery" caseSensitive=false \
  | jq -c '.matches[] | {page, line}'
```

```json
{"page":2,"line":13}
{"page":3,"line":3}
{"page":3,"line":3}
{"page":4,"line":3}
```

Page 3 matches twice: a match is reported each time the phrase occurs, and `line` is the line of the
page's Markdown it occurs on. The same answer says how much of the document the search covered:

```sh
pdf find_in_document --tool-arg filePath=annual-report.pdf query="late delivery" caseSensitive=false \
  | jq -c '{searchedPages, pageCount, coverageComplete}'
```

```json
{"searchedPages":4,"pageCount":4,"coverageComplete":true}
```

Every page was searched, so no match elsewhere means the phrase is nowhere else.

## 8. Search a document that is partly a scan

The agreement's payment terms are on its scanned page. Search for the contract value:

```sh
pdf find_in_document --tool-arg filePath=supply-agreement.pdf query="48,000" \
  | jq '{matches, searchedPages, pageCount, coverageComplete, note}'
```

```json
{
  "matches": [],
  "searchedPages": 2,
  "pageCount": 3,
  "coverageComplete": false,
  "note": "1 of 3 pages carry no readable text and were not searched; an empty result is not proof the text is absent from the document."
}
```

There is no match, but the server does not leave it at that. Only two of the three pages could be
searched, `coverageComplete` is `false`, and the note says in words that an empty result is not
proof the text is absent. Reading the page shows why:

```sh
pdf read_pages --tool-arg filePath=supply-agreement.pdf 'pages=[2]' \
  | jq -c '.pages[0]'
```

```json
{"page":2,"markdown":"","needsOcr":true,"empty":false,"source":"text","ocrReason":"scanned"}
```

The page has no text layer. It is marked `needsOcr` with the reason `scanned`, and `empty` is
`false`, because nobody knows yet what it says: an unreadable page is never presented as a blank
one.

## What you did

You started the server on one folder, summarised a document, read one page as Markdown, and searched
two documents, one of which the server could only partly read and said so. To read the scanned page
as well, see [How to read scanned pages with OCR](/docs/pdf-mcp/read-scanned-pages-with-ocr). To
give these tools to an agent, see [How to connect the server to your MCP
client](/docs/pdf-mcp/connect-the-server-to-your-mcp-client).
