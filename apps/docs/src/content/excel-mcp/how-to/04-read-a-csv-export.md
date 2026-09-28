# How to read a CSV export

A `.csv` file is read with the same tools as a workbook. The server detects the delimiter and the
encoding, reports what it detected on every answer, and leaves every value as the exact text in the
file.

The examples use the `excel` shell function from [Reading your first
workbook](/docs/excel-mcp/reading-your-first-workbook).

## Read the file

Create a semicolon-separated file:

```sh
printf 'Order;Region;Units\n1001;North;4\n1002;South;10\n1003;East;012\n' \
  > ~/liaiso-sheets/orders.csv
```

A CSV has one sheet. Read it like any other:

```sh
excel read_sheet --tool-arg filePath=orders.csv | jq -c '.values[], .csv'
```

```json
["1001","North","4"]
["1002","South","10"]
["1003","East","012"]
{"delimiter":"semicolon","delimiterSource":"sniffed","encoding":"utf-8","encodingSource":"default","hadBom":false,"lineBreak":"lf","recordCount":4,"columnCount":3,"raggedRecordCount":0,"blankRecordCount":0,"formulaLikeCellCount":0}
```

`"012"` stayed `"012"` and `"4"` is a string: nothing is converted to a number, a date or a boolean,
so an ID or a postcode keeps its leading zero. `csv` reports the delimiter, the encoding and how each
was decided.

## Add up a column of numeric text

Because every CSV value is text, `aggregate_sheet` skips it for a numeric metric:

```sh
excel aggregate_sheet --tool-arg filePath=orders.csv \
  'metrics=[{"fn":"sum","column":"Units"}]' | jq -c '.rows[], .columns[0]'
```

```json
[null]
{"label":"sum(Units)","letter":"C","role":"metric","fn":"sum","counted":0,"skipped":3}
```

The sum is `null` and all three cells were `skipped`. Pass `coerceText: true` to read numeric text
as a number:

```sh
excel aggregate_sheet --tool-arg filePath=orders.csv coerceText=true \
  'metrics=[{"fn":"sum","column":"Units"}]' | jq -c '.rows[], .columns[0]'
```

```json
[26]
{"label":"sum(Units)","letter":"C","role":"metric","fn":"sum","counted":3,"skipped":0}
```

## Pass the delimiter

The delimiter is detected from the first 20 lines. When two delimiters fit equally well, the call
fails with `ambiguous_delimiter`; pass `delimiter` as `comma`, `semicolon`, `tab` or `pipe`. The
answer then reports `"delimiterSource": "explicit"`.

## Pass the encoding

A byte-order mark decides the encoding. Without one the server assumes UTF-8 and refuses a file that
is not valid UTF-8 rather than show broken characters. A file saved by Turkish Excel shows the
problem:

```sh
printf 'Şehir;Adet\nİstanbul;3\nİzmir;5\n' | iconv -f UTF-8 -t WINDOWS-1254 \
  > ~/liaiso-sheets/cities.csv
excel read_sheet --tool-arg filePath=cities.csv
```

```text
{"error":{"code":"tool_is_error","message":"Tool 'read_sheet' returned isError:true."}}
{
  "error": "undecodable_text",
  "message": "'cities.csv' is not valid utf-8 text.",
  "recovery": "Pass encoding explicitly: 'windows-1254' (Turkish Excel), 'iso-8859-9', 'windows-1252', 'utf-16le' or 'utf-16be'."
}
```

The first line comes from the Inspector; the object under it is the server's answer. Pass the
encoding it suggests:

```sh
excel read_sheet --tool-arg filePath=cities.csv encoding=windows-1254 \
  | jq -c '[.columns[].header], .values[]'
```

```json
["Şehir","Adet"]
["İstanbul","3"]
["İzmir","5"]
```

The encodings are `utf-8`, `utf-16le`, `utf-16be`, `windows-1254`, `iso-8859-9` and `windows-1252`.

## Know what a CSV cannot answer

A CSV has no formulas, merged cells, tables, validation rules, formatting or pictures. Asking for one
fails instead of returning an empty list:

```sh
excel get_tables --tool-arg filePath=orders.csv
```

```text
{"error":{"code":"tool_is_error","message":"Tool 'get_tables' returned isError:true."}}
{
  "error": "unsupported_for_format",
  "message": "get_tables is not available for csv files; the format cannot carry that information.",
  "recovery": "Call describe_workbook and read the capabilities block."
}
```

`describe_workbook` lists what a file supports in its `capabilities` block, so an agent can check
before it asks. `headerScan`, `valueMode`, `mergedCells: "repeat"` and `includeHyperlinks: true` are
refused on a CSV the same way.
