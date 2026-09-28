# How to summarise a document longer than the model's window

A local model's context window is small. `summarize` and `extract` read a longer input anyway, by
splitting it and merging what each part yields. Use this page to see when that happens and what the
other kinds do instead.

The examples use [operations-2026.txt](/samples/llm-mcp/operations-2026.txt), twelve monthly meeting
notes of about 15,600 characters, and the `llm` helper from [Handing your first task to a local
model](/docs/llm-mcp/handing-your-first-task-to-a-local-model):

```sh
llm() {
  npx -y @modelcontextprotocol/inspector --cli liaiso-llm -- \
    -e LIAISO_LLM_MODEL="$LIAISO_LLM_MODEL" -e LIAISO_LLM_ROOT="$HOME/liaiso-llm" \
    --method tools/call --tool-name "$@" | jq '.content[0].text | fromjson'
}
```

## See the budget

```sh
llm local_status | jq -c '{contextTokens, inputBudgetTokens}'
```

```json
{"contextTokens":16384,"inputBudgetTokens":7372}
```

The server estimates an input at 1.8 characters per token, so 7,372 tokens is about 13,300
characters. The year's notes are longer than that.

## Summarise it

```sh
llm local_task --tool-arg kind=summarize \
  instruction="Summarise the year for the board: what changed, with figures." \
  'files=["operations-2026.txt"]' | jq -r '"chunks: \(.chunks), reduceRounds: \(.reduceRounds)\n\n\(.answer)"'
```

```text
chunks: 2, reduceRounds: 1

**2026 Revenue Hits EUR 4.17M with Late Deliveries Dropping from 14% to 2% Following Carrier Switch and Pricing Adjustments**

*   **Revenue Growth:** Total annual revenue reached approximately EUR 4,166,000, driven by a monthly trend rising from EUR 310k in January to a peak of EUR 402k in December, with Black Friday week generating a record EUR 118,000.
*   **Logistics Improvement:** Late delivery rates improved from 14% in January to 2% in December, primarily due to the NorthSea Freight carrier trial (started April, extended to all regions) and the completion of the Rotterdam warehouse relocation in March.
*   **Pricing Strategy:** Desk prices were reduced by 8% in September after a review found them 12% above market average, resulting in a 19% increase in desk order volume in the first two weeks.
*   **Support Efficiency:** Migration to a new ticketing tool in August reduced average first response time from 9 hours to 3 hours, while common issues remained focused on delivery queries and invoice corrections.
*   **Operational Stability:** Stock levels for all key products (desks, chairs, lamps, shelves) remained above safety thresholds throughout the year, and no supplier changes were made despite monthly scorecard reviews.
*   **Year-End Actions:** Two temporary staff were hired for Black Friday, the old carrier contract ended on December 31, and the 2027 plan is due by January 20.
```

The server split the file into chunks at paragraph boundaries, asked the model for notes on each,
then gave the model all the notes with your instruction one last time. `chunks` says how many parts
were read, and `reduceRounds` how many times notes were merged: one when they fit together, more
when the merged notes were themselves too long, up to three. Every part of the file was read, so a
fact in December is as likely to reach the summary as one in January.

`extract` works the same way: each chunk yields the fields it holds, and the merge combines them.

## The other kinds refuse

`classify`, `transform` and `free` need the whole input at once, so they do not split it:

```sh
llm local_task --tool-arg kind=free instruction="Which month had the highest revenue?" \
  'files=["operations-2026.txt"]'
```

```text
{"error":{"code":"tool_is_error","message":"Tool 'local_task' returned isError:true."}}
{
  "error": "input_too_large",
  "message": "The input is about 8759 tokens; one local call takes at most 7372.",
  "recovery": "summarize and extract split long input themselves; for other kinds split the input and call once per part, or do the work yourself."
}
```

The first line comes from the Inspector; the object under it is the server's answer. Nothing was
sent to the model: the server counted first. Ollama would not have refused. It would have dropped
the start of the input, and the model would have answered from the months it saw. For a question
like this one, ask `extract` for the monthly figures and compare them yourself, or run a script.

## How far splitting goes

A split input may be up to 1 MiB and 32 chunks. Beyond that, or when three merge rounds still do not
fit, the call fails with `input_too_large` before or instead of sending more. Each chunk is one
model call, so a large file takes minutes; with the default window, one chunk holds about 13,000
characters.
