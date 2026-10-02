# How to connect the server to your MCP client

Every client starts the server as a local command with no arguments and passes the connection in
its environment. The server runs until the client closes it.

> **Not run by us.** The Claude Code command below was checked against `claude mcp add --help`; the
> JSON configurations follow each client's documented format but were not loaded into those clients
> for this page.

## The variables

Four are required. The server stops at startup and names the missing ones if any is absent:

| Variable                                 | Default  | Meaning                                                        |
| ---------------------------------------- | -------- | -------------------------------------------------------------- |
| `SEZZLEE_MSSQL_SERVER`                   | required | Host name or address of the SQL Server.                        |
| `SEZZLEE_MSSQL_DATABASE`                 | required | The one database the server reads.                             |
| `SEZZLEE_MSSQL_USER`                     | required | SQL Server login.                                              |
| `SEZZLEE_MSSQL_PASSWORD`                 | required | Its password.                                                  |
| `SEZZLEE_MSSQL_PORT`                     | `1433`   | TCP port.                                                      |
| `SEZZLEE_MSSQL_ENCRYPT`                  | `true`   | Encrypt the connection.                                        |
| `SEZZLEE_MSSQL_TRUST_SERVER_CERTIFICATE` | `false`  | Accept a server certificate that cannot be verified.           |
| `SEZZLEE_MSSQL_CONNECT_TIMEOUT_MS`       | `15000`  | Time allowed to open a connection.                             |
| `SEZZLEE_MSSQL_QUERY_TIMEOUT_MS`         | `30000`  | Deadline for a statement when a call does not set `timeoutMs`. |

A wrong value is caught at startup too: a port or timeout that is not a positive integer, or a flag
that is not `true` or `false`, stops the server with a message naming the variable. A database that
cannot be reached does not: connecting is lazy, so the server starts, lists its tools, and reports
`connection_failed` on the first call that needs the database.

Use a login that holds `db_datareader` and nothing else; see [How to create a read-only login for
the server](/docs/mssql-mcp/create-a-read-only-login-for-the-server).

## Claude Code

```sh
claude mcp add sales -e SEZZLEE_MSSQL_SERVER=db.example.com -e SEZZLEE_MSSQL_DATABASE=Sales \
  -e SEZZLEE_MSSQL_USER=mcp_reader -e SEZZLEE_MSSQL_PASSWORD=your_password \
  -- npx -y @sezzlee/mssql-mcp
```

Keep this entry in your user or local scope. `--scope project` writes it to `.mcp.json`, which is
shared with everyone who clones the repository, password included.

## Claude Desktop

Edit `claude_desktop_config.json` (**Settings → Developer → Edit Config**) and restart the app:

```json
{
  "mcpServers": {
    "sales": {
      "command": "npx",
      "args": ["-y", "@sezzlee/mssql-mcp"],
      "env": {
        "SEZZLEE_MSSQL_SERVER": "db.example.com",
        "SEZZLEE_MSSQL_DATABASE": "Sales",
        "SEZZLEE_MSSQL_USER": "mcp_reader",
        "SEZZLEE_MSSQL_PASSWORD": "your_password"
      }
    }
  }
}
```

## Cursor

Add the same `mcpServers` entry to `~/.cursor/mcp.json`. A project's `.cursor/mcp.json` works too,
but it is usually committed, and this entry holds a password.

## VS Code

Add a server to `.vscode/mcp.json`. VS Code names the top-level key `servers`, wants the transport
stated, and can prompt for the password instead of storing it:

```json
{
  "inputs": [{ "id": "mssql-password", "type": "promptString", "description": "SQL Server password", "password": true }],
  "servers": {
    "sales": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@sezzlee/mssql-mcp"],
      "env": {
        "SEZZLEE_MSSQL_SERVER": "db.example.com",
        "SEZZLEE_MSSQL_DATABASE": "Sales",
        "SEZZLEE_MSSQL_USER": "mcp_reader",
        "SEZZLEE_MSSQL_PASSWORD": "${input:mssql-password}"
      }
    }
  }
}
```

## More than one database

One server reads one database. To give an agent two, add two entries with different names and
different `SEZZLEE_MSSQL_DATABASE` values. Each tool's answer names the database it came from.

## Check that it started

Ask the agent what it is connected to. It should call `describe_connection`, which names the
database and the login and never returns the password. If the client reports that the server
exited, run the command in a terminal with the same variables set: a missing variable prints its
name.
