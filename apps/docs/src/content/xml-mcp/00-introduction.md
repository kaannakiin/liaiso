# Introduction

`@sezzlee/xml-mcp` is an MCP server that lets an agent read XML documents. You start it with one
folder, and the agent can read the XML files inside that folder and nothing outside it. It has no
tool that writes, so a document is never modified.

```sh
npx -y @sezzlee/xml-mcp /absolute/path/to/your/documents
```

It reads files ending in `.xml`, `.xsd`, `.xhtml`, `.svg`, `.csproj`, `.props`, `.targets`,
`.config` and `.resx`, and speaks MCP over stdio, so any MCP client that can start a local command
can use it.

File access goes through a native module that ships prebuilt for Node.js 22 and 24 on macOS (x64
and arm64), Linux with glibc (x64 and arm64) and Windows x64. There is no JavaScript fallback: on
any other platform, including Alpine and other musl-based Linux images, file access fails with
`unsupported_platform`.

## What an agent can read

- **Structure first**: the document element, every namespace with a stable alias, how deep the tree
  goes, and which elements repeat and how often.
- **Records as rows**: a repeated element becomes a table with named columns, and every cell says
  whether its value was present, empty, missing or found more than once.
- **Answers instead of pages**: counts, distinct values, sums and averages per group, computed on
  the server with `aggregate_document`.
- **XPath 1.0**, evaluated exactly as written, with typed results.
- **Literal search** over text and attribute values.
- **Any part of the tree** in document order, as flat records that page without gaps.

Values always come back as the exact text in the file. Numbers are only converted when a call asks
for it, and a DOCTYPE is refused before anything is parsed.

A document over 8 MB is read in **chunked mode**, one record at a time: `project_records` still
works, while `select_xpath`, `find_in_document` and `aggregate_document`, which need the whole tree,
are refused. The ceiling is 50 MB.

## Where to go next

- New to the server: [Reading your first XML
  document](/docs/xml-mcp/reading-your-first-xml-document) takes ten minutes and ends with a
  server-side aggregation.
- Setting it up for an agent: [How to connect the server to your MCP
  client](/docs/xml-mcp/connect-the-server-to-your-mcp-client).
- Looking up an argument: [Tools](/docs/xml-mcp/tools), generated from the server itself.
- Handling a failure: [Error codes](/docs/xml-mcp/error-codes).
