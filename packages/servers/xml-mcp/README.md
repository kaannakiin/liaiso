# @sezzlee/xml-mcp

A read-only, sandboxed MCP server that reads local XML documents.
It builds on [@sezzlee/file-core](../../cores/file-core); it does **not** depend on
`@sezzlee/core` and imports nothing from `packages/lab/xml-lab`.

**Documentation: <https://docs.sezzlee.app/docs/xml-mcp/introduction>** — a
tutorial, task guides, and the tool, error-code and limit reference generated from this package.

## Quick start

The root is the only argument, as an absolute path; there is no environment variable for it.

```json
{
  "mcpServers": {
    "xml": {
      "command": "npx",
      "args": ["-y", "@sezzlee/xml-mcp", "/path/to/xml/root"]
    }
  }
}
```

With Claude Code:

```bash
claude mcp add xml -- npx -y @sezzlee/xml-mcp /path/to/xml/root
```

Readable extensions: `.xml`, `.xsd`, `.xhtml`, `.svg`, `.csproj`, `.props`, `.targets`, `.config`,
`.resx`. An extension like `.config` is not a guarantee of XML — a parse error there is expected
behavior. Requires Node.js 22 or 24 on macOS (x64, arm64), glibc Linux (x64, arm64) or Windows x64.

## Tools

| Tool                 | What it does                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `list_documents`     | Lists readable XML documents under the root without parsing them                                                                       |
| `describe_document`  | Document element, every namespace with a stable alias, structure counts, repeated-element candidates, and an address `read_node` takes |
| `read_node`          | A bounded, ordered slice of the tree as flat depth-first records                                                                       |
| `find_in_document`   | Literal text in text nodes, attribute values or both                                                                                   |
| `select_xpath`       | One XPath 1.0 expression, exactly as written, with a typed result                                                                      |
| `project_records`    | A repeated element as rows and named columns, with a status per cell                                                                   |
| `aggregate_document` | Counts, distinct counts and, with `numericMode: binary64`, sums and averages per group                                                 |

Every argument, error code and limit is listed in the
[reference](https://docs.sezzlee.app/docs/xml-mcp/tools).

A document over the 8 MiB resident ceiling is read in a reduced-capability `chunked` mode:
`select_xpath`, `find_in_document` and `aggregate_document` are unavailable there, while
`project_records` still works.

## Configuration

`createXmlMcpServer(root, options)` takes two optional settings; the CLI
always uses the defaults.

| Option                  | Default | Meaning                                          |
| ----------------------- | ------- | ------------------------------------------------ |
| `documentCacheSize`     | `4`     | Documents kept resident in memory at once (1–64) |
| `maxConcurrentListings` | `4`     | Concurrent `list_documents` calls                |

```ts
createXmlMcpServer(root, {
  documentCacheSize: 4,
  maxConcurrentListings: 4,
});
```

`documentCacheSize` (S) is the single knob; the worker pool's capacity is
derived as `W = 2S`, and the invariant `W >= 2S-1` is pinned by a test — the
worker keeps a document alive while the store still holds it, so its map must
fit every store entry plus the one being adopted. **This is a budget, not
enforcement**: `worker.resourceLimits` bounds the JS heap, not WASM linear
memory, so exceeding the budget is a process crash rather than a clean
`resource_limit` error. Measured cost is 9.25-10.08x the source byte count,
so roughly 81 MiB resident per document at the 8 MiB ceiling; the default
`S=4` is safe on the smallest supported host.

## Rules

**Parsing happens in the worker.** The main process only ever holds a
serializable handle; a WASM pointer never crosses the boundary. No disposal
hook was needed on `@sezzlee/file-core`'s document store because of this.

**Layout follows the worker/host boundary.** `engine/` is the worker-side
graph and never names `host/` or `tools/`; `model/` and `primitives/` are the
shared vocabulary between the two sides. `index.ts`, `cli.ts`,
`xml-worker.ts` and `server.ts` stay at the root — the tarball entry point,
`bin`, the CI tarball check and the `../package.json` read respectively tie
them there.

**The worker entry never imports the host surface.** `src/xml-worker.ts`
only sees `node:worker_threads`, `node:buffer`, `libxml2-wasm` and a
type-only protocol; a lint rule enforces this. A worker returns a code
string, and the host side constructs the error object.

**DOCTYPE is refused before parsing.** The prolog scanner runs in the main
process; `doc.dtd` is only the second check. Measured: `XML_PARSE_NO_XXE`
does not block the internal DTD subset.

**The worker's stdout never mixes into the parent's fd 1.** It is isolated
with `stdout: true`; on stdio MCP, a single stray line breaks JSON-RPC.

**`diag` is off in production** and cannot be turned on through an
environment variable: it costs 24.9% and its raw report carries an engine
pointer.

**Unsupported encodings are refused before parsing.** The prolog scanner
applies the XML 1.0 Appendix F four-byte autodetection; the UCS-4 and EBCDIC
families get `unsupported_encoding`. Measured: the previous scanner missed
DOCTYPE in these families.

**`libxml2-wasm` is pinned to exact `0.7.2`.** A caret would silently
invalidate the F0-01 integrity record; the CI tarball checker enforces this.

## Development

```bash
pnpm turbo run build --filter=@sezzlee/xml-mcp
pnpm turbo run test --filter=@sezzlee/xml-mcp
pnpm turbo run check-types --filter=@sezzlee/xml-mcp
```

Run tests through Turbo, not `pnpm --filter @sezzlee/xml-mcp test`: the bare
filter skips `dependsOn: ["^build"]`.

A change to a tool's arguments, an error code or a limit changes the generated reference in
`apps/docs`; run `pnpm --filter @sezzlee/docs gen` and commit the result, or
`pnpm turbo run validate --filter=@sezzlee/docs` fails.

Large-document tests are opt-in and skipped by default; set
`SEZZLEE_XML_LARGE=1` to run them.
