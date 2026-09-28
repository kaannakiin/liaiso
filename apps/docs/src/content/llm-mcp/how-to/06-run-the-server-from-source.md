# How to run the server from source

Use this to try an unreleased change, or to point a client at a local build. You need Node.js 22 or
later, pnpm, a clone of the repository and, to call the tools, a running Ollama.

## Build it

From the repository root:

```text
pnpm install
pnpm turbo run build --filter=@liaiso/llm-mcp
```

Build through Turbo, not `pnpm --filter @liaiso/llm-mcp build`. The server depends on
`@liaiso/mcp-core` through its built `dist/`, and only Turbo builds it first.

## Run it

```text
LIAISO_LLM_MODEL=qwen3:8b node packages/servers/llm-mcp/dist/cli.js
```

The working directory is the workspace. To use the build from a client, set `"command": "node"`,
`"args": ["/absolute/path/to/liaiso/packages/servers/llm-mcp/dist/cli.js"]` and the same `env`
block as for the published package.

## Try it in the Inspector

```text
npx @modelcontextprotocol/inspector -e LIAISO_LLM_MODEL=qwen3:8b node packages/servers/llm-mcp/dist/cli.js
```

The Inspector starts the server with only a few variables of its own environment, so pass the model
with `-e`.

## Test it

```text
pnpm turbo run test --filter=@liaiso/llm-mcp
pnpm turbo run check-types lint --filter=@liaiso/llm-mcp
```

These tests fake the model host and need no Ollama. A live suite runs against a real one:

```text
LIAISO_LLM_LIVE=1 LIAISO_LLM_BASE_URL=http://127.0.0.1:11434 LIAISO_LLM_MODEL=qwen3:8b \
  pnpm turbo run test --filter=@liaiso/llm-mcp -- test/live.spec.ts
```
