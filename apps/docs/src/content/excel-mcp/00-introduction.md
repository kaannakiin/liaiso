# Introduction

`@sezzlee/excel-mcp` is an MCP server that lets an agent read spreadsheets. You start it with one
folder, and the agent can read the `.xlsx`, `.xlsm` and `.csv` files inside that folder and nothing
outside it. It has no tool that writes, so a workbook is never modified.

```sh
npx -y @sezzlee/excel-mcp /absolute/path/to/your/sheets
```

It speaks MCP over stdio, so any MCP client that can start a local command can use it.

File access goes through a native module that ships prebuilt for Node.js 22 and 24 on macOS (x64
and arm64), Linux with glibc (x64 and arm64) and Windows x64. There is no JavaScript fallback: on
any other platform, including Alpine and other musl-based Linux images, file access fails with
`unsupported_platform`.

## What an agent can read

- **Cells** as a compact grid: the header row once, then one array per row. Values, formulas, or
  both.
- **Answers instead of pages**: totals, averages, counts and groupings computed on the server with
  `aggregate_sheet`, and cells located by value or formula with `find_in_sheet`. A 50,000-row sheet
  answers "which region sold most?" in one call.
- **Workbook structure**: sheets, used ranges, defined names, merged cells, Excel Tables, data
  validation rules, conditional formatting rules and embedded pictures.
- **CSV files** with their delimiter and encoding detected and reported, and every value kept as the
  exact text in the file.

Charts, pivot tables and sparklines cannot be read. The server says so instead of answering with an
empty list.

## Where to go next

- New to the server: [Reading your first workbook](/docs/excel-mcp/reading-your-first-workbook)
  takes ten minutes and ends with a server-side aggregation.
- Setting it up for an agent: [How to connect the server to your MCP
  client](/docs/excel-mcp/connect-the-server-to-your-mcp-client).
- Looking up an argument: [Tools](/docs/excel-mcp/tools), generated from the server itself.
- Handling a failure: [Error codes](/docs/excel-mcp/error-codes).
