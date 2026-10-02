# How to run the server from source

Use this to try an unreleased change, or to point a client at a local build. You need Node.js 22 or
later, pnpm and a clone of the repository.

## Build it

From the repository root:

```text
pnpm install
pnpm turbo run build --filter=@sezzlee/excel-mcp
```

Build through Turbo, not `pnpm --filter @sezzlee/excel-mcp build`. The server depends on
`@sezzlee/file-core` and `@sezzlee/ooxml-core` through their built `dist/`, and only Turbo builds them
first; a bare filter can leave the server running against stale code.

## Run it

```text
node packages/servers/excel-mcp/dist/cli.js /absolute/path/to/sheets
```

To use the build from a client, put the same two words in its configuration: `"command": "node"`
and `"args": ["/absolute/path/to/sezzlee/packages/servers/excel-mcp/dist/cli.js", "/absolute/path/to/sheets"]`.

## Try it in the Inspector

```text
npx @modelcontextprotocol/inspector node packages/servers/excel-mcp/dist/cli.js /absolute/path/to/sheets
```

This opens the Inspector's web interface with the server connected, where you can call every tool by
hand.

## Test it

```text
pnpm turbo run test --filter=@sezzlee/excel-mcp
pnpm turbo run check-types lint --filter=@sezzlee/excel-mcp
```

The test suite builds its own fixture workbooks and needs no files of yours.
