# Introduction

`@liaiso/llm-mcp` is an MCP server that lets a planning agent, such as Codex or Claude Code, hand
bounded language work to a model running on your own [Ollama](https://ollama.com). The agent keeps
the plan; the local model reads the long files, summarises them, pulls fields out of them, or labels
the rows of a spreadsheet, and hands back a short answer.

```sh
LIAISO_LLM_MODEL=qwen3:8b npx -y @liaiso/llm-mcp
```

The point is what the agent does not have to read. It passes a file path, the server reads the file
and sends it to the local model, and only the answer enters the agent's context. The work also costs
nothing per token.

## The three tools

- **`local_task`** runs one task on the local model: `summarize`, `extract`, `classify`,
  `transform` or `free`. The input is short text or up to eight files. With a JSON Schema the answer
  is JSON that matches it. A long input is split and read whole by `summarize` and `extract`; every
  other kind refuses it rather than send the model half of it.
- **`local_map`** labels every row of a CSV file with one of your labels and writes a labelled copy
  into the server's output folder. The agent sees the counts and a few sample rows, never the file.
- **`local_status`** says whether the model host answers, whether the model is loaded, and how much
  input one call may carry.

## What it will not do

It is not an agent: the local model gets one instruction and one input, and cannot call tools. It
reads files only inside the folder it was started in, and writes only new files into its own output
folder. It never cuts an input to fit: an input the model's window cannot hold is split or refused,
because Ollama drops the start of an oversized prompt without an error.

## Where to go next

- New to the server: [Handing your first task to a local
  model](/docs/llm-mcp/handing-your-first-task-to-a-local-model) summarises a meeting, extracts its
  action items and labels a support queue.
- Setting it up for an agent: [How to connect the server to your MCP
  client](/docs/llm-mcp/connect-the-server-to-your-mcp-client).
- Deciding what to delegate: [When delegating to a local model pays
  off](/docs/llm-mcp/when-delegating-to-a-local-model-pays-off).
- Looking up an argument: [Tools](/docs/llm-mcp/tools), generated from the server itself.
