# How to query a document with XPath

`select_xpath` evaluates one XPath 1.0 expression and returns a typed result. The expression runs
exactly as you wrote it: the server never rewrites it, never guesses a namespace, and offers no
extension functions and nothing from XPath 2.0 or later.

The examples use the `xml` shell function from [Reading your first XML
document](/docs/xml-mcp/reading-your-first-xml-document), on its `orders.xml`.

## Bind the namespaces

In XPath 1.0 a name without a prefix matches only elements in **no** namespace. `orders.xml` puts
every element in a default namespace, so the obvious query finds nothing:

```sh
xml select_xpath --tool-arg filePath=orders.xml xpath=//order \
  | jq '{resultType, totalMembers, diagnostics}'
```

```json
{
  "resultType": "nodeset",
  "totalMembers": 0,
  "diagnostics": [
    {
      "code": "default_namespace_unprefixed",
      "message": "The node-set is empty. The document element is in the namespace urn:example:orders, and in XPath 1.0 an unprefixed name test such as order matches only elements in no namespace.",
      "recovery": "Bind it in namespaces; describe_document returns an alias for every namespace in the document."
    }
  ]
}
```

The server does not fix the query for you; it says why it is empty. Bind a prefix of your choice to
each namespace URI with `namespaces` and use it in the expression. `describe_document` lists every
URI with an alias you can reuse:

```sh
xml select_xpath --tool-arg filePath=orders.xml \
  "xpath=//o:order[not(o:region)]/@id" \
  'namespaces=[{"prefix":"o","uri":"urn:example:orders"}]' \
  | jq -c '.resultType, (.members[] | {kind, localName, value, address: [.address[].occurrence]})'
```

```json
"nodeset"
{"kind":"attribute","localName":"id","value":"1006","address":[1,6]}
```

A prefix used in the expression but not bound is an error, and so is a prefix bound twice.

## Read the result type

`resultType` separates the four XPath results, so an empty node-set, an empty string, `false` and
`0` each come back as themselves:

```sh
xml select_xpath --tool-arg filePath=orders.xml \
  "xpath=sum(//o:order[@status='shipped']/p:payment)" \
  'namespaces=[{"prefix":"o","uri":"urn:example:orders"},{"prefix":"p","uri":"urn:example:payments"}]' \
  | jq -c '{resultType, numberKind, value, valueText}'
```

```json
{"resultType":"number","numberKind":"finite","value":2570,"valueText":"2570"}
```

```sh
xml select_xpath --tool-arg filePath=orders.xml \
  "xpath=boolean(//o:order[@status='refunded'])" \
  'namespaces=[{"prefix":"o","uri":"urn:example:orders"}]' \
  | jq -c '{resultType, value}'
```

```json
{"resultType":"boolean","value":false}
```

A number carries `numberKind`, which is `finite`, `nan`, `positiveInfinity` or
`negativeInfinity`. JSON has no `NaN` or infinity, so for those three `value` is `null`, and
`numberKind` and `valueText` say which one it was:

```sh
xml select_xpath --tool-arg filePath=orders.xml "xpath=0 div 0" \
  | jq -c '{numberKind, value, valueText}'
```

```json
{"numberKind":"nan","value":null,"valueText":"NaN"}
```

A node-set member is `element`, `attribute`, `text` or another node kind, with an
address that `read_node` accepts; a comment before the document element and a namespace node have
no address and say `unaddressable` instead.

## Bound a large node-set

`maxResults` caps the members returned, 50 by default and 200 at most, and `nextCursor` continues.
It bounds the answer, not the work: the engine may still build the whole node-set to count it. On a
large document prefer a predicate that narrows the set, or `project_records` for record-shaped data.

## What is refused

A function from XPath 2.0 or later, such as `matches()` or `lower-case()`, fails with
`query_not_supported` instead of being emulated, and so does the `namespace::` axis. XPath is
unavailable on a document read in chunked mode, over 8 MB.
