# How to run the server from source

Use this to try an unreleased change, or to point a client at a local build. You need Node.js 22 or
later, pnpm and a clone of the repository.

## Build it

From the repository root:

```text
pnpm install
pnpm turbo run build --filter=@liaiso/mssql-mcp
```

Build through Turbo, not `pnpm --filter @liaiso/mssql-mcp build`. The server depends on
`@liaiso/db-core` through its built `dist/`, and only Turbo builds it first.

## Run it

Set the connection variables, then start the build:

```text
LIAISO_MSSQL_SERVER=db.example.com LIAISO_MSSQL_DATABASE=Sales \
LIAISO_MSSQL_USER=mcp_reader LIAISO_MSSQL_PASSWORD=... \
node packages/servers/mssql-mcp/dist/cli.js
```

To use the build from a client, set `"command": "node"`, `"args":
["/absolute/path/to/liaiso/packages/servers/mssql-mcp/dist/cli.js"]` and the same `env` block as for
the published package.

## Try it in the Inspector

```text
npx @modelcontextprotocol/inspector -e LIAISO_MSSQL_SERVER=db.example.com -e LIAISO_MSSQL_DATABASE=Sales \
  -e LIAISO_MSSQL_USER=mcp_reader -e LIAISO_MSSQL_PASSWORD=... \
  node packages/servers/mssql-mcp/dist/cli.js
```

The Inspector starts the server with only a few variables of its own environment, so pass the
connection with `-e`. This opens its web interface with the server connected.

## Test it

```text
pnpm turbo run test --filter=@liaiso/mssql-mcp
pnpm turbo run check-types lint --filter=@liaiso/mssql-mcp
```

These tests need no database. A live suite checks the catalogue queries and cancellation against a
real server; it runs only with `LIAISO_MSSQL_LIVE=1` and the connection variables set. Never point
it at production: it cancels queries and drops connections on purpose.
