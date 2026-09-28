# Why a value can be marked lossy

Every column in a `run_query` or `describe_table` answer has a `kind`, and some also carry `lossy`.
The flag means that the value next to it is less faithful than its type promises. This page explains
where that loss happens, why the server reports it instead of fixing it, and why `bigint` is a
string.

## The loss happens before the server sees the value

JSON has one number type, an IEEE 754 binary64 float. It holds any integer up to 2^53 exactly and
about 15 significant decimal digits in general. SQL Server's `decimal(38,4)` holds 38 digits, and a
`datetimeoffset` holds a time zone offset that a JavaScript `Date` does not.

The server talks to SQL Server through the `mssql` driver, and the driver converts each value
before the server receives it. Measured on the pinned driver version, a wide `decimal` arrives as a
binary64 number with its low digits already gone: `123456789012345678.1234` arrives as
`123456789012345680`. A `datetimeoffset` arrives as a `Date`, the right instant with the offset
dropped.

## Why the server does not repair it

Once the digits are gone, nothing downstream can know what they were. The server could render the
damaged number as a string, but `"123456789012345680"` looks exact and is not: it would turn a
visible imprecision into an invisible one. So the value is passed on as the driver delivered it, and
the column says what happened:

- `lossy: "precision"` on a `decimal` or `numeric` whose precision is above 15 digits.
- `lossy: "timezone"` on a `datetimeoffset`.
- `lossy: "representation"` on a type the driver turns into a different shape.

The flag belongs to the column, not to each value, because the server cannot tell a rounded value
from one that happened to fit. It is also decided by the type alone, so the same column is flagged
the same way in `describe_table` and in `run_query`, and an agent can see before it queries which
columns need a cast to text.

## Why bigint is always a string

`bigint` is the one case where nothing is lost yet: the driver delivers wide integers as strings,
intact. The server keeps them strings, and it makes every `bigint` a string, even `1`. If only large
values were strings, the type of a value would depend on its size, and an agent that saw `42` in one
row and `"9007199254740993"` in the next would have to guess what the column holds. A column has one
kind, and every value in it has the same JSON type.

## The way out

For an exact value, ask SQL Server for text, which reaches the agent unchanged: `CAST(amount AS
varchar(50))`, or `CONVERT(varchar(33), booked_at, 126)` to keep the offset. Arithmetic belongs in
SQL, where the values are exact. [How to read exact numbers, dates and
IDs](/docs/mssql-mcp/read-exact-numbers-dates-and-ids) shows each case.
