# Why CSV values are never converted

A CSV file stores text and nothing else. There is no type for a cell, no date format, no marker
that says a column holds numbers. Every program that opens one has to decide what `01234`,
`03-04-2024` and `true` mean, and the decision it makes is often unrecoverable.

## Conversions destroy information

`01234` read as a number is `1234`: the leading zero of a postcode, an account number or a product
code is gone, and nothing in `1234` says it was ever there. `03-04-2024` is the 4th of March in one
locale and the 3rd of April in another; converted to a date, the ambiguity disappears without being
resolved. `1.234` is one-point-two in one convention and one thousand two hundred thirty-four in
another.

Spreadsheet programs make these conversions on open, which is why a CSV that went through one often
comes back changed. An agent reading data to answer a question should see what the file says, not
what a converter concluded.

## The server reports and the caller decides

`read_sheet` returns every CSV value as the exact string in the file. What the server does detect —
the delimiter and the encoding — it reports on every answer, together with whether it detected or
was told (`delimiterSource`, `encodingSource`). When detection cannot decide, it fails with
`ambiguous_delimiter` or `undecodable_text` rather than pick.

Where a number is needed, the caller says so. `aggregate_sheet` skips numeric text for `sum`, `avg`
and the other numeric metrics, and reports how many cells it skipped; `coerceText: true` asks it to
read `"1234.50"` as a number. The conversion is then a visible choice in the call, not a hidden
default in the reader.

## Workbooks are different

An `.xlsx` cell has a type: the file stores a number as a number and a date as a serial with a date
format. The server returns those typed values as they are stored, with dates as ISO strings. The
rule is the same in both formats — report what the file holds — and the difference comes from the
files.
