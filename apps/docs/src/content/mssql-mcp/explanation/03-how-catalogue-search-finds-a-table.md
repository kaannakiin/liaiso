# How catalogue search finds a table

An agent in an unfamiliar database does not know that orders live in `dbo.SIPARIS_BASLIK`. It knows
it wants orders. `search_catalog` exists to close that gap, and there is no `list_tables` beside it:
a search with no words is the listing. This page explains what the search reads, how it ranks, and
what it will not do.

## What is indexed

On the first search the server reads the catalogue in two queries, one for tables and views and one
for their columns, together with the `MS_Description` extended property of each. It turns names and
descriptions into words: `shipped_at` becomes `shipped` and `at`, and `OrderLines` is filed under
`orderlines`, `order` and `lines`, so either spelling finds it. Case and accents are folded, so
`Müşteri` and `musteri` are the same word. The result is an inverted index held in memory.

Measured on a catalogue of 614 objects and 11,518 columns, reading and building took about half a
second, and a search from the cached index about a millisecond. The index is reused for 15 minutes,
or until a search passes `refresh: true`.

The index covers what the login can see and nothing else: the catalogue queries run with the same
permissions as every other query.

## How results are ranked

Each word of the query is looked up exactly, and also as the start of longer words: `ship` finds
`shipped`, though an exact match counts twice as much as a prefix. A match counts for more when the
word is rare in this catalogue. A word that appears in one table's name says much more about that
table than a word such as `id` that appears in every table. A match in the object's own name counts
for more than one in a column name or a description. The scores add up per object, and each result
lists what matched, field by field, so the agent can see why a table was offered rather than take
the ranking on trust.

The ranking uses rarity alone, not how often a word occurs within one name. Identifiers are one to
four words long, so a count inside a name distinguishes nothing.

## What it will not do

- **Match the middle of a word.** `tarih` does not find `FATURATARIH`. Matching substrings would
  make every short query match half the catalogue.
- **Know synonyms or translate.** `client` does not find `customer`. A description that uses both
  words is how a catalogue answers both.
- **Search the data.** The index holds names and descriptions, never rows. Finding the table that
  holds a given customer is a search for `customer` followed by a query.
- **Return columns as results.** A column match lifts its table; on a large catalogue, one word
  would otherwise return hundreds of columns and bury the tables.

## When the catalogue is too large

The index holds at most 5,000 objects and 50,000 columns. Past that it covers a prefix of the
catalogue, and every object inside it is whole. When the column read is cut in the middle of a
table, that table is dropped entirely rather than half indexed, because a half-indexed table would
answer a search for a missing column with silence while still appearing in other results, which
reads as "that column does not exist". Every answer reports `catalog.complete`, and an incomplete
one says where coverage ends.
