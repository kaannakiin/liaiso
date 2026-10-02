# How to size the context window

The server asks Ollama for a context window of 16,384 tokens and plans every call inside it. Use
this page to change that window, and to know what each size lets one call carry.

## Set the window

`SEZZLEE_LLM_NUM_CTX` sets the window, at least 4096:

```json
{
  "env": {
    "SEZZLEE_LLM_MODEL": "qwen3:8b",
    "SEZZLEE_LLM_NUM_CTX": "32768"
  }
}
```

Set it to what your GPU actually holds for the model, not to the largest the model supports. Ollama
does not refuse a prompt larger than the window it could allocate; it drops the start of the prompt
and answers from the rest. The server's input budget is derived from this number, so a number that
is too large makes the server send inputs Ollama will quietly cut.

## What one call may carry

Of the window, 45% is the input budget and 40% is the most the answer may use; the rest is left for
the server's own instructions. The server estimates 1.8 characters per token, which is about right
for Turkish and cautious for English, where a token is closer to four characters:

| `SEZZLEE_LLM_NUM_CTX` | Input budget  | About this much text | Answer at most |
| --------------------- | ------------- | -------------------- | -------------- |
| 4,096                 | 1,843 tokens  | 3,300 characters     | 1,638 tokens   |
| 16,384                | 7,372 tokens  | 13,300 characters    | 6,553 tokens   |
| 32,768                | 14,745 tokens | 26,500 characters    | 13,107 tokens  |

`local_status` reports `contextTokens` and `inputBudgetTokens` for the running server. A larger
window lets `classify`, `transform` and `free` take longer inputs, and lets `summarize` and
`extract` split into fewer chunks; it also takes more GPU memory and makes each call slower.

## Keep the model loaded

`SEZZLEE_LLM_KEEP_ALIVE`, `30m` by default, is how long Ollama keeps the model in memory after a
call. Loading a model takes seconds to minutes, so an agent that delegates in bursts is faster with
the model kept warm. The server asks Ollama to load the model as soon as it starts.

## Give slow calls time

`SEZZLEE_LLM_TIMEOUT_MS`, five minutes by default, bounds one request to the model, from the moment
it leaves the queue. A request that runs out fails with `backend_unavailable`. Calls run one at a
time, so the client's own tool timeout has to cover the wait behind other calls as well; that is why
the Codex configuration in [How to connect the server to your MCP
client](/docs/llm-mcp/connect-the-server-to-your-mcp-client) allows 900 seconds.
