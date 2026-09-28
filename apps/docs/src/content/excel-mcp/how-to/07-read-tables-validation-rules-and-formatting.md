# How to read tables, validation rules and formatting

Beyond cell values, a workbook carries structure that tells an agent what the data means: which
range is a table, which values a column accepts, which cells are highlighted and why. Each has its
own tool, and each takes `filePath` and an optional `sheetName`.

The examples use the `excel` shell function from [Reading your first
workbook](/docs/excel-mcp/reading-your-first-workbook). `sales.xlsx` defines one Excel Table, a
dropdown on its `Region` column and bold text on large totals; `report.xlsx` has a merged title.

## Start with the counts

`describe_workbook` counts each kind per sheet, so an agent can skip the calls that would return
nothing:

```sh
excel describe_workbook --tool-arg filePath=sales.xlsx \
  | jq -c '.sheets[] | {name, tableCount, dataValidationRuleCount, conditionalFormatRuleCount, mergeCount, imageCount}'
```

```json
{"name":"Orders","tableCount":1,"dataValidationRuleCount":1,"conditionalFormatRuleCount":1,"mergeCount":0,"imageCount":0}
{"name":"Targets","tableCount":0,"dataValidationRuleCount":0,"conditionalFormatRuleCount":0,"mergeCount":0,"imageCount":0}
```

## Excel Tables

```sh
excel get_tables --tool-arg filePath=sales.xlsx \
  | jq -c '.tables[] | {name, ref, headerRow, totalsRow}, [.columns[] | "\(.letter)=\(.name)"]'
```

```json
{"name":"Orders","ref":"A1:H13","headerRow":true,"totalsRow":false}
["A=Order","B=Date","C=Region","D=Rep","E=Product","F=Units","G=Unit price","H=Total"]
```

A table's `ref` is the exact range of its data, and its column names are the headers the author
declared, with the A1 letter of each. This is the most reliable way to know where a dataset starts
and ends.

## Data validation

```sh
excel get_data_validations --tool-arg filePath=sales.xlsx | jq -c '.rules[]'
```

```json
{"ranges":["C2:C13"],"rangesTruncated":false,"type":"list","formulae":["\"North,South,East,West\""]}
```

A `list` rule's formula is the set of values the column accepts. Ranges are reported as the
workbook stores them, regrouped into rectangles.

## Conditional formatting

```sh
excel get_conditional_formats --tool-arg filePath=sales.xlsx | jq -c '.rules[]'
```

```json
{"ranges":["H2:H13"],"rangesTruncated":false,"type":"cellIs","priority":1,"operator":"greaterThan","formulae":["800"]}
```

A rule is reported as its condition — here, a total greater than 800 — not as the colors or fonts it
applies. Fill colors, icon sets and data bar geometry are not reported.

## Merged cells

```sh
excel get_merged_ranges --tool-arg filePath=report.xlsx | jq -c '.merges'
```

```json
["A1:H1"]
```

`read_sheet` also lists the merges that overlap the range it read, and `mergedCells: "repeat"`
copies a merged value into every cell it covers.

## Pictures

`get_images` lists each embedded picture's anchor range, size in bytes and file extension; it does
not return the image itself. An absolute-anchored picture has no cell range, and its `range` field is
left out rather than made up.

Charts, pivot tables and sparklines cannot be read in any format. Asking `get_images` for one fails
instead of returning an empty list:

```sh
excel get_images --tool-arg filePath=sales.xlsx kind=chart
```

```text
{"error":{"code":"tool_is_error","message":"Tool 'get_images' returned isError:true."}}
{
  "error": "unsupported_object_kind",
  "message": "get_images cannot read chart objects; the reader never unzips xl/charts or xl/pivotCache, so an empty list would be a lie rather than an answer.",
  "recovery": "Call describe_workbook and read the capabilities block; charts, pivotTables and sparklines are false for every format."
}
```
