# Why charts and pivot tables are refused

The server cannot read charts, pivot tables or sparklines, in any format. When an agent asks for
them, `get_images` fails with `unsupported_object_kind`. It could instead answer with an empty
list, which would be simpler and would look like success. It does not, on purpose.

## An empty list is a claim

"There are no charts on this sheet" and "I cannot see charts" are different statements, and an
agent acts differently on each. Told the first, it tells the user the sheet has no charts, which
may be false. Told the second, it can say what it could not check, or ask the user to export the
chart's data. An empty list would say the first while meaning the second.

The same rule applies across the server. Asking a CSV for its tables fails with
`unsupported_for_format` instead of returning none, because a CSV cannot hold a table at all.
Absence is only reported when the server looked and found nothing.

## The ceiling is stated up front

`describe_workbook` returns a `capabilities` block for every file, and `charts`, `pivotTables` and
`sparklines` are `false` in all of them. An agent that reads the block before calling knows what it
can ask for, and a refused call is never a surprise it has to recover from.

Pictures are different: `get_images` does read embedded images, reporting where each is anchored and
how large it is. Charts live in separate parts of the file that the server never opens, pivot tables
have no model in the reader, and sparklines sit in an extension block the reader does not parse.
Until that changes, the honest answer is a refusal.
