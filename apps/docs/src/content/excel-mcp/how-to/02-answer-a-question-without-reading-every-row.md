# How to answer a question without reading every row

Paging a large sheet through `read_sheet` costs the agent one call and thousands of cells per page.
Most questions — a total, a ranking, a count, where a value is — are answered on the server in one
call instead.

The examples call the tools with the `excel` shell function from [Reading your first
workbook](/docs/excel-mcp/reading-your-first-workbook), on its `sales.xlsx`.

## Get one total for the whole sheet

Leave out `groupBy`:

```sh
excel aggregate_sheet --tool-arg filePath=sales.xlsx \
  'metrics=[{"fn":"sum","column":"Total"},{"fn":"count"}]' \
  | jq -c '[.columns[].label], .rows[]'
```

```json
["sum(Total)","count"]
[6625,12]
```

`count` without a `column` counts rows; with a `column` it counts that column's cells. The other
functions are `countValues`, `countDistinct`, `avg`, `min`, `max` and `stddev`.

## Group and filter

`where` keeps only the rows that match. Several conditions combine with `match: "all"` (the
default) or `"any"`:

```sh
excel aggregate_sheet --tool-arg filePath=sales.xlsx \
  'groupBy=["Product"]' \
  'metrics=[{"fn":"sum","column":"Units"},{"fn":"avg","column":"Total"}]' \
  'where=[{"column":"Region","op":"in","values":["North","South"]}]' \
  | jq -c '[.columns[].label], .rows[], {matchedRows, scannedRows}'
```

```json
["Product","sum(Units)","avg(Total)"]
["Chair",16,680]
["Desk",7,875]
["Lamp",12,180]
{"matchedRows":6,"scannedRows":12}
```

`matchedRows` says how many rows passed the filter, so the agent can tell an empty group from a
filter that matched nothing. The operators are `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `contains`,
`startsWith`, `endsWith`, `in`, `between`, `isEmpty`, `isNotEmpty` and `isError`.

A cell of a different kind from the value never matches: `{"op":"gt","value":100}` skips a cell
holding the text `"250"`. Pass `coerceText: true` to read numeric text as a number.

## Get the top groups

Sort by a metric and cap the groups:

```sh
excel aggregate_sheet --tool-arg filePath=sales.xlsx \
  'groupBy=["Rep"]' 'metrics=[{"fn":"sum","column":"Total"}]' \
  orderBy=metric descending=true maxGroups=2 \
  | jq -c '.rows[], {groupCount, returnedGroups, truncated}'
```

```json
["Omar",1865]
["Emre",1810]
{"groupCount":4,"returnedGroups":2,"truncated":true}
```

`groupCount` is every group the sheet formed; `returnedGroups` is how many came back. With several
metrics, `orderByMetric` picks which one sorts, counting from 1.

## Name a column by letter

Columns are named by header text, matched without regard to case or accents, or by A1 letter. When
two columns share a header, the name returns `ambiguous_column`; use the letter, or force one reading
with `columnMode: "letter"` or `"header"`.

## Find where a value is

```sh
excel find_in_sheet --tool-arg filePath=sales.xlsx query=Desk matchMode=exact \
  | jq -c '.matches[] | {address, value}'
```

```json
{"address":"E2","value":"Desk"}
{"address":"E6","value":"Desk"}
{"address":"E7","value":"Desk"}
{"address":"E12","value":"Desk"}
```

`matchMode` is `contains` (the default), `exact` or `regex`. Pass `searchIn: "formulas"` to search
formula text instead of values:

```sh
excel find_in_sheet --tool-arg filePath=sales.xlsx \
  'query=F\d+\*G' matchMode=regex searchIn=formulas maxResults=2 \
  | jq -c '(.matches[] | {address, value}), {total, truncated}'
```

```json
{"address":"H2","value":1000}
{"address":"H3","value":850}
{"total":12,"truncated":true}
```

`total` counts every match; `maxResults` only limits how many are returned. A regex runs in an
isolated worker with a two-second deadline, is at most 256 characters, and is matched as written:
case and accent folding do not apply to it.
