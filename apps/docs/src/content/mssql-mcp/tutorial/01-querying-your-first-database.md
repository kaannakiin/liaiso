# Querying your first database

By the end of this page you will have found the tables that hold customer orders without knowing
their names, read how they connect, and asked the database which customers spent the most.

You will call the tools yourself, the way an agent does, so you can see exactly what the agent
receives. You need Node.js 22 or later, `jq`, and a SQL Server database you may create a schema in.

## 1. Install the server

```sh
npm install -g @liaiso/mssql-mcp
```

This puts the `liaiso-mssql` command on your path.

## 2. Load the sample schema

Download [liaiso-shop.sql](/samples/mssql-mcp/liaiso-shop.sql). It creates a schema named
`liaiso_shop` with five small tables, a view, and descriptions on some of them: customers, products,
orders and their lines, plus a ledger used to show exact values. Run it in your database, for
example with `sqlcmd`:

```text
sqlcmd -S db.example.com -d YourDatabase -U your_user -i liaiso-shop.sql
```

The script drops and recreates only `liaiso_shop`. Run it again at any time to start over.

## 3. Tell the server where the database is

The server reads its connection from environment variables. An MCP client passes them from its
configuration file, so write one. Save this as `~/liaiso-mssql.json`, with your own values:

```json
{
  "mcpServers": {
    "shop": {
      "command": "liaiso-mssql",
      "env": {
        "LIAISO_MSSQL_SERVER": "db.example.com",
        "LIAISO_MSSQL_DATABASE": "YourDatabase",
        "LIAISO_MSSQL_USER": "your_user",
        "LIAISO_MSSQL_PASSWORD": "your_password"
      }
    }
  }
}
```

The file holds a password, so make it readable by you alone:

```sh
chmod 600 ~/liaiso-mssql.json
```

The connection is encrypted by default. If your server has no certificate a client can verify, as a
development instance often does, add `"LIAISO_MSSQL_TRUST_SERVER_CERTIFICATE": "true"`, or
`"LIAISO_MSSQL_ENCRYPT": "false"` for a server that does not offer encryption at all.

## 4. Make calling a tool short

The MCP Inspector can start the server from that file and call one tool from the command line.
Define a shell function so each call below is one line:

```sh
sql() {
  npx -y @modelcontextprotocol/inspector --cli --config ~/liaiso-mssql.json --server shop \
    --method tools/call --tool-name "$@" | jq '.content[0].text | fromjson'
}
```

Every tool answers with one text item that holds JSON; the `jq` at the end unpacks it.

## 5. See what the connection may do

```sh
sql describe_connection | jq '{engine, readOnly, limits}'
```

```json
{
  "engine": "SQL Server",
  "readOnly": {
    "principal": "The database principal decides what is readable; this server issues no writes.",
    "sessionIntent": "none",
    "statementGuard": "advisory",
    "note": "Connect with a principal that holds db_datareader and nothing else; the statement guard is not a security boundary."
  },
  "limits": {
    "maxRows": 1000,
    "defaultRows": 100,
    "maxColumns": 512,
    "maxPayloadBytes": 524288,
    "queryTimeoutMs": 30000
  }
}
```

The answer also names the database and the login, which are left out here. `sessionIntent: "none"`
and `statementGuard: "advisory"` are the server being honest: SQL Server has no read-only session,
and the statement check is advisory. What keeps the data safe is the login.

## 6. Find the tables by what they hold

You do not know the table names yet. Describe what you are looking for instead:

```sh
sql search_catalog --tool-arg query="customer orders" schema=liaiso_shop \
  | jq -c '.results[] | {name, kind, matched: [.matched[] | "\(.field): \(.value)"]}'
```

```json
{"name":"customers","kind":"table","matched":["name: customers","description: People and companies that place orders.","column: customer_id","columnDescription: city"]}
{"name":"orders","kind":"table","matched":["name: orders","column: customer_id"]}
{"name":"order_totals","kind":"view","matched":["column: customer_id"]}
```

Each result says why it matched. `customers` matched on its name, on its description, which
mentions orders, on its `customer_id` column, and on the description of its `city` column, which
mentions the customer. `orders` matched on its name and its `customer_id` column. The
view `order_totals` matched only through a column, so it ranks last. `schema=liaiso_shop` keeps the
search to the sample; without it the whole database is searched.

## 7. Read how the tables connect

```sh
sql describe_table --tool-arg schema=liaiso_shop table=orders \
  | jq '{columns: [.columns[] | "\(.name) \(.nativeType)\(if .nullable then " null" else "" end)"], primaryKey, foreignKeys}'
```

```json
{
  "columns": [
    "order_id int",
    "customer_id int",
    "ordered_on date",
    "status varchar",
    "shipped_at datetime2 null"
  ],
  "primaryKey": [
    "order_id"
  ],
  "foreignKeys": [
    {
      "name": "fk_orders_customer",
      "columns": [
        "customer_id"
      ],
      "referencedSchema": "liaiso_shop",
      "referencedTable": "customers",
      "referencedColumns": [
        "customer_id"
      ]
    }
  ]
}
```

`orders.customer_id` refers to `customers.customer_id`, and `shipped_at` may be empty. That is
enough to write a join.

## 8. Ask the question

Which customers spent the most? Join the orders to their customers and to the `order_totals` view:

```sh
sql run_query --tool-arg sql="SELECT c.name, COUNT(*) AS orders, SUM(t.total) AS spent FROM liaiso_shop.order_totals AS t JOIN liaiso_shop.customers AS c ON c.customer_id = t.customer_id WHERE t.status <> 'cancelled' GROUP BY c.name ORDER BY spent DESC" \
  | jq -c '.rows[]'
```

```json
["Ada Yılmaz",2,735]
["Emre Kaya",2,620]
["Lena Müller",1,273]
["Zoë Martin",1,215.5]
```

Each row is an array in the order of `columns`, which the same answer lists with a type for each:

```sh
sql run_query --tool-arg sql="SELECT c.name, SUM(t.total) AS spent FROM liaiso_shop.order_totals AS t JOIN liaiso_shop.customers AS c ON c.customer_id = t.customer_id GROUP BY c.name" \
  | jq -c '.columns[]'
```

```json
{"name":"name","kind":"text","nativeType":"NVarChar","nullable":false}
{"name":"spent","kind":"decimal","nativeType":"Decimal","nullable":true,"precision":38,"scale":2,"lossy":"precision"}
```

`spent` is flagged `lossy: "precision"`. SQL Server types a sum of `decimal(10,2)` values as
`decimal(38,2)`, as `precision` and `scale` show, which has more digits than a JSON number holds, so
the server warns that such a value may not be exact, even though these ones are. [How to read exact
numbers, dates and IDs](/docs/mssql-mcp/read-exact-numbers-dates-and-ids) shows how to get the exact
text.

## 9. Try to change something

```sh
sql run_query --tool-arg sql="DELETE FROM liaiso_shop.orders WHERE order_id = 1005"
```

```text
{"error":{"code":"tool_is_error","message":"Tool 'run_query' returned isError:true."}}
{
  "error": "write_not_permitted",
  "message": "A read-only statement has to begin with SELECT or WITH; this one begins with delete.",
  "recovery": "Rewrite the request as a SELECT."
}
```

The first line comes from the Inspector; the object under it is the server's answer. The statement
never reached the database. A login limited to `db_datareader` would refuse it there too, which is
the refusal that counts.

## What you did

You connected the server to one database, found tables by describing them, read their keys, and ran
a join. These are the calls an agent makes. To give them to one, see [How to connect the server to
your MCP client](/docs/mssql-mcp/connect-the-server-to-your-mcp-client).
