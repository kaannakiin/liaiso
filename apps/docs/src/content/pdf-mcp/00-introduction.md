# Introduction

`@sezzlee/pdf-mcp` is an MCP server that lets an agent read PDF documents. You start it with one
folder, and the agent can read the PDF files inside that folder and nothing outside it. It has no
tool that writes, so a document is never modified, and it never opens a network connection.

```sh
npx -y @sezzlee/pdf-mcp /absolute/path/to/your/documents
```

It reads files ending in `.pdf` and speaks MCP over stdio, so any MCP client that can start a local
command can use it.

The server runs on macOS with Apple silicon, Linux with glibc (x64 and arm64) and Windows x64, on
Node.js 22 or later. Two native modules set that list: the PDF engine ships no build for Intel Macs,
where the server stops at startup with a one-line message, and the file-access module ships none for
Alpine and other musl-based Linux images, where every read fails with `unsupported_platform`.

## What an agent can read

- **Pages as Markdown**, numbered from 1, with headings and tables kept as Markdown structure.
- **A summary first**: page count, whether the document is text or scanned, and exactly which pages
  have no readable text.
- **Literal search** over the text, with the page, the line and the surrounding text of each match.
- **Scanned pages**, when you start the server with an OCR binding. OCR is off unless a call asks for
  it, and the server itself never sends a page anywhere: the binding you supply decides that.

A page with no readable text is never shown as an empty page: it is marked `needsOcr`, and a search
that could not read every page says so with `coverageComplete: false`.

## Where to go next

- New to the server: [Reading your first PDF](/docs/pdf-mcp/reading-your-first-pdf) takes ten
  minutes and ends with a search that tells you what it could not read.
- Setting it up for an agent: [How to connect the server to your MCP
  client](/docs/pdf-mcp/connect-the-server-to-your-mcp-client).
- Scanned documents: [How to read scanned pages with OCR](/docs/pdf-mcp/read-scanned-pages-with-ocr).
- Looking up an argument: [Tools](/docs/pdf-mcp/tools), generated from the server itself.
- Handling a failure: [Error codes](/docs/pdf-mcp/error-codes).
