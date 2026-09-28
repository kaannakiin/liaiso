# Why local calls wait in one queue

An agent that delegates tends to delegate in bursts: Codex was measured firing 17 `local_task`
calls at once, one per document. The server sends them to the model one at a time. This page
explains why a queue is faster than it looks, and what it means for timeouts.

## One GPU does one thing at a time

A local model usually runs on one GPU. Measured: four requests sent to it in parallel finished only
1.1 times faster than the same four sent one after the other. The GPU does not run them side by
side; it interleaves them, and each one takes about four times as long.

That matters because every call has a timeout. Seventeen calls in parallel would each take
seventeen times longer than one, and would all run out of time together, with nothing to show for
the work. In a queue, each call runs at full speed when its turn comes, and the first answers come
back while the later calls are still waiting. The seventeen documents above cleared the queue in
157 seconds, and none timed out.

## What the queue changes for the caller

The server's own timeout, `LIAISO_LLM_TIMEOUT_MS`, starts when a call leaves the queue, so waiting
never uses it up. The client's timeout is different: it starts when the agent makes the call, and
it has to cover the wait. That is why the Codex configuration allows 900 seconds per tool call.

`local_status` reports how many calls are waiting, and it does not wait itself: a status question
never queues behind a long job. An agent that sees a long queue can decide to do small work itself
instead.

## Why not more parallelism

Raising concurrency would help only with more than one GPU, or more than one host. The model host
is one `Backend` behind the queue, and the rest of the server does not know how it is served. A host
that genuinely runs requests in parallel would be a different backend with a different queue, not a
larger number here.
