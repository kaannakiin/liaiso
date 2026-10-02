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
The workbook root '~/sezzlee-sheets' does not exist.
```

Everything under the folder is readable, including subfolders, and nothing outside it is. Point it at
the narrowest folder that holds the files the agent needs.

## Claude Code

```sh
claude mcp add excel -- npx -y @sezzlee/excel-mcp /Users/you/sheets
```

The shell expands `~` here, so `~/sheets` also works in this one place. Add `--scope project` to
write the entry to `.mcp.json` and share it with everyone who clones the repository.

## Claude Desktop

Edit `claude_desktop_config.json` (**Settings → Developer → Edit Config**) and restart the app:

```json
{
  "mcpServers": {
    "excel": {
      "command": "npx",
      "args": ["-y", "@sezzlee/excel-mcp", "/Users/you/sheets"]
    }
  }
}
```

On Windows, write the path with escaped backslashes: `"C:\\Users\\you\\sheets"`.

## Cursor

Add the same `mcpServers` entry to `.cursor/mcp.json` in the project, or to `~/.cursor/mcp.json` for
every project.

## VS Code

Add a server to `.vscode/mcp.json`. VS Code names the top-level key `servers` and wants the
transport stated:

```json
{
  "servers": {
    "excel": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@sezzlee/excel-mcp", "/Users/you/sheets"]
    }
  }
}
```

## Any other client

Any client that starts a stdio server works. The command is `npx`, the arguments are `-y`,
`@sezzlee/excel-mcp` and the folder. If the client cannot run `npx`, install the package once with
`npm install -g @sezzlee/excel-mcp` and use the command `sezzlee-excel` with the folder as its only
argument.

## Check that it started

Ask the agent to list the workbooks it can read. It should call `list_workbooks` and name your
files. If the client reports that the server exited, run the same command in a terminal: a wrong
folder prints the message above, and a missing native binary for your platform is reported as
`unsupported_platform` (see [Introduction](/docs/excel-mcp/introduction) for the supported platforms).
