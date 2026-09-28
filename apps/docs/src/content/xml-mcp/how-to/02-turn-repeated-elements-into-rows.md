# How to turn repeated elements into rows

`project_records` reads a repeated element as a table: every occurrence is a row, and you declare
the columns. It is the way to read a list of orders, invoices or log entries without walking the
tree node by node.

The examples use the `xml` shell function from [Reading your first XML
document](/docs/xml-mcp/reading-your-first-xml-document), on its `orders.xml`.

## Find the record element

`describe_document` lists the elements that repeat, with an address for each:

```sh
xml describe_document --tool-arg filePath=orders.xml \
  | jq -c '.repetitionCandidates[] | select(.localName == "order") | .address'
```

```json
[{"namespaceUri":"urn:example:orders","localName":"orders","occurrence":1},{"namespaceUri":"urn:example:orders","localName":"order","occurrence":1}]
```

The record set is written as `itemAddress`: the path to the element that holds the records, then
the name of the repeated child. Every child of `orders` named `order` is one record:

```sh
ORDERS='{"ancestors":[{"namespaceUri":"urn:example:orders","localName":"orders"}],"name":{"namespaceUri":"urn:example:orders","localName":"order"}}'
```

Names are always a namespace URI plus a local name. An element in no namespace has
`"namespaceUri": ""`, and so does an unprefixed attribute, even inside a document with a default
namespace.

## Declare the columns

Each column has a `label` and says where its value comes from, relative to the record:

- **the text of a child element**: `"name"` is the child's expanded name;
- **an attribute**: `"value": {"from": "attribute", ...}`, on the record itself or, with `name`, on a
  child;
- **deeper**: `"ancestors"` is a path of steps from the record down to the element whose child you
  want;
- **the element's own name**: `"value": {"from": "name"}`.

```sh
xml project_records --tool-arg filePath=orders.xml "itemAddress=$ORDERS" \
  'columns=[{"label":"id","value":{"from":"attribute","namespaceUri":"","localName":"id"}},{"label":"customer","name":{"namespaceUri":"urn:example:orders","localName":"customer"}},{"label":"sku","name":{"namespaceUri":"urn:example:orders","localName":"line"},"value":{"from":"attribute","namespaceUri":"","localName":"sku"}}]' \
  | jq -c '.rows[] | [.cells[] | .value // .status]'
```

```json
["1001","Ada","DESK"]
["1002","Emre","CHAIR"]
["1003","Lena","multiple"]
["1004","Ada","CHAIR"]
["1005","Omar","DESK"]
["1006","Emre","LAMP"]
```

## Read the cell status

A cell is never quietly filled in. Its `status` is one of:

| `status`   | Meaning                                                            |
| ---------- | ------------------------------------------------------------------ |
| `present`  | One value was found; it is in `value`, exactly as written          |
| `empty`    | The node exists and its value is the empty string                  |
| `missing`  | Nothing in the record matches the column's address                 |
| `multiple` | Several nodes match and no policy chose one; `count` says how many |
| `list`     | Several nodes match and `onMultiple: "list"` asked for all of them |

Text is joined from the element's own text and CDATA children, without descending; an element that
also has element children is marked `mixed` as well. The answer counts each status per column in
`columns`, so an agent can see at a glance that a column has gaps:

```sh
xml project_records --tool-arg filePath=orders.xml "itemAddress=$ORDERS" \
  'columns=[{"label":"region","name":{"namespaceUri":"urn:example:orders","localName":"region"}},{"label":"sku","name":{"namespaceUri":"urn:example:orders","localName":"line"},"value":{"from":"attribute","namespaceUri":"","localName":"sku"}}]' \
  | jq -c '.columns[]'
```

```json
{"label":"region","missingCount":1,"emptyCount":0,"multipleCount":0,"mixedCount":0}
{"label":"sku","missingCount":0,"emptyCount":0,"multipleCount":1,"mixedCount":0}
```

## Decide what several matches mean

Order 1003 has two `line` elements, so its `sku` cell above is `multiple`. `onMultiple` changes
that per column: `"list"` returns every value, and `"first"` takes the first one.

```sh
xml project_records --tool-arg filePath=orders.xml "itemAddress=$ORDERS" \
  'columns=[{"label":"id","value":{"from":"attribute","namespaceUri":"","localName":"id"}},{"label":"sku","name":{"namespaceUri":"urn:example:orders","localName":"line"},"value":{"from":"attribute","namespaceUri":"","localName":"sku"},"onMultiple":"list"}]' \
  'where=[{"column":"id","op":"eq","value":"1003"}]' \
  | jq -c '.rows[].cells'
```

```json
[{"status":"present","value":"1003"},{"status":"list","values":["LAMP","DESK"],"count":2}]
```

## Filter the rows

`where` keeps the rows whose cells match. Comparisons are on the text as written and are
case-sensitive unless you pass `caseSensitive: false`:

```sh
xml project_records --tool-arg filePath=orders.xml "itemAddress=$ORDERS" \
  'columns=[{"label":"id","value":{"from":"attribute","namespaceUri":"","localName":"id"}},{"label":"region","name":{"namespaceUri":"urn:example:orders","localName":"region"}}]' \
  'where=[{"column":"region","op":"isMissing"}]' \
  | jq -c '(.rows[] | [.cells[] | .value // .status]), {matchedItems, scannedItems}'
```

```json
["1006","missing"]
{"matchedItems":1,"scannedItems":6}
```

The operators are `eq`, `ne`, `contains`, `startsWith`, `endsWith` and `in` on the value, and
`isMissing`, `isPresent`, `isEmpty` and `isNotEmpty` on the status. No value is ever converted to a
number, so `"010"` does not equal `"10"`.

## Page through a long record set

`maxRows` caps a page, 50 by default and 200 at most. A longer set returns `nextCursor`; pass it
back as `cursor` with the same `filePath`. A cursor expires after ten minutes and is refused with
`stale_cursor` if the document changed in between.

A row carries its `occurrence` rather than an address. Its full address is `itemParentAddress` from
the answer plus `itemName` at that occurrence, which is what `read_node` takes to show the record's
whole subtree.
