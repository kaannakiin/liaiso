# How the server stays inside one folder

You give the server one folder when you start it. That folder is the whole of what an agent can
read: not the rest of your disk, not a parent directory, not a file a symbolic link points to
elsewhere, and not a URL or file a document references. This page explains what holds that line.

## Paths are resolved against the folder itself

At startup the server opens the folder and keeps a handle to it. Every path an agent passes is
resolved relative to that handle by a native module, not by joining strings and checking a prefix.
A `..` that climbs above the folder, an absolute path, or a symbolic link that leads outside is
refused with `path_outside_root`. The containment check comes before the existence check, so an agent
cannot use error codes to learn what exists outside, and error messages never carry the folder's
absolute path.

Where the native module has no build, the server refuses to read at all (`unsupported_platform`)
rather than fall back to weaker checks in JavaScript.

## Documents cannot reach out

An XML document can try to pull in other resources: external entities, a DTD, XInclude. All of those
are declared through a DOCTYPE or resolved by the parser on request, and the server refuses every
DOCTYPE before parsing and never asks the parser to resolve anything. A document is read as the bytes
in the file and nothing else. [Why a DOCTYPE is refused](/docs/xml-mcp/why-a-doctype-is-refused)
explains the reasoning.

## Parsing happens in a separate worker

The XML parser runs as WebAssembly in a worker thread, away from the process that talks to the
client. The main process holds only a serializable handle to each parsed document; no parser pointer
crosses into it. The worker's output is kept off the server's standard output, because on stdio one
stray line would break the MCP connection. Each parse has a two-second deadline and a bounded queue,
and a document is parsed whole only up to 8 MB; beyond that it is read record by record.

These bounds keep one hostile or enormous file from stalling the server, but they are budgets, not a
wall: WebAssembly memory is not capped by the worker's heap limit, so the defaults are sized for the
smallest supported host rather than enforced per byte.

## Reads see one version of a file

A file is opened, measured and read as one snapshot, and its identity is checked before and after. A
file that changes during a read fails with `file_changed`; one that changes between two pages fails
with `stale_cursor`. An answer never mixes two versions of a document.

## Where the line ends

Two things are outside what the boundary can defend: **hard links** inside the folder to files
elsewhere, which are the same file under another name, and **mounts**, since someone who can mount a
filesystem over the folder can change what it contains. Do not create the first, and do not give an
untrusted user the privilege for the second. The server has no tool that writes, so what it can
reach is exactly what you put in the folder.
