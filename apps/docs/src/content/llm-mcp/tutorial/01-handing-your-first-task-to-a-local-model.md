# Handing your first task to a local model

By the end of this page a model on your own machine will have summarised a meeting, returned its
action items as JSON, and labelled a support queue, without any of the text passing through the
agent that asked.

You will call the tools yourself, the way an agent does, so you can see exactly what the agent
receives. You need Node.js 22 or later, `jq`, and [Ollama](https://ollama.com/download) running.

## 1. Pull a model

The server works with any Ollama model that can follow a JSON schema. `qwen3:8b` is a good start
on a machine with 8 GB of GPU memory:

```sh
ollama pull qwen3:8b
```

The answers on this page were produced with `qwen3.8:latest`, a 27-billion-parameter Qwen model, so
yours will read differently. The shape of each answer is the same whichever model you use.

## 2. Install the server

```sh
npm install -g @liaiso/llm-mcp
```

This puts the `liaiso-llm` command on your path.

## 3. Give it a folder

The server reads files only inside its workspace, and writes only into an output folder inside it:

```sh
mkdir -p ~/liaiso-llm
```

Download [meeting-notes.txt](/samples/llm-mcp/meeting-notes.txt),
[tickets.csv](/samples/llm-mcp/tickets.csv) and
[operations-2026.txt](/samples/llm-mcp/operations-2026.txt) and save them into `~/liaiso-llm`.

## 4. Make calling a tool short

The server takes its settings from environment variables. Name the model you pulled:

```text
export LIAISO_LLM_MODEL=qwen3:8b
```

The MCP Inspector can start the server and call one tool from the command line. It passes the server
none of your shell's environment, so the function below hands over the model and the workspace with
`-e`:

```sh
llm() {
  npx -y @modelcontextprotocol/inspector --cli liaiso-llm -- \
    -e LIAISO_LLM_MODEL="$LIAISO_LLM_MODEL" -e LIAISO_LLM_ROOT="$HOME/liaiso-llm" \
    --method tools/call --tool-name "$@" | jq '.content[0].text | fromjson'
}
```

Everything before `--` is the server's command; everything after it is for the Inspector. The `jq`
at the end unpacks the JSON each tool answers with.

## 5. Check the model

```sh
llm local_status | jq '{model, reachable, contextTokens, inputBudgetTokens}'
```

```json
{
  "model": "qwen3.8:latest",
  "reachable": true,
  "contextTokens": 16384,
  "inputBudgetTokens": 7372
}
```

`reachable` says Ollama answered. `inputBudgetTokens` is the most input one call may send: 45% of
the 16,384-token window the server asks Ollama for, leaving room for the instructions and the
answer.

## 6. Summarise a file

Pass the path, not the text:

```sh
llm local_task --tool-arg kind=summarize instruction="Summarise for the team lead." 'files=["meeting-notes.txt"]' \
  | jq -r '.answer'
```

```text
**West Region Delivery Delays Persist; Carrier Trial Approved**

*   West region missed delivery targets for the third consecutive month, with 14% of orders arriving late.
*   Emre is evaluating a second carrier and will report findings by 30 January.
*   Ada approved a EUR 18,000 budget for the new carrier trial.
*   The Rotterdam warehouse relocation remains on schedule for completion in March.
*   Lena identified an obsolete fax number field in the returns form, which will be removed in the next release.
```

The agent that made this call received this summary and nothing else. The notes themselves were read
by the server and seen only by the local model.

## 7. Get the action items as JSON

`extract` pulls named fields out of the input. With `jsonSchema`, the model's answer is constrained
to that schema and returned as `result`:

```sh
llm local_task --tool-arg kind=extract \
  instruction="The trial budget in euros, who approved it, and every action item with its owner and due date." \
  'files=["meeting-notes.txt"]' \
  'jsonSchema={"type":"object","properties":{"budgetEur":{"type":["number","null"]},"approvedBy":{"type":["string","null"]},"actions":{"type":"array","items":{"type":"object","properties":{"owner":{"type":"string"},"action":{"type":"string"},"due":{"type":["string","null"]}},"required":["owner","action","due"]}}},"required":["budgetEur","approvedBy","actions"]}' \
  | jq '.result'
```

```json
{
  "budgetEur": 18000,
  "approvedBy": "Ada",
  "actions": [
    {
      "owner": "Emre",
      "action": "talk to a second carrier and report back",
      "due": "30 January"
    },
    {
      "owner": "Lena",
      "action": "remove fax number from returns form in next release",
      "due": null
    }
  ]
}
```

A field the notes do not state comes back `null` rather than invented.

## 8. Label a support queue

`local_map` gives every row of a CSV file one of the labels you allow:

```sh
llm local_map --tool-arg file=tickets.csv \
  instruction="Label each ticket by what the customer needs: billing for charges, refunds, invoices and discounts; delivery for late, lost, damaged or wrong parcels; bug for the app or website not working; other for anything else." \
  'labels=["billing","delivery","bug","other"]' \
  | jq '{rows, counts, unlabeled, sample: .sample.other}'
```

```json
{
  "rows": 12,
  "counts": {
    "billing": 4,
    "delivery": 4,
    "bug": 3,
    "other": 1
  },
  "unlabeled": 0,
  "sample": [
    "10,Thank you,\"Just wanted to say the chair is great, thanks for the quick help last week.\""
  ]
}
```

All twelve rows were labelled. The answer carries the counts per label and up to four sample rows
for each, here the one `other`, so the agent can check the labels match its intent without reading
the file. The labelled copy is a new file in the server's output folder:

```sh
head -4 ~/liaiso-llm/.llm-mcp/out/tickets-label-*.csv
```

```text
id,subject,message,label
1,Charged twice,"I was billed two times for order 1004, please refund one of them.",billing
2,Where is my desk?,"Ordered an oak desk ten days ago and the tracking page has not moved since Monday.",delivery
3,Login loop,"After the update the app sends me back to the login screen every time I sign in.",bug
```

The original columns are untouched and a `label` column is added. The input file is never changed,
and an existing file is never overwritten.

## What you did

You pointed the server at one folder and one model, and had the model summarise a file, fill a
schema from it, and label a CSV, while the caller received only answers. To give these tools to an
agent, see [How to connect the server to your MCP
client](/docs/llm-mcp/connect-the-server-to-your-mcp-client).
