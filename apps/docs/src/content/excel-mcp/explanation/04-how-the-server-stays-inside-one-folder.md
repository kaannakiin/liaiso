# How the server stays inside one folder

You give the server one folder when you start it. That folder is the whole of what an agent can
read: not the rest of your disk, not a parent directory, not a file a symbolic link points to
elsewhere. This page explains what holds that line, and where the line ends.

## The folder is opened once

At startup the server opens the folder and keeps a handle to it. Every later path an agent passes
is resolved relative to that handle by a native module, not by joining strings and checking a
prefix. A `..` that climbs above the folder, an absolute path, or a symbolic link that leads outside
is refused with `path_outside_root`.

String checks are where sandboxes usually fail: a path is checked, then a symbolic link is swapped in
before it is opened, or two spellings of the same path compare differently. Resolving against an
open handle closes both, which is why there is no pure-JavaScript fallback. Where the native module
has no build, the server refuses to read at all (`unsupported_platform`) rather than read with weaker
checks.

## Refusals do not reveal what exists

The containment check comes before the existence check. A path outside the folder is refused as
outside whether or not a file is there, so an agent cannot use error codes to map your disk. Error
messages never carry the folder's absolute path either: it is removed from every error before the
answer is sent.

## Reads see one version of a file

A file is opened, measured and read as one snapshot, and its identity is checked before and after. A
file that changes during a read fails with `file_changed`; a file that changes between two pages of
a read fails with `stale_cursor`. An answer never mixes two versions of the same file.

## Where the line ends

The boundary is the folder you choose, enforced against the filesystem as your user sees it. Two
things are outside what it can defend:

- **Hard links.** A hard link inside the folder is the same file as its other name, wherever that
  is. Do not create hard links into the folder to files the agent should not read.
- **Mounts.** Someone with the privilege to mount a filesystem over the folder can change what it
  contains. Do not give an untrusted user that privilege.

The server has no tool that writes, renames or deletes, so the question of what an agent can change
does not arise. What it can read is exactly what you put in the folder, so give it the narrowest one
that holds the files it needs.
