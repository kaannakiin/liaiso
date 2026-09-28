# How to create a read-only login for the server

The server refuses statements that do not look like reads, but that check can be defeated and is
not meant to protect your data. The login it connects with is what decides what it can do. Give it a
login that can read and nothing else.

> **Not run by us.** These statements need permissions our test login does not hold; they follow the
> SQL Server documentation for `CREATE LOGIN`, `CREATE USER` and the `db_datareader` role.

## Create the login and the user

Connected as an administrator, create a login on the server and a user for it in the database the
server will read:

```text
CREATE LOGIN mcp_reader WITH PASSWORD = 'a long random password', CHECK_POLICY = ON;
GO
USE Sales;
GO
CREATE USER mcp_reader FOR LOGIN mcp_reader;
ALTER ROLE db_datareader ADD MEMBER mcp_reader;
GO
```

`db_datareader` can `SELECT` from every table and view in that database and nothing more: no
`INSERT`, `UPDATE`, `DELETE`, no schema changes, and no stored procedures. It grants nothing in any
other database.

## Narrow it further

To expose only some tables, leave the role out and grant `SELECT` on a schema or on single objects:

```text
GRANT SELECT ON SCHEMA::reporting TO mcp_reader;
DENY SELECT ON dbo.payroll TO mcp_reader;
```

`search_catalog` lists only what the login can see, so an object it may not read does not appear in
the agent's results at all. A query against it fails with `object_not_found` or
`permission_denied`.

## Check what the login can do

Connected as `mcp_reader`, this lists the database roles it belongs to:

```text
SELECT r.name FROM sys.database_role_members AS m
JOIN sys.database_principals AS r ON r.principal_id = m.role_principal_id
WHERE m.member_principal_id = USER_ID();
```

The only row should be `db_datareader`. If `db_owner` or `db_datawriter` appears, a statement that
slips past the server's check will really write.

Then put the login's name and password in the server's environment: [How to connect the server to
your MCP client](/docs/mssql-mcp/connect-the-server-to-your-mcp-client).
