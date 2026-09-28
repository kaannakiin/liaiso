# How to label the rows of a CSV file

`local_map` gives every row of a CSV file one label from a list you choose, and writes a labelled
copy. Use it for row-by-row judgement that needs reading, such as sorting a support queue, when the
agent should not spend its context on the rows.

The examples use [tickets.csv](/samples/llm-mcp/tickets.csv), twelve support tickets, and the `llm`
helper from [Handing your first task to a local
model](/docs/llm-mcp/handing-your-first-task-to-a-local-model):

```sh
llm() {
  npx -y @modelcontextprotocol/inspector --cli liaiso-llm -- \
    -e LIAISO_LLM_MODEL="$LIAISO_LLM_MODEL" -e LIAISO_LLM_ROOT="$HOME/liaiso-llm" \
    --method tools/call --tool-name "$@" | jq '.content[0].text | fromjson'
}
```

## Label the file

Give two to 50 labels, and an instruction that says how to choose, naming the cues:

```sh
llm local_map --tool-arg file=tickets.csv \
  instruction="Would a human agent need to answer this ticket today? urgent for money taken wrongly, a wrong or damaged item, or an app that blocks ordering; later for everything else." \
  'labels=["urgent","later"]' labelColumn=priority \
  | jq '{rows, counts, unlabeled, batches, calls, retriedRows, verify}'
```

```json
{
  "rows": 12,
  "counts": {
    "urgent": 6,
    "later": 6
  },
  "unlabeled": 0,
  "batches": 1,
  "calls": 1,
  "retriedRows": 0,
  "verify": "Check the sample rows against your intent before using the output; if they are wrong, sharpen the instruction and run again."
}
```

`labelColumn` names the new column; it defaults to `label`, and a name the file already has is
refused. Rows are sent in batches, each row with its number, and the model answers with the number
of each row it labels. A row missing from the answer is asked for once more, counted in
`retriedRows`; a row still missing after that stays empty and is counted in `unlabeled`, never given
a guessed label.

## Check the samples before using the output

`verify` is not decoration. Read the samples the answer returns for each label:

```sh
llm local_map --tool-arg file=tickets.csv \
  instruction="Would a human agent need to answer this ticket today? urgent for money taken wrongly, a wrong or damaged item, or an app that blocks ordering; later for everything else." \
  'labels=["urgent","later"]' labelColumn=priority \
  | jq -r '.sample.urgent[]'
```

```text
1,Charged twice,"I was billed two times for order 1004, please refund one of them."
3,Login loop,"After the update the app sends me back to the login screen every time I sign in."
7,Discount not applied,"The 10% code WELCOME10 was accepted but the total did not change."
9,App crashes,"The Android app closes as soon as I open the order history."
```

If a sample is wrong, sharpen the instruction and run again. Each run writes a new file and leaves
the earlier ones in place.

## Read the output

The answer's `output` is the new file's path inside the workspace:

```sh
llm local_map --tool-arg file=tickets.csv \
  instruction="Would a human agent need to answer this ticket today? urgent for money taken wrongly, a wrong or damaged item, or an app that blocks ordering; later for everything else." \
  'labels=["urgent","later"]' labelColumn=priority \
  | jq -r '.output' | sed 's/-[a-z0-9]*\.csv$/-….csv/'
```

```text
.llm-mcp/out/tickets-priority-….csv
```

The name is chosen by the server, from the input's name, the column and a time stamp, and always
ends in `.csv`. The file is created new; nothing is overwritten and the input is never changed.

## Limits

One call reads a file of up to 8 MiB and 2,000 data rows, which the model was measured labelling in
about nine minutes. Split a larger file and label each part. The first line must be the header;
commas, semicolons and tabs are recognised as the delimiter, and quoted fields may contain newlines.

## When a script is better

If a keyword or a column value decides the label, a script is faster and exact. On a 400-row task
with clear cues, an agent working alone was as accurate as delegating and about three times faster.
`local_map` pays off when each row has to be read and understood, such as free-text messages; see
[When delegating to a local model pays
off](/docs/llm-mcp/when-delegating-to-a-local-model-pays-off).
