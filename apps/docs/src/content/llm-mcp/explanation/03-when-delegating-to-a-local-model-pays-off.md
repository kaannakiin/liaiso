# When delegating to a local model pays off

A local model is free per token and keeps text out of the planning agent's context. It is also
slower and less capable than the agent that calls it. This page sets out what was measured about
that trade, so that you and your agent can decide what to hand off.

All runs below used Codex (`gpt-5.6-luna` at low reasoning effort) against Ollama 0.34.2 with a
16,384-token window. "Input" is the planning agent's uncached input tokens.

## Rows with clear cues: do it yourself

On a 400-row labelling task whose rows carried clear cues, Codex alone labelled all 14 groups
correctly in 53 seconds. Delegating the same task through `local_map` was also correct, but took
155 seconds. A script written by the agent reads a keyword or a column in milliseconds, and the
agent only needs to see a sample of the rows to write it.

When a keyword or a column decides the answer, a script is faster and exact.

## Rows without cues: delegate, and check

With the cues removed, Codex alone still got 14 of 14, by reading 200 rows and writing a rule. The
first delegated run, with a vague instruction, got 2 of 14 and left 24 rows unlabelled. Given an
instruction that named the cues the agent had seen in a sample, and told to check the returned
samples, the delegated run got 14 of 14 with every row labelled, while the agent never read the
file.

The instruction is the work. `local_map` returns sample rows per label for this reason, and the
agent should read them before it trusts the output.

## Long documents: delegate

On 17 documents, Codex alone read only the first 240 lines of each and produced 17 records. With
`local_task` and chunking, the agent read no document itself: the 17 calls arrived at once, the
queue cleared in 157 seconds, and every document was read to the end. The agent's input was about
25,700 tokens instead of 34,100.

This is the case the server is built for: long or unstructured text, where reading it all is the
expensive part and the answer is short.

## Why not point the agent at the model directly

Four ways of connecting Codex to a local model were tried. Codex speaking to Ollama's API directly
connected, but the model did not know Codex's tool protocol, and every Codex turn starts with about
37,000 tokens of its own instructions, which do not fit a 16k window. Letting the agent run `curl`
needed network access for its whole sandbox. Codex's sub-agents accept only OpenAI models. Only an
MCP server worked: it runs outside the agent's sandbox, and the local model receives just the prompt
for one task, 196 tokens in the measured run.

## Choosing a model

The server needs a model that can hold a JSON schema. `gpt-oss:20b` was measured scoring 0 out of
100 on the numbered-row schema `local_map` and structured `local_task` calls rely on. The
measurements in the repository were made with Qwen 3 models. There is no default: name the model you
have measured.
