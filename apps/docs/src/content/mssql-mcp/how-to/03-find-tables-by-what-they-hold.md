# How to find tables by what they hold

`search_catalog` finds tables and views from a description of what you need, so an agent can work
in a database whose names it has never seen. Use this page to search by words, narrow by name or
schema, and page through a large catalogue.

The examples use the sample schema and the `sql` helper from [Querying your first
database](/docs/mssql-mcp/querying-your-first-database):

```sh
sql() {
  npx -y @modelcontextprotocol/inspector --cli --config ~/sezzlee-mssql.json --server shop \
    --method tools/call --tool-name "$@" | jq '.content[0].text | fromjson'
}
```

## Search with words

`query` is a few words. Each is matched against schema, table, view and column names, and against
the descriptions stored with them as `MS_Description` extended properties:

```sh
sql search_catalog --tool-arg query=revenue schema=sezzlee_shop \
  | jq -c '.results[] | {name, kind, matched}'
```

```json
{"name":"order_totals","kind":"view","matched":[{"field":"description","term":"revenue","value":"Revenue per order, summed from its lines."}]}
```

Nothing is named "revenue"; the view's description says it. Descriptions are how a catalogue with
cryptic names becomes searchable, so it pays to write them.

A word also matches names that begin with it, and case and accents are ignored:

```sh
sql search_catalog --tool-arg query=SHIPP schema=sezzlee_shop \
  | jq -c '.results[] | {name, matched: [.matched[] | "\(.field): \(.value)"]}'
```

```json
{"name":"orders","matched":["description: One row per purchase; status is pending, shipped or cancelled.","column: shipped_at","columnDescription: shipped_at"]}
```

Only the beginning of a word is matched, never the middle: `ship` finds `shipped_at`, but `date`
does not find `ordered_on`, and `tarih` does not find `FATURATARIH`. Search for the start of the
name as it is written.

The search reads names and descriptions, not the data in the rows. To find which table holds a
given customer, search for the concept, `customer`, then query it.

## Narrow by schema, name or kind

`schema` keeps one schema, `namePattern` is a `LIKE` pattern on the object's name, where `%` stands
for any run of characters, and `includeViews=false` leaves views out. With no `query`, the matches
are listed by name:

```sh
sql search_catalog --tool-arg schema=sezzlee_shop namePattern="order%" \
  | jq -c '[.results[] | {name, kind}]'
```

```json
[{"name":"order_lines","kind":"table"},{"name":"order_totals","kind":"view"},{"name":"orders","kind":"table"}]
```

## Page through many results

`maxResults` caps one answer, 50 by default and 200 at most. When more remain, `truncated` is
`true` and `nextCursor` continues with the same filters:

```sh
sql search_catalog --tool-arg schema=sezzlee_shop maxResults=2 \
  | jq -c '{names: [.results[].name], truncated}'
```

```json
{"names":["customers","ledger"],"truncated":true}
```

Pass `nextCursor` back with the same `query`, `schema`, `namePattern` and `includeViews`; a cursor
passed with other ones fails with `stale_cursor`.

## After a schema change

The server reads the catalogue once and reuses it for 15 minutes. A table created since then is not
found until the copy expires, or until a search passes `refresh=true`, which reads the catalogue
again and makes earlier cursors stale.

## When the catalogue is large

Each answer carries a `catalog` block. Its `complete` is `false` when the database has more than
5,000 tables and views or 50,000 columns, the most the search index holds. The index then covers a
prefix of the catalogue, every object in it whole, and a search that finds nothing may have missed
an object past the cut, so the answer says where coverage ends. `describe_table` still reads any
table whose name you already know.
