# Why values come back as written

Everything in XML is text. `<qty>010</qty>`, `<amount>1000.00</amount>` and
`<id>12345678901234567890</id>` carry no type; a schema might say one is an integer, but a document
does not, and this server does not read schemas. Every value the tools return is therefore the exact
text in the file: no trimming, no number or date conversion, CDATA reported as its own kind of text.

## Conversions lose things silently

`010` read as a number is `10`, and the leading zero of a code is gone. `1000.00` read as a number is
`1000`, and the precision the author wrote is gone. `12345678901234567890` read as a JavaScript
number becomes `12345678901234567000`, and that is a different identifier. `"  North "` trimmed is
`"North"`, which is usually what you want and occasionally is the bug you are looking for. None of
these changes announce themselves; the converted value looks as valid as the original.

An agent answering questions about a document needs the document's values, so the default is to
convert nothing and let the caller decide.

## Numbers when you ask for them

Some questions need arithmetic. `aggregate_document` can `sum`, `avg`, `min` and `max`, but only when
the call passes `numericMode: "binary64"`, an explicit acceptance that values become double-precision
numbers. Even then the server stays honest about what that means:

- A value with more digits than a double holds is **refused** with `numeric_precision`, not rounded,
  because a total built on it would be quietly wrong.
- A value a double can hold only approximately, such as `0.1`, is used and **counted** in `rounded`,
  so the caller knows the arithmetic was binary.
- A value that is not a number at all is **skipped** and counted, never read as zero.

Comparisons in `where` stay textual in every mode, so `"010"` never equals `"10"`.

## Gaps are reported, not filled

The same rule covers values that are not there. A column that finds nothing in a record is
`missing`, one that finds the empty string is `empty`, and one that finds several nodes is `multiple`
unless the call chose a policy. Nothing is defaulted to `null`, `""` or the first match behind the
caller's back, and every answer counts each case per column.
