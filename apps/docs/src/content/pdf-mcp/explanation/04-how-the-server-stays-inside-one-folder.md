# How the server stays inside one folder

You give the server one folder when you start it. That folder is the whole of what an agent can
read: not the rest of your disk, not a parent directory, not a file a symbolic link points to
elsewhere, and not a network address. This page explains what holds that line.

## Paths are resolved against the folder itself

At startup the server opens the folder and keeps a handle to it. Every path an agent passes is
resolved relative to that handle by a native module, not by joining strings and checking a prefix. A
`..` that climbs above the folder, an absolute path, or a symbolic link that leads outside is
refused with `path_outside_root`. The containment check comes before the existence check, so an
agent cannot use error codes to learn what exists outside, and error messages never carry the
folder's absolute path.

Where the native module has no build, the server refuses to read at all (`unsupported_platform`)
rather than fall back to weaker checks in JavaScript.

## The server has no network code

A PDF can contain links and references to other files. The server never follows them: the
package's source is not allowed to import `fetch` or any of Node's network modules, and lint fails
the build if it does. A document is read as the bytes in the file and nothing else. The one way to
send anything anywhere is an OCR binding you pass with `--ocr`, which is your code, not the
server's. [Why OCR is a plug-in and off by
default](/docs/pdf-mcp/why-ocr-is-a-plug-in-and-off-by-default) explains that choice.

## Extraction is bounded

The PDF engine is native code, and a hostile or enormous file should not be able to stall the
server. A file over 32 MiB is refused by the read itself, before the engine sees a byte of it, and a
document with more than 2,000 pages is refused once its page count is known, before its pages are
extracted. At most two documents are extracted at once, and an extraction that runs past 20 seconds
fails the call. Native work that has started cannot be cancelled, so the slot stays taken until the
work ends. These are budgets that keep one file from exhausting the server, not a sandbox around the
engine.

A password-protected document is refused with `encrypted_pdf`. The server has no way to ask for a
password and does not try.

## Reads see one version of a file

A file is opened, measured and read as one snapshot, and its identity is checked before and after. A
file that changes during a read fails with `file_changed`; one that changes between two pages fails
with `stale_cursor`. When a page is sent to OCR, the bytes are read again and checked against the
same fingerprint, so a page image never comes from a different version of the file than the page
numbers it is reported under.

## Where the line ends

Two things are outside what the boundary can defend: **hard links** inside the folder to files
elsewhere, which are the same file under another name, and **mounts**, since someone who can mount a
filesystem over the folder can change what it contains. Do not create the first, and do not give an
untrusted user the privilege for the second. The server has no tool that writes, so what it can
reach is exactly what you put in the folder.
