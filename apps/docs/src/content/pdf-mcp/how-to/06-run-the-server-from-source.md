# How to run the server from source

Use this to try an unreleased change, or to point a client at a local build. You need Node.js 22 or
later, pnpm and a clone of the repository, on a platform the PDF engine supports.

## Build it

From the repository root:

```text
pnpm install
pnpm turbo run build --filter=@sezzlee/pdf-mcp
```

Build through Turbo, not `pnpm --filter @sezzlee/pdf-mcp build`. The server depends on
`@sezzlee/file-core` through its built `dist/`, and only Turbo builds it first.

## Run it

```text
node packages/servers/pdf-mcp/dist/cli.js /absolute/path/to/documents
```

To use the build from a client, set `"command": "node"` and `"args":
["/absolute/path/to/sezzlee/packages/servers/pdf-mcp/dist/cli.js", "/absolute/path/to/documents"]`.
Add `"--ocr"` and a binding path after the folder to enable OCR.

## Try it in the Inspector

```text
npx @modelcontextprotocol/inspector node packages/servers/pdf-mcp/dist/cli.js /absolute/path/to/documents
```

This opens the Inspector's web interface with the server connected, where you can call every tool by
hand.

## Test it

```text
pnpm turbo run test --filter=@sezzlee/pdf-mcp
pnpm turbo run check-types lint --filter=@sezzlee/pdf-mcp
```

The OCR tests run against fake ports. A suite against a real Ollama is skipped unless
`SEZZLEE_PDF_OCR_URL` is set; it reads `SEZZLEE_PDF_OCR_MODEL` too, and defaults to
`deepseek-ocr:3b`.
