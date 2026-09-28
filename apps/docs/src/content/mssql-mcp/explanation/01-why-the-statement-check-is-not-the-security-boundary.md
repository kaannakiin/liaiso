# Why the statement check is not the security boundary

The server refuses a statement that does not begin with `SELECT` or `WITH`, that holds more than one
statement, or that contains a word that writes. It would be easy to read that as "the server is
read-only". It is not, and the server says so in every `describe_connection` answer. This page
explains why the check exists anyway, and what actually keeps the data safe.

## Reading SQL is not the same as knowing what it does

The check reads the statement's text. It masks comments and string literals so that `-- DELETE` or
`'DROP'` in a value does not trip it, then looks at the first word and for write keywords. That is
enough for honest mistakes. It is not enough against a statement written to get past it, because
T-SQL gives a determined writer many routes that start with `SELECT`: a function with side effects,
an `EXEC` built from a string somewhere the check does not expect, a feature added to the language
after the check was written. A parser that tries to prove a statement harmless has to be right about
every one of them, forever.

SQL Server also has no read-only session to fall back on. `ApplicationIntent=ReadOnly` sends a
connection to a readable secondary replica in an availability group; on a standalone server it
changes nothing. So `describe_connection` reports `sessionIntent: "none"` rather than claim a
guarantee that does not exist.

## The login decides

What a statement can do is decided by SQL Server, from the permissions of the login that runs it. A
login that is a member of `db_datareader` and nothing else cannot insert, update, delete or change a
schema, whatever the statement looks like, because the database refuses it. That refusal cannot be
talked around by clever SQL, and it covers every route the text check might miss.

So the layers are, from strongest to weakest:

1. **The login's permissions**, which SQL Server enforces. This is the guarantee.
2. **No read-only session**, reported honestly as `sessionIntent: "none"`.
3. **The statement check**, reported as `statementGuard: "advisory"`.

## Then why check at all

Because an agent that tries to write should learn it cannot, in words it understands, before
anything reaches the database. Without the check, `DELETE FROM orders` against a read-only login
would fail with SQL Server's permission error, which an agent may read as a problem to route around.
With it, the answer is `write_not_permitted`, with a recovery that says to rewrite the request as a
`SELECT`. The check turns a write attempt into a clear, early error; it does not make one
impossible.

This is also why the server passes an agent's statement to SQL Server only through the check's
approval, and passes names to its own catalogue queries as parameters rather than as text an agent
wrote. Neither of those is the security boundary either. The boundary is the login: [How to create a
read-only login for the server](/docs/mssql-mcp/create-a-read-only-login-for-the-server).
