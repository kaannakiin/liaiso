# How to connect the server to your MCP client

Every client starts the server as a local command with no arguments and passes its settings in the
environment. The server's working directory is its workspace: the only folder it reads files from.

> **Not run by us.** The Claude Code command below was checked against `claude mcp add --help`; the
> Codex block follows the configuration a codex-driving host generates; the JSON configurations
> follow each client's documented format. None was loaded into those clients for this page.

## The variables

Only the model is required:

| Variable                 | Default                  | Meaning                                                            |
| ------------------------ | ------------------------ | ------------------------------------------------------------------ |
| `SEZZLEE_LLM_MODEL`      | required                 | The Ollama model name, as `ollama list` shows it.                  |
| `SEZZLEE_LLM_BASE_URL`   | `http://127.0.0.1:11434` | The Ollama host.                                                   |
| `SEZZLEE_LLM_ROOT`       | the working directory    | The workspace every file argument is resolved against.             |
| `SEZZLEE_LLM_OUTPUT_DIR` | `.llm-mcp/out`           | Where `local_map` writes, relative to the workspace and inside it. |
| `SEZZLEE_LLM_NUM_CTX`    | `16384`                  | The context window asked of Ollama, at least 4096.                 |
| `SEZZLEE_LLM_KEEP_ALIVE` | `30m`                    | How long Ollama keeps the model loaded after a call.               |
| `SEZZLEE_LLM_TIMEOUT_MS` | `300000`                 | Time one request to the model may take, once it leaves the queue.  |

A missing model or an invalid number stops the server at startup with a message naming the variable.
An Ollama that is not running does not: the server starts, `local_status` reports `reachable:
false`, and a task fails with `backend_unavailable`. Right after it starts, the server asks Ollama
to load the model, so the first real call does not pay for the load.

## Claude Code

Claude Code starts the server in the project directory, which becomes the workspace:

```sh
claude mcp add local -e SEZZLEE_LLM_MODEL=qwen3:8b -- npx -y @sezzlee/llm-mcp
```

## Codex

Add the server to `~/.codex/config.toml`:

```toml
[mcp_servers.local]
command = "npx"
args = ["-y", "@sezzlee/llm-mcp"]
default_tools_approval_mode = "auto"
tool_timeout_sec = 900

[mcp_servers.local.env]
SEZZLEE_LLM_MODEL = "qwen3:8b"
```

Codex passes an MCP server none of its own environment, so every setting goes in `env`. Under
`approval_policy = "never"`, a tool call that asks for approval is refused outright;
`default_tools_approval_mode = "auto"` lets Codex decide from each tool's annotations instead. A
labelling run over 2,000 rows takes about nine minutes, and a call may wait behind others in the
queue, so give the tool calls a long timeout.

## Claude Desktop

Edit `claude_desktop_config.json` (**Settings → Developer → Edit Config**) and restart the app.
Claude Desktop does not start a server in a project folder, so name the workspace:

```json
{
  "mcpServers": {
    "local": {
      "command": "npx",
      "args": ["-y", "@sezzlee/llm-mcp"],
      "env": {
        "SEZZLEE_LLM_MODEL": "qwen3:8b",
        "SEZZLEE_LLM_ROOT": "/Users/you/documents"
      }
    }
  }
}
```

## Cursor and VS Code

Use the same `command`, `args` and `env` in `.cursor/mcp.json`, or under `servers` with `"type":
"stdio"` in `.vscode/mcp.json`. Both start the server in the open project, which becomes the
workspace.

## An Ollama on another machine

Set `SEZZLEE_LLM_BASE_URL` to its address, for example `http://10.0.0.5:11434`. The files the tools
read are sent there, so use a host you trust with them.

## Check that it started

Ask the agent whether the local model is available. It should call `local_status`, which reports
the model name, `reachable`, `loaded`, and how many calls are waiting.
