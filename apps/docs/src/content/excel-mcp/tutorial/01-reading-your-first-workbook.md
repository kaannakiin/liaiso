# Reading your first workbook

By the end of this page you will have asked a sample workbook which region sold the most, and the
server will have answered with one number per region instead of a page of rows.

You will call the tools yourself, the way an agent does, so you can see exactly what the agent
receives. Connecting an agent comes after, in one command.

You need Node.js 22 or later and `jq`.

## 1. Install the server

```sh
npm install -g @liaiso/excel-mcp
```

This puts the `liaiso-excel` command on your path.

## 2. Give it a folder

The server reads one folder and nothing outside it. Create one:

```sh
mkdir ~/liaiso-sheets
```

Download [sales.xlsx](/samples/excel-mcp/sales.xlsx) and save it into `~/liaiso-sheets`. It holds
twelve orders on a sheet called `Orders` and one target per region on a sheet called `Targets`.

## 3. Make calling a tool short

The MCP Inspector can start the server and call one tool from the command line. Define a shell
function so each call below is one line:

```sh
excel() {
  npx -y @modelcontextprotocol/inspector --cli liaiso-excel ~/liaiso-sheets \
    --method tools/call --tool-name "$@" | jq '.content[0].text | fromjson'
}
```

Every tool answers with one text item that holds JSON; the `jq` at the end unpacks it.

## 4. See what the server can read

```sh
excel list_workbooks | jq '.files'
```

```json
[
  {
    "filePath": "sales.xlsx",
    "sizeBytes": 9278,
    "modifiedAt": "2026-09-28T07:14:27.542Z",
    "mode": "resident"
  }
]
```

`filePath` is relative to the folder. Every other tool takes it exactly as it appears here.

## 5. Look at the workbook before reading it

```sh
excel describe_workbook --tool-arg filePath=sales.xlsx \
  | jq '.sheets[] | {name, usedRange, tableCount, formulaCellCount}'
```

```json
{
  "name": "Orders",
  "usedRange": "A1:H13",
  "tableCount": 1,
  "formulaCellCount": 12
}
{
  "name": "Targets",
  "usedRange": "A1:B5",
  "tableCount": 0,
  "formulaCellCount": 0
}
```

`Orders` spans `A1:H13`: a header row and twelve orders. Its twelve formulas are the `Total`
column. An agent calls this tool first, because it says how big each sheet is before anything is
read.

## 6. Read a few rows

```sh
excel read_sheet --tool-arg filePath=sales.xlsx range=A1:H4 \
  | jq -c '.range, [.columns[].header], .values[]'
```

```json
"A2:H4"
["Order","Date","Region","Rep","Product","Units","Unit price","Total"]
[1001,"2026-01-05","North","Ada","Desk",4,250,1000]
[1002,"2026-01-06","South","Emre","Chair",10,85,850]
[1003,"2026-01-08","East","Lena","Lamp",12,30,360]
```

You asked for `A1:H4` and got `A2:H4` back: row 1 became the column headers, and the rows below it
are plain arrays in the same column order. Numbers are numbers, dates are ISO strings, and `Total`
shows the value its formula last calculated.

## 7. Find a value

```sh
excel find_in_sheet --tool-arg filePath=sales.xlsx query=lamp \
  | jq -c '.matches[] | {address, value}'
```

```json
{"address":"E4","value":"Lamp"}
{"address":"E9","value":"Lamp"}
{"address":"E10","value":"Lamp"}
{"address":"E11","value":"Lamp"}
```

`lamp` found `Lamp`: matching ignores case and accents unless you pass `caseSensitive=true`.

## 8. Ask the question

Which region sold the most? Group by `Region` and add up `Total`:

```sh
excel aggregate_sheet --tool-arg filePath=sales.xlsx \
  'groupBy=["Region"]' 'metrics=[{"fn":"sum","column":"Total"}]' \
  | jq -c '[.columns[].label], .rows[]'
```

```json
["Region","sum(Total)"]
["East",1290]
["North",1660]
["South",1810]
["West",1865]
```

West sold the most, at 1,865. The server read all twelve rows and returned four. On a sheet with
fifty thousand rows the answer would be the same size, which is why an agent should reach for
`aggregate_sheet` before it pages through `read_sheet`.

## What you did

You started the server on one folder, listed what it can read, looked at a workbook's shape, read
rows, searched, and had the server compute an answer. These are the calls an agent makes. To give
them to one, see [How to connect the server to your MCP
client](/docs/excel-mcp/connect-the-server-to-your-mcp-client).
