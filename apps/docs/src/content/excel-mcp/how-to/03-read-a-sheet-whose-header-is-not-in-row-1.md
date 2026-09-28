# How to read a sheet whose header is not in row 1

Reports exported from other systems often start with a title, a blank row, and only then the column
headers. The server assumes the header is row 1 unless told otherwise, and it never quietly picks
another row. This page shows the three ways to tell it.

The examples use the `excel` shell function from [Reading your first
workbook](/docs/excel-mcp/reading-your-first-workbook). Download
[report.xlsx](/samples/excel-mcp/report.xlsx) into the same folder: its row 1 is a merged title,
row 2 is blank and row 3 holds the headers.

## See the problem

```sh
excel read_sheet --tool-arg filePath=report.xlsx maxCells=16 \
  | jq '{headerRow, headerRowSource, headers: [.columns[].header], warnings}'
```

```json
{
  "headerRow": 1,
  "headerRowSource": "default",
  "headers": [
    "January sales report",
    null,
    null,
    null,
    null,
    null,
    null,
    null
  ],
  "warnings": [
    "headerRow 1 produced no usable header text across columns A..H. Row 3 is the only row in rows 1-15 that qualifies as a header row by text; pass headerRow 3, or headerScan true."
  ]
}
```

The title became the only header, and the answer says so in `warnings`, naming the row that looks
like the real header. The warning appears only when you did not pass `range`.

## Name the row

When you know the row, pass it:

```sh
excel read_sheet --tool-arg filePath=report.xlsx headerRow=3 maxCells=16 \
  | jq -c '.headerRowSource, [.columns[].header], .values[]'
```

```json
"explicit"
["Order","Date","Region","Rep","Product","Units","Unit price","Total"]
[1001,"2026-01-05","North","Ada","Desk",4,250,1000]
[1002,"2026-01-06","South","Emre","Chair",10,85,850]
```

`headerRow` works the same way on `aggregate_sheet`:

```sh
excel aggregate_sheet --tool-arg filePath=report.xlsx headerRow=3 \
  'groupBy=["Region"]' 'metrics=[{"fn":"sum","column":"Total"}]' \
  | jq -c '.rows[]'
```

```json
["East",1290]
["North",1660]
["South",1810]
["West",1865]
```

`headerRow: 0` reads with no headers at all; columns are then named only by letter.

## Let the server prove the row

When you do not know the row, pass `headerScan: true`:

```sh
excel read_sheet --tool-arg filePath=report.xlsx headerScan=true maxCells=16 \
  | jq -c '.headerRow, .headerRowSource, [.columns[].header]'
```

```json
3
"scanned"
["Order","Date","Region","Rep","Product","Units","Unit price","Total"]
```

The scan first looks for an Excel Table or an autofilter that declares the header; `sales.xlsx`
has one:

```sh
excel read_sheet --tool-arg filePath=sales.xlsx headerScan=true range=A1:H2 \
  | jq -c '.headerRow, .headerRowSource'
```

```json
1
"declared"
```

Without a declaration it examines the first 20 rows of the range for exactly one row of text
headers. If it finds none it fails with `unknown_header_row`, and if it finds more than one it fails
with `ambiguous_header_row`, quoting the candidates in `recovery`. It does not guess.

`headerScan` cannot be combined with `headerRow`, and it is not available on CSV files, where every
cell is text and no row can be ruled out.

## Read `headerRowSource`

Every answer from `read_sheet` and `aggregate_sheet` says who chose the header row:

| `headerRowSource` | Meaning                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `"default"`       | Nobody chose it; row 1 was assumed                               |
| `"explicit"`      | You passed `headerRow`                                           |
| `"declared"`      | `headerScan` found an Excel Table or autofilter that declares it |
| `"scanned"`       | `headerScan` proved it from the cells                            |
| `"cursor"`        | It came from the `cursor` of an earlier page                     |

An agent that sees `"default"` together with a `warnings` entry should read again with the row the
warning names.

## Headers that span merged cells

A header cell merged across several columns names only the first of them under the default
`mergedCells: "master"`. With `mergedCells: "repeat"` every column the merge covers gets the same
header, which makes a vertically merged header (`A1:A2`) addressable by name, and makes a horizontal
group label (`B1:C1`) name two columns at once — address those by letter.
