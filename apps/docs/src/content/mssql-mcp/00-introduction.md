# Introduction

`@liaiso/mssql-mcp` is an MCP server that lets an agent read one Microsoft SQL Server database. The
agent can find tables by what they hold, read their columns and keys, and run `SELECT` statements.
There is no tool that writes.

The connection comes from environment variables that you set, never from a tool argument, so the
agent can neither see the password nor point the server at another database:

```sh
LIAISO_MSSQL_SERVER=db.example.com LIAISO_MSSQL_DATABASE=Sales \
LIAISO_MSSQL_USER=mcp_reader LIAISO_MSSQL_PASSWORD=... npx -y @liaiso/mssql-mcp
```

It speaks MCP over stdio and needs Node.js 22 or later. It was measured against SQL Server 2019
(15.0).

## What an agent can do

- **Find tables by concept**: `search_catalog` matches words against table, view and column names and
  their descriptions, ignoring case and accents, and says why each result matched.
- **Read a table's shape**: columns with types and nullability, primary, unique and foreign keys.
- **Run one read-only statement** and get typed rows, capped at 100 rows by default and 1,000 at
  most, with a deadline the server enforces by cancelling the statement.
- **Tell exact values from approximate ones**: a column whose values cannot reach JSON intact, such
  as a wide `decimal`, is flagged `lossy` rather than silently rounded.

## Read-only, and who guarantees it

The server refuses any statement that does not begin with `SELECT` or `WITH`, but that check is
there to give the agent a clear error, not to protect the data. The guarantee is the login you
connect with. Give it `db_datareader` and nothing else: [How to create a read-only login for the
server](/docs/mssql-mcp/create-a-read-only-login-for-the-server).

## Where to go next

- New to the server: [Querying your first database](/docs/mssql-mcp/querying-your-first-database)
  loads a small sample schema and ends with a join the agent wrote.
- Setting it up for an agent: [How to connect the server to your MCP
  client](/docs/mssql-mcp/connect-the-server-to-your-mcp-client).
- Looking up an argument: [Tools](/docs/mssql-mcp/tools), generated from the server itself.
- Handling a failure: [Error codes](/docs/mssql-mcp/error-codes).
