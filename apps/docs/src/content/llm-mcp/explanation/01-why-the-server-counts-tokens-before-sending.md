# Why the server counts tokens before sending

A model can only read what fits in its context window. It would be natural to send the input and
let the model host refuse one that is too long. The server does not rely on that, because Ollama
does not refuse. This page explains what happens instead and why the server counts first.

## Ollama cuts silently

Ollama gives a model a fixed window, 16,384 tokens by default here, and when a prompt is longer it
keeps the end and drops the beginning. It returns no error and no warning. Measured: 84,608
characters sent into a 16k window came back as 8,194 processed tokens, with the start of the input
simply gone. The model then answers from what is left, fluently and with confidence.

For the tasks this server exists for, the start is often what matters: the heading of a document,
the first months of a year, the rows at the top of a file. A summary of the second half of a report
reads like a summary of the report. Nothing in the answer tells the agent that it is not.

## Counting on the server's side

So the server estimates every input before it sends it, and treats 45% of the window as the input
budget. The rest is room for the server's own instructions and for the answer, which is itself
capped at 40% of the window so that a model caught in a loop stops inside the window rather than at
the timeout.

The estimate is 1.8 characters per token. That was measured on Turkish text, where tokens are
short. English runs closer to four characters per token, so for English the estimate is
pessimistic. That is the direction an estimate should err in: a refused input costs one call, a cut
input costs a wrong answer nobody notices.

A file whose size alone proves it cannot fit is refused before it is read, since a character takes
at most four bytes.

## Split, or refuse

When an input is over the budget, the server does one of two things, never a third:

- For `summarize` and `extract`, it splits the input at paragraph and line boundaries and reads
  every part. Each chunk yields notes, and the notes are merged with the instruction one last time,
  in up to three rounds. The answer says how many chunks were read.
- For every other kind, it refuses with `input_too_large` and sends nothing. A `transform` or a
  `free` question over half a document is not the same question, so the server does not pretend it
  is.

The third option, sending the input and letting it be cut, is the one the design rules out.
`LIAISO_LLM_NUM_CTX` has to match what the GPU really delivers for the same reason: the budget is
only as honest as the window it is computed from.
