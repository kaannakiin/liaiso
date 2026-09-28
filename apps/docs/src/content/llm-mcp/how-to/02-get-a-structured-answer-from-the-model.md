# How to get a structured answer from the model

`local_task` answers in prose unless you give it a JSON Schema. Use this page to pick the task
kind, pass the input, and get back JSON your agent can use without parsing sentences.

The examples use the samples and the `llm` helper from [Handing your first task to a local
model](/docs/llm-mcp/handing-your-first-task-to-a-local-model), with `LIAISO_LLM_MODEL` exported:

```sh
llm() {
  npx -y @modelcontextprotocol/inspector --cli liaiso-llm -- \
    -e LIAISO_LLM_MODEL="$LIAISO_LLM_MODEL" -e LIAISO_LLM_ROOT="$HOME/liaiso-llm" \
    --method tools/call --tool-name "$@" | jq '.content[0].text | fromjson'
}
```

## Pick the kind

`kind` chooses the instructions the server gives the model:

| Kind        | Answers with                         | A long input is             |
| ----------- | ------------------------------------ | --------------------------- |
| `summarize` | a headline and the key facts         | split and read whole        |
| `extract`   | the requested fields, null if absent | split and read whole        |
| `classify`  | labels                               | refused (`input_too_large`) |
| `transform` | the input rewritten as instructed    | refused                     |
| `free`      | a direct answer to the instruction   | refused                     |

`instruction` says precisely what to do. The input is `text`, for a short string, or `files`, up to
eight paths inside the workspace, or both.

## Constrain the answer with a schema

With `jsonSchema`, Ollama constrains the model's output to the schema and the server parses it. The
answer arrives as `result` instead of `answer`:

```sh
llm local_task --tool-arg kind=classify \
  instruction="Is this message a complaint, a question or praise, and how urgent is it?" \
  text="Third time this month the delivery came a day after the promised date." \
  'jsonSchema={"type":"object","properties":{"type":{"enum":["complaint","question","praise"]},"urgency":{"enum":["low","medium","high"]}},"required":["type","urgency"]}' \
  | jq -c '{kind, result}'
```

```json
{"kind":"classify","result":{"type":"complaint","urgency":"high"}}
```

An `enum` keeps the answer to values your agent already handles. Mark every field `required`, and
allow `null` for one the input may not contain, so that a missing value is `null` rather than a
guess or an absent key.

## Rewrite text

`transform` returns the input rewritten. Without a schema the answer is text:

```sh
llm local_task --tool-arg kind=transform \
  instruction="Rewrite as a two-sentence customer update, in a friendly tone, without internal names." \
  'files=["meeting-notes.txt"]' | jq -r '.answer'
```

```text
We are actively working to improve our delivery performance in the West region and expect to have an update on our new logistics options by the end of January. Additionally, please note that the outdated fax number field will be removed from the returns form in our next software release.
```

## When the answer is not valid JSON

A model can still fail a schema it cannot hold. The call then fails with `unparsable_output` rather
than returning a half-parsed object. Retry once with a simpler schema, flatter and with fewer
fields, or do the work without the local model. Some models cannot follow a schema at all:
`gpt-oss:20b` was measured scoring 0 out of 100 on the numbered-row schema `local_map` and
structured `local_task` calls rely on.

## What the answer carries besides the result

```sh
llm local_task --tool-arg kind=free instruction="In one word, which region had delivery problems?" \
  'files=["meeting-notes.txt"]' | jq -c 'del(.answer)'
```

```json
{"kind":"free","chunks":1,"reduceRounds":0,"promptTokens":167,"outputTokens":2,"durationMs":755}
```

`promptTokens` and `outputTokens` are what the model processed and produced. `chunks` is above 1,
and `reduceRounds` above 0, only when a long input was split; see [How to summarise a document
longer than the model's window](/docs/llm-mcp/summarise-a-document-longer-than-the-models-window).
