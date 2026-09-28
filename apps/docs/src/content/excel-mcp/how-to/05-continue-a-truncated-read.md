# How to continue a truncated read

`read_sheet` returns at most `maxCells` cells per answer: 2,000 unless you pass another value, and
never more than 10,000. When a range holds more, the answer is cut at a whole row and carries a
cursor for the rest.

The examples use the `excel` shell function from [Reading your first
workbook](/docs/excel-mcp/reading-your-first-workbook), on its `sales.xlsx`.

## Recognize a truncated answer

```sh
excel read_sheet --tool-arg filePath=sales.xlsx maxCells=40 \
  | jq '{range, returnedRows, truncated, truncationReason, hint}'
```

```json
{
  "range": "A2:H6",
  "returnedRows": 5,
  "truncated": true,
  "truncationReason": "maxCells",
  "hint": "7 rows remain. Prefer aggregate_sheet for totals, find_in_sheet to locate a value, or a narrower range over paging."
}
```

`truncationReason` is `maxCells` when the cell budget ran out and `maxPayloadBytes` when the answer
reached 512 KB first, which happens with long text cells. `hint` counts the rows left.

## Pass the cursor back

Send `nextCursor` back as `cursor`, with the same `filePath`:

```sh
excel read_sheet --tool-arg filePath=sales.xlsx maxCells=40 > page1.json
excel read_sheet --tool-arg filePath=sales.xlsx \
  "cursor=$(jq -r .nextCursor page1.json)" \
  | jq '{range, headerRowSource, returnedRows, truncated}'
```

```json
{
  "range": "A7:H13",
  "headerRowSource": "cursor",
  "returnedRows": 7,
  "truncated": false
}
```

The second page starts at the next row. It keeps the first page's header row, `valueMode`,
`mergedCells` and CSV options: leave them out and they are inherited, repeat them and they must
match, or the call fails with `invalid_argument`. Only `maxCells` may differ between pages. A
`sheetName` or `range` next to a cursor is refused, because the cursor already names both.

## When the cursor stops working

A cursor is bound to the file's contents. If the workbook is saved between two pages, the next page
fails with `stale_cursor` rather than mix rows from two versions of the file; read again from the
start. A token that was edited or cut short fails with `invalid_cursor`.

## Page less

Every page an agent reads is context it cannot use for anything else. Before paging, check whether
one call answers the question: [How to answer a question without reading every
row](/docs/excel-mcp/answer-a-question-without-reading-every-row). A narrower `range` is the other
way out; `describe_workbook` gives each sheet's used range to choose from.
