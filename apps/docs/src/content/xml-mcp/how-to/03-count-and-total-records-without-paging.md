# How to count and total records without paging

`aggregate_document` answers "how many", "how many distinct" and "how much" over a repeated
element in one call, with groups, instead of paging every record into the agent's context.

The examples use the `xml` shell function from [Reading your first XML
document](/docs/xml-mcp/reading-your-first-xml-document), on its `orders.xml`. The record set and
the columns are declared exactly as for `project_records`; see [How to turn repeated elements into
rows](/docs/xml-mcp/turn-repeated-elements-into-rows).

```sh
ORDERS='{"ancestors":[{"namespaceUri":"urn:example:orders","localName":"orders"}],"name":{"namespaceUri":"urn:example:orders","localName":"order"}}'
```

## Count

The counting metrics work on text and need no conversion. `count` counts records and takes no
column; `countValues` counts the records where the column matched, an empty value included;
`countDistinct` counts the column's distinct values:

```sh
xml aggregate_document --tool-arg filePath=orders.xml "itemAddress=$ORDERS" \
  'columns=[{"label":"region","name":{"namespaceUri":"urn:example:orders","localName":"region"}},{"label":"customer","name":{"namespaceUri":"urn:example:orders","localName":"customer"}}]' \
  'metrics=[{"fn":"count"},{"fn":"countValues","column":"region"},{"fn":"countDistinct","column":"customer"}]' \
  | jq -c '.groups[].metrics'
```

```json
[{"kind":"count","value":6},{"kind":"count","value":5},{"kind":"count","value":4}]
```

Six orders, five with a region, four distinct customers. Leaving out `groupBy` gives one group for
the whole record set.

## Group

`groupBy` names one or more columns by label. The key of each group is the cell, status included,
so records with a missing value form their own group instead of disappearing:

```sh
xml aggregate_document --tool-arg filePath=orders.xml "itemAddress=$ORDERS" \
  'columns=[{"label":"region","name":{"namespaceUri":"urn:example:orders","localName":"region"}}]' \
  'groupBy=["region"]' 'metrics=[{"fn":"count"}]' \
  | jq -c '.groups[] | [.key[0].value // .key[0].status, .metrics[0].value]'
```

```json
["East",1]
["North",2]
["South",1]
["West",1]
["missing",1]
```

`orderBy: "metric"` with `orderByMetric` and `descending` ranks the groups, and `maxGroups` caps
them, 50 by default and 200 at most. `groupCount` and `matchedItems` always cover the whole scan,
even when `maxGroups` cuts the returned groups.

## Total

`sum`, `avg`, `min` and `max` turn text into numbers, and the server does that only when the call
says so with `numericMode: "binary64"`. Without it the call is refused:

```sh
xml aggregate_document --tool-arg filePath=orders.xml "itemAddress=$ORDERS" \
  'columns=[{"label":"paid","name":{"namespaceUri":"urn:example:payments","localName":"payment"}}]' \
  'metrics=[{"fn":"sum","column":"paid"}]'
```

```text
{"error":{"code":"tool_is_error","message":"Tool 'aggregate_document' returned isError:true."}}
{
  "error": "invalid_argument",
  "message": "The sum metric converts text to a binary64 number, which this call did not ask for.",
  "recovery": "Pass numericMode: binary64 to accept double precision, or use count, countValues or countDistinct."
}
```

The first line comes from the Inspector; the object under it is the server's answer. With the mode
set:

```sh
xml aggregate_document --tool-arg filePath=orders.xml "itemAddress=$ORDERS" \
  'columns=[{"label":"paid","name":{"namespaceUri":"urn:example:payments","localName":"payment"}}]' \
  'metrics=[{"fn":"sum","column":"paid"},{"fn":"avg","column":"paid"},{"fn":"max","column":"paid"}]' \
  numericMode=binary64 \
  | jq -c '.groups[].metrics[] | {value, counted, skipped, rounded}'
```

```json
{"value":3180,"counted":5,"skipped":1,"rounded":0}
{"value":636,"counted":5,"skipped":1,"rounded":0}
{"value":1000,"counted":5,"skipped":1,"rounded":0}
```

Every numeric metric reports what it used: `counted` values, `skipped` cells that were missing or
not a number, and `rounded` values that a binary64 double cannot hold exactly. A `sum` over no values
is `0` with `counted: 0`; an `avg` over no values has no value at all.

`rounded` is how an agent learns that decimal fractions went through binary arithmetic:

```sh
printf '<ledger><entry amount="0.1"/><entry amount="0.2"/><entry amount="3"/></ledger>\n' \
  > ~/sezzlee-xml/small.xml
xml aggregate_document --tool-arg filePath=small.xml \
  'itemAddress={"ancestors":[{"namespaceUri":"","localName":"ledger"}],"name":{"namespaceUri":"","localName":"entry"}}' \
  'columns=[{"label":"amount","value":{"from":"attribute","namespaceUri":"","localName":"amount"}}]' \
  'metrics=[{"fn":"sum","column":"amount"}]' numericMode=binary64 \
  | jq -c '.groups[].metrics[] | {valueText, counted, rounded}'
```

```json
{"valueText":"3.3","counted":3,"rounded":2}
```

`0.1` and `0.2` have no exact binary64 form, so two of the three values are counted as rounded.

## When a number would change

A value with more digits than a double holds is refused, not rounded, because the total would be
wrong without saying so:

```sh
printf '<ledger><entry amount="12345678901234567890.5"/><entry amount="0.1"/></ledger>\n' \
  > ~/sezzlee-xml/ledger.xml
xml aggregate_document --tool-arg filePath=ledger.xml \
  'itemAddress={"ancestors":[{"namespaceUri":"","localName":"ledger"}],"name":{"namespaceUri":"","localName":"entry"}}' \
  'columns=[{"label":"amount","value":{"from":"attribute","namespaceUri":"","localName":"amount"}}]' \
  'metrics=[{"fn":"sum","column":"amount"}]' numericMode=binary64
```

```text
{"error":{"code":"tool_is_error","message":"Tool 'aggregate_document' returned isError:true."}}
{
  "error": "numeric_precision",
  "message": "The value 12345678901234567890.5 carries more digits than a binary64 number holds, so a numeric metric would change it.",
  "recovery": "Use count, countValues or countDistinct, or project the rows and total them outside this server."
}
```

For money or identifiers where every digit counts, use the counting metrics, or read the values with
`project_records` and total them with exact arithmetic outside the server.
