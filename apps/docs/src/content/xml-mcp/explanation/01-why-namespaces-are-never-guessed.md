# Why namespaces are never guessed

The most common reason an XML query returns nothing is a namespace. A document declares
`xmlns="urn:example:orders"` once at the top, every element below inherits it, and nothing in the
text of `<order>` shows that its real name is `{urn:example:orders}order`. XPath 1.0 is strict about
this: `//order` matches only elements in no namespace, so it matches nothing here.

A server could smooth that over. It could rewrite `//order` to match any element whose local name is
`order`, or bind the default namespace to a prefix behind the scenes. This one does neither.

## A guessed namespace is a wrong answer waiting

Namespaces exist because two vocabularies can use the same local name. A document can hold an
`order` from an ordering schema and an `order` from a sorting schema; a SOAP envelope wraps a body in
one namespace around a payload in another; an XHTML page can embed SVG, where `title` means something
else. Matching by local name alone merges those, and the answer is wrong in a way that looks right.
Guessing a binding is worse: it works on the document it was tested on and silently changes meaning
on the next one.

## What the server does instead

It gives the agent everything it needs to be exact. `describe_document` lists every namespace URI in
the document with a stable alias: the declared prefix where there is one, and a synthetic `ns1`,
`ns2` for a default namespace that has no prefix. Every address the tools accept or return names an
element by URI and local name, never by prefix, so an address means the same thing whatever prefixes
a file happens to use. `select_xpath` takes explicit `namespaces` bindings and refuses a prefix that
is used but not bound.

And when a query comes back empty for the usual reason, the answer says so. An empty node-set from
an expression with an unprefixed name test, on a document whose root element is in a namespace,
carries a `default_namespace_unprefixed` diagnostic that names the namespace and the fix. The server explains
the empty result; it does not change the question to make it non-empty.

The mechanics are in [How to query a document with XPath](/docs/xml-mcp/query-a-document-with-xpath).
