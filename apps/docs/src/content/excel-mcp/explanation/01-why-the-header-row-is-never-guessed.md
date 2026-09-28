# Why the header row is never guessed

Almost every useful answer the server gives depends on which row holds the column names.
`aggregate_sheet` finds `Total` by its header, `read_sheet` hoists the headers above the rows, and
`where` filters name columns the same way. Pick the wrong row and every one of those answers is
wrong, and wrong in a way that still looks like data.

## A guess fails silently

A heuristic that picks "the row that looks most like a header" is right on most sheets and wrong on
the rest. The trouble is what wrong looks like. If a guess lands on a title band, the agent gets a
column called `January sales report` and seven unnamed ones, and it may well carry on: summing the
wrong column, or reporting that a column does not exist. Nothing in the answer says a choice was
made, so nothing prompts the agent to doubt it.

A rule that is always the same — row 1, unless told otherwise — is wrong on the same sheets, but it
is wrong predictably, and the server can say so. That is the trade the server makes.

## Every answer says who chose

`headerRowSource` travels with every answer that uses a header: `default`, `explicit`, `declared`,
`scanned` or `cursor`. An agent that sees `default` knows row 1 was assumed, not established. When
the assumption looks wrong — row 1 yields no usable header text while exactly one other row does —
the answer adds a warning that names the other row. The server points; the agent decides.

## Proof instead of likelihood

`headerScan: true` is the way to hand the decision to the server, and it only answers when it can
prove the answer. An Excel Table or an autofilter that declares a header row is proof, because the
author declared it. Failing that, exactly one row of text headers in the first 20 rows is proof by
elimination. Anything short of that — no candidate, or two — is an error that quotes the candidates,
not a pick between them.

The cost is an extra call on a messy sheet. The benefit is that a header row the server reports is
either the one you gave, the one the file declares, or the only one possible.

The mechanics are in [How to read a sheet whose header is not in row
1](/docs/excel-mcp/read-a-sheet-whose-header-is-not-in-row-1).
