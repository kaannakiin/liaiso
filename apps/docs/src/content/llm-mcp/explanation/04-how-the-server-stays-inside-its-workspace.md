# How the server stays inside its workspace

The server reads files so that the agent does not have to, which makes it a file reader an agent can
aim. This page explains what limits where it reads, where it writes, and where the text goes.

## One folder, checked twice

At startup the server resolves its workspace, the working directory or `SEZZLEE_LLM_ROOT`, to its
real path. Every file argument is resolved against it and checked twice: the path as given, and
the path after following symbolic links. A `..` that climbs out, an absolute path elsewhere, or a
link inside the workspace that points outside it are all refused with `outside_workspace`. Only a
path that passed both checks can be read, and the type system enforces that inside the server.

In error messages, the workspace's absolute path is shown as `.`, so an answer never reveals where
on disk the workspace is.

A file must be UTF-8 text. A binary file, or text in another encoding, is refused with `not_text`
rather than sent to the model as noise.

## One kind of write

`local_map` is the only tool that writes, and it can only add a file:

- The file goes into the output folder, `.llm-mcp/out` by default, which must be inside the
  workspace. Its real path is checked again before each write, so a link cannot move it elsewhere.
- The name is the server's, built from the input's name, the label column and a time stamp, reduced
  to letters, digits, dots, dashes and underscores, with a fixed `.csv` extension. No argument can
  choose a name such as `AGENTS.md`, or a folder to climb into.
- The file is created new, and creation fails rather than replace an existing file or follow a link
  there. Nothing is ever deleted, and the input is never changed.

The MCP annotations say the same: `local_status` and `local_task` are read-only, and `local_map` is
marked non-destructive.

## Where the text goes

The files the tools read are sent to the model host named in `SEZZLEE_LLM_BASE_URL`, and nowhere
else. The server's code can reach the network only in the one module that talks to Ollama, which
lint enforces, and it never passes the agent's credentials or its own environment to the host. With
the default address that host is your own machine. Point it elsewhere only at a host you would give
those files to.
