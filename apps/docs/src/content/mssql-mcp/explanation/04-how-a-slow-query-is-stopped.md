# How a slow query is stopped

An agent can write a statement that runs for an hour. The server gives every statement a deadline,
and when the deadline passes it stops the statement on SQL Server, not only its own wait for the
answer. This page explains how, and why the obvious ways of doing it are wrong.

## Giving up is not stopping

The simplest deadline is to stop waiting: race the query against a timer and return an error when
the timer wins. The agent gets its error on time, and SQL Server goes on running the statement,
holding its locks, and using the connection. The next call handed that connection then reads the
end of someone else's result. The server's code forbids exactly this pattern.

The driver's own timeout setting is not enough either. Measured on the pinned driver version, a
request timeout of 800 milliseconds did not interrupt a ten-second `WAITFOR DELAY`. So the deadline
is the server's own timer, and when it fires the server sends SQL Server a cancel for that
statement.

## A connection is reused only once it is quiet

Cancelling is a request. SQL Server stops the statement and then confirms, and until it does, the
connection is still busy. The server holds on to the connection until the confirmation arrives,
and only then returns it to the pool. If the confirmation takes more than five seconds, the
connection is destroyed and a new one is opened later. A late answer to a cancelled statement can
therefore never arrive on a connection that is serving another call.

Each of the up to four connections to SQL Server is used by one call at a time, which is what makes
cancelling one statement safe. A call that arrives while all four are busy waits for one to be free,
up to 32 waiting calls; beyond that, it fails with `resource_limit` rather than queue without
bound.

## Deadlines that do not depend on the query

Two other waits are bounded too. Opening a connection is given `SEZZLEE_MSSQL_CONNECT_TIMEOUT_MS`, 15
seconds by default, so an unreachable server is reported as `connection_failed` rather than hanging
the call. Every connection is also opened with `SET LOCK_TIMEOUT` equal to the query deadline, so
a read that waits on a row a writer has locked gives up at the deadline instead of waiting for the
writer to finish.

## What the agent sees

A statement stopped at its deadline fails with `query_timeout` and a recovery that suggests a
narrower query or a larger `timeoutMs`. A call that the client cancels, or that ends before the
statement finishes, fails with `query_cancelled`. In both cases the statement has stopped using the
database. [How to set a deadline for a slow query](/docs/mssql-mcp/set-a-deadline-for-a-slow-query)
shows both settings.
