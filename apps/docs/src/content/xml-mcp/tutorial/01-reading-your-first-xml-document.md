# Reading your first XML document

By the end of this page you will have turned an XML export into rows and asked it how much was paid
per order status, and the server will have answered with one line per status.

You will call the tools yourself, the way an agent does, so you can see exactly what the agent
receives. You need Node.js 22 or later and `jq`.

## 1. Install the server

```sh
npm install -g @sezzlee/xml-mcp
```

This puts the `sezzlee-xml` command on your path.

## 2. Give it a folder

The server reads one folder and nothing outside it:

```sh
mkdir -p ~/sezzlee-xml
```

Download [orders.xml](/samples/xml-mcp/orders.xml) and save it into `~/sezzlee-xml`. It holds six
orders in the namespace `urn:example:orders`, each with a date, a region, a customer, one or more
order lines, and a payment in a second namespace, `urn:example:payments`. One order has no region
and one has no payment, as real exports do.

## 3. Make calling a tool short

The MCP Inspector can start the server and call one tool from the command line. Define a shell
function so each call below is one line:

```sh
xml() {
  npx -y @modelcontextprotocol/inspector --cli sezzlee-xml ~/sezzlee-xml \
    --method tools/call --tool-name "$@" | jq '.content[0].text | fromjson'
}
```

Every tool answers with one text item that holds JSON; the `jq` at the end unpacks it.

## 4. See what the server can read

```sh
xml list_documents | jq -c '.files[] | {filePath, sizeBytes, mode}'
```

```json
{"filePath":"orders.xml","sizeBytes":1500,"mode":"resident"}
```

`mode` is `resident`: the document is small enough to be parsed whole, so every tool is available.

## 5. Look at the document before reading it

```sh
xml describe_document --tool-arg filePath=orders.xml \
  | jq -c '.namespaces[] | {uri, alias}'
```

```json
{"uri":"urn:example:orders","alias":"ns1"}
{"uri":"urn:example:payments","alias":"pay"}
```

The document uses two namespaces. The payments namespace is written with the prefix `pay`, so that
is its alias. The orders namespace is the default namespace and has no prefix at all, so the server
gives it the alias `ns1`. Every name in this document is qualified by one of these two URIs, and the
tools address elements by URI and local name, never by a prefix.

The same answer lists the elements that repeat, which are the candidates for rows:

```sh
xml describe_document --tool-arg filePath=orders.xml \
  | jq -c '.repetitionCandidates[] | {localName, count}'
```

```json
{"localName":"line","count":7}
{"localName":"order","count":6}
{"localName":"date","count":6}
{"localName":"customer","count":6}
{"localName":"region","count":5}
{"localName":"payment","count":5}
```

Six `order` elements, and only five `region` and five `payment` elements among them.

## 6. Turn the orders into rows

Name the repeated element once, in a shell variable: its parent is `orders`, and every `order` child
is one record.

```sh
ORDERS='{"ancestors":[{"namespaceUri":"urn:example:orders","localName":"orders"}],"name":{"namespaceUri":"urn:example:orders","localName":"order"}}'
```

Then say which values make the columns. The `id` comes from an attribute; `region` and `paid` are
the text of child elements, the second one in the payments namespace:

```sh
xml project_records --tool-arg filePath=orders.xml "itemAddress=$ORDERS" \
  'columns=[{"label":"id","value":{"from":"attribute","namespaceUri":"","localName":"id"}},{"label":"region","name":{"namespaceUri":"urn:example:orders","localName":"region"}},{"label":"paid","name":{"namespaceUri":"urn:example:payments","localName":"payment"}}]' \
  | jq -c '.rows[] | [.cells[] | .value // .status]'
```

```json
["1001","North","1000.00"]
["1002","South","850.00"]
["1003","East","610.00"]
["1004","North","510.00"]
["1005","West","missing"]
["1006","missing","210.00"]
```

Every cell says what happened. Order 1005 has no payment and order 1006 has no region, so those
cells are `missing` rather than an empty string or a made-up value. The amounts are the exact text
in the file, `"1000.00"`, not the number `1000`.

## 7. Ask the question

How much was paid per order status? Group by the `status` attribute and add up the payments.
Adding up means turning text into numbers, which the server does only when you say so with
`numericMode`:

```sh
xml aggregate_document --tool-arg filePath=orders.xml "itemAddress=$ORDERS" \
  'columns=[{"label":"status","value":{"from":"attribute","namespaceUri":"","localName":"status"}},{"label":"paid","name":{"namespaceUri":"urn:example:payments","localName":"payment"}}]' \
  'groupBy=["status"]' 'metrics=[{"fn":"count"},{"fn":"sum","column":"paid"}]' \
  numericMode=binary64 \
  | jq -c '.groups[] | {status: .key[0].value, orders: .metrics[0].value, paid: .metrics[1].value, counted: .metrics[1].counted}'
```

```json
{"status":"cancelled","orders":1,"paid":0,"counted":0}
{"status":"pending","orders":1,"paid":610,"counted":1}
{"status":"shipped","orders":4,"paid":2570,"counted":4}
```

Shipped orders account for 2,570. The cancelled order's total is `0` with `counted: 0`: it had no
payment to add, which is different from a payment of zero.

## What you did

You started the server on one folder, looked at a document's namespaces and repeated elements,
turned records into rows with every gap reported, and had the server total them. These are the
calls an agent makes. To give them to one, see [How to connect the server to your MCP
client](/docs/xml-mcp/connect-the-server-to-your-mcp-client).
