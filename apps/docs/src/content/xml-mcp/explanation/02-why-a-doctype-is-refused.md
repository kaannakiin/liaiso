# Why a DOCTYPE is refused

The server refuses any document that has a DOCTYPE declaration, with `doctype_not_allowed`, before
the parser sees a byte of it. That includes a harmless-looking internal subset that only declares an
entity for a company name. This is the one place where the server turns away well-formed XML, and it
does so on purpose.

## What a DOCTYPE can do

A document type declaration is not only a reference to a schema. It can define entities that the
parser substitutes into the document, and those entities are where XML's best-known attacks live:

- An **external entity** points at a file or a URL, and the parser inlines whatever it finds. A
  document that references `/etc/passwd` or an internal service address turns a read-only tool into a
  way to read files outside the folder or reach the network.
- **Nested entities** expand exponentially. A few hundred bytes that define an entity as ten copies of
  another, ten levels deep, grow into gigabytes in memory.

An agent reads documents it did not write. Any of those files could carry such a declaration, and the
agent would not know until the damage was done.

## Why a parser flag is not enough

Parsers have options to switch off external entities, and the one this server uses has them. They
were measured to be incomplete: the option that blocks external entities does not stop the internal
DTD subset from being processed, so an internal entity still expands. A defense that depends on every
flag being right in every version is one upgrade away from failing.

So the check comes first. Before parsing, the server scans the prolog — the part of the file before
the document element — and refuses on a DOCTYPE. The parser's own view of the document type is a
second check behind that one, not the only one. The same prolog scan refuses the UCS-4 and EBCDIC
encoding families, where an earlier scanner was measured to miss a DOCTYPE.

## What it costs

Documents that genuinely use a DTD, for entities or default attribute values, cannot be read. For
most data exchange that is rare; where it is not, remove the DOCTYPE from a copy of the file, or
expand the entities with a trusted tool first. The server has no schema validation either, so
nothing is lost that the server would otherwise have used.
