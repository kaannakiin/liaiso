# How to connect the server to your MCP client

Every client starts the server as a local command with one argument: the absolute path of the folder
it may read. The server runs until the client closes it.

> **Not run by us.** The Claude Code command below was checked against `claude mcp add --help`; the
> JSON configurations follow each client's documented format but were not loaded into those clients
> for this page.

## Choose the folder

Pass an **absolute** path. A JSON configuration is not read by a shell, so `~` is not expanded, and a
relative path resolves against whatever directory the client happens to start in. Either way the
server exits at once:

```text
The PDF source root '~/documents' does not exist.
```

Everything under the folder is readable, including subfolders, and nothing outside it is. Point it at
the narrowest folder that holds the documents the agent needs.

## Claude Code

```sh
claude mcp add pdf -- npx -y @liaiso/pdf-mcp /Users/you/documents
```

The shell expands `~` here, so `~/documents` also works in this one place. Add `--scope project` to
write the entry to `.mcp.json` and share it with everyone who clones the repository.

## Claude Desktop

Edit `claude_desktop_config.json` (**Settings → Developer → Edit Config**) and restart the app:

```json
{
  "mcpServers": {
    "pdf": {
      "command": "npx",
      "args": ["-y", "@liaiso/pdf-mcp", "/Users/you/documents"]
    }
  }
}
```

On Windows, write the path with escaped backslashes: `"C:\\Users\\you\\documents"`.

## Cursor

Add the same `mcpServers` entry to `.cursor/mcp.json` in the project, or to `~/.cursor/mcp.json` for
every project.

## VS Code

Add a server to `.vscode/mcp.json`. VS Code names the top-level key `servers` and wants the
transport stated:

```json
{
  "servers": {
    "pdf": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@liaiso/pdf-mcp", "/Users/you/documents"]
    }
  }
}
```

## Any other client

Any client that starts a stdio server works. The command is `npx`, the arguments are `-y`,
`@liaiso/pdf-mcp` and the folder. If the client cannot run `npx`, install the package once with
`npm install -g @liaiso/pdf-mcp` and use the command `liaiso-pdf` with the folder as its only
argument.

## Add OCR

The folder is the only required argument. To let the agent read scanned pages, add `--ocr` and the
path of an OCR binding after it, for example `["-y", "@liaiso/pdf-mcp", "/Users/you/documents",
"--ocr", "/Users/you/liaiso-ocr/binding.mjs"]`. [How to read scanned pages with
OCR](/docs/pdf-mcp/read-scanned-pages-with-ocr) builds that binding.

## Check that it started

Ask the agent to list the documents it can read. It should call `list_documents` and name your
files. If the client reports that the server exited, run the same command in a terminal: a wrong
folder prints the message above, and on an Intel Mac the server prints that the PDF engine could not
be loaded on `darwin-x64` and exits with code 3.
