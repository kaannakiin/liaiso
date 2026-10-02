# How to set a deadline for a slow query

Every statement runs under a deadline, 30 seconds unless you change it. When the deadline passes,
the server cancels the statement on SQL Server, not only the wait for its answer. Use this page to
shorten or lengthen that deadline for one call or for the whole server.

The examples use the `sql` helper from [Querying your first
database](/docs/mssql-mcp/querying-your-first-database):

```sh
sql() {
  npx -y @modelcontextprotocol/inspector --cli --config ~/sezzlee-mssql.json --server shop \
    --method tools/call --tool-name "$@" | jq '.content[0].text | fromjson'
}
```

## For one call

`timeoutMs` sets the deadline of one `run_query` call, from 100 milliseconds to ten minutes. This
statement counts billions of rows, so it cannot finish in one second:

```sh
sql run_query --tool-arg sql="SELECT COUNT_BIG(*) AS n FROM sys.all_objects AS a CROSS JOIN sys.all_objects AS b CROSS JOIN sys.all_objects AS c" timeoutMs=1000
```

```text
{"error":{"code":"tool_is_error","message":"Tool 'run_query' returned isError:true."}}
{
  "error": "query_timeout",
  "message": "The query exceeded its 1000 ms deadline. (ETIMEOUT)",
  "recovery": "Narrow the query with a filter or a paging clause, or pass a larger timeoutMs."
}
```

The first line comes from the Inspector; the object under it is the server's answer. The statement
was cancelled on the server after one second and stopped using the database.

## For every call

`SEZZLEE_MSSQL_QUERY_TIMEOUT_MS` sets the deadline for any call that does not pass `timeoutMs`. Add
it to the server's environment, for example to allow two minutes:

```json
{
  "env": {
    "SEZZLEE_MSSQL_QUERY_TIMEOUT_MS": "120000"
  }
}
```

`describe_connection` reports the deadline in force as `limits.queryTimeoutMs`, so an agent can read
it before it writes an expensive query. The same value is the session's `LOCK_TIMEOUT`: a read that
waits on a lock held by a writer gives up at the deadline instead of waiting until the writer is
done.

## When the statement does not stop

Cancelling asks SQL Server to stop, and SQL Server answers when it has. If that takes more than five
seconds, the server closes that connection instead of reusing it, so a late answer can never be
mistaken for the next call's result. The call has already failed with `query_timeout` by then.

## Keep queries short

A short deadline is a good default for an agent. Most questions it asks are answered by a filter
and a `GROUP BY`, and a query that needs minutes is usually one that reads a whole table it could
have filtered first.
