# How to read formulas as well as values

By default `read_sheet` returns what each cell shows: for a formula cell, the value Excel last
calculated and saved. `valueMode` changes that.

The examples use the `excel` shell function from [Reading your first
workbook](/docs/excel-mcp/reading-your-first-workbook), on its `sales.xlsx`, whose `Total` column is
`=F2*G2` and so on.

## Get both

```sh
excel read_sheet --tool-arg filePath=sales.xlsx range=F1:H3 valueMode=both \
  | jq '{values, cellNotes}'
```

```json
{
  "values": [
    [
      4,
      250,
      1000
    ],
    [
      10,
      85,
      850
    ]
  ],
  "cellNotes": {
    "H2": {
      "kind": "formula",
      "formula": "=F2*G2",
      "cached": true
    },
    "H3": {
      "kind": "formula",
      "formula": "=F3*G3",
      "cached": true
    }
  }
}
```

`values` keeps the calculated results, and `cellNotes` adds one entry per formula cell, keyed by
address. `cached: true` means the file stores a calculated value for that formula.

`valueMode: "formulas"` puts the formula text in `values` instead of the result.

## When a formula has no value

The server does not calculate. A formula that the saving program never calculated — common in files
written by code rather than by Excel — has no stored value. Its cell is `null`, and even under the default
`valueMode: "values"` the answer marks it in `cellNotes` with its formula and `cached: false`, and
adds a warning such as `1 formula cells have no cached value; this workbook has not been
recalculated by Excel.` `describe_workbook` reports the coverage per sheet as `formulaCellCount` and
`cachedFormulaValueCount`, so an agent can see the gap before it reads.

## Read hyperlinks

`includeHyperlinks: true` adds a note for each cell that links somewhere. Like `valueMode`, it is
not available on CSV files.

## Formats

`valueMode`, `mergedCells: "repeat"` and `includeHyperlinks` apply to `.xlsx` and `.xlsm`. A CSV has
no formulas; asking for them fails with `unsupported_for_format`.
