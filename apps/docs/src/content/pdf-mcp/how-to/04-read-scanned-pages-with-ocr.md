# How to read scanned pages with OCR

A scanned page has no text layer, so the server reports it as `needsOcr` and cannot search it. This
page sets up OCR with a local [Ollama](https://ollama.com) model, so that a call can ask for those
pages to be transcribed.

The server performs no OCR itself and never opens a network connection. You start it with an **OCR
binding**: a small module you own that names a rasterizer, which turns a page into an image, and a
provider, which turns the image into text. Whichever provider you bind is where the page images go.
Here that is Ollama on your own machine; the same binding can point at another host.

You need [Ollama](https://ollama.com/download) running, and the steps of [Reading your first
PDF](/docs/pdf-mcp/reading-your-first-pdf) done, so that `~/sezzlee-pdf` holds
[supply-agreement.pdf](/samples/pdf-mcp/supply-agreement.pdf), whose page 2 is a scan.

## 1. Pull an OCR model

```sh
ollama pull deepseek-ocr:3b
```

The provider below sends each page with the prompt this model was measured to answer with plain
text. Another vision model works too, but measure its answers before relying on them.

## 2. Build the binding

The binding lives in a folder of its own, which holds the two adapter packages:

```sh
mkdir -p ~/sezzlee-ocr && cd ~/sezzlee-ocr && npm init -y >/dev/null
npm install --silent @sezzlee/pdf-raster-pdfjs @sezzlee/ocr-ollama
```

`@sezzlee/pdf-raster-pdfjs` renders pages with pdf.js, and `@sezzlee/ocr-ollama` sends each image to
Ollama. Write the binding next to them:

```sh
cat > ~/sezzlee-ocr/binding.mjs <<'EOF'
import { createPdfjsRasterizer } from "@sezzlee/pdf-raster-pdfjs";
import { createOllamaOcrProvider } from "@sezzlee/ocr-ollama";

export default {
  rasterizer: createPdfjsRasterizer(),
  provider: createOllamaOcrProvider({
    baseUrl: process.env.SEZZLEE_PDF_OCR_URL ?? "http://127.0.0.1:11434",
    model: process.env.SEZZLEE_PDF_OCR_MODEL ?? "deepseek-ocr:3b",
  }),
  dpi: 200,
};
EOF
```

The server loads this module with `--ocr` and checks it before it opens any document: its default
export must have a `rasterizer` with a `render` method and a `provider` with a `name` and a
`recognize` method. `dpi` is optional and defaults to 200.

## 3. Start the server with the binding

Define a second helper, which passes `--ocr` to the server. The `--` tells the Inspector that
everything before it belongs to the server's command line:

```sh
pdfocr() {
  npx -y @modelcontextprotocol/inspector --cli sezzlee-pdf ~/sezzlee-pdf --ocr ~/sezzlee-ocr/binding.mjs \
    -- --method tools/call --tool-name "$@" | jq '.content[0].text | fromjson'
}
```

Check that the binding is in place:

```sh
pdfocr describe_document --tool-arg filePath=supply-agreement.pdf \
  | jq -c '{pagesNeedingOcr, ocr: .capabilities.ocr, ocrProvider}'
```

```json
{"pagesNeedingOcr":[2],"ocr":true,"ocrProvider":"ollama/deepseek-ocr:3b"}
```

`capabilities.ocr` is `true` and `ocrProvider` names the model. Without `--ocr` it is `false`, and
a call that asks for OCR fails with `ocr_unavailable` instead of quietly returning the untranscribed
page.

## 4. Read the scanned page

OCR is off unless a call asks for it. Pass `ocr=true`:

```sh
pdfocr read_pages --tool-arg filePath=supply-agreement.pdf 'pages=[2]' ocr=true \
  | jq '{ocr, page: .pages[0] | {page, needsOcr, source}}'
```

```json
{
  "ocr": {
    "provider": "ollama/deepseek-ocr:3b",
    "recognizedPages": [
      2
    ],
    "truncated": false
  },
  "page": {
    "page": 2,
    "needsOcr": false,
    "source": "ocr"
  }
}
```

The page now reports `source: "ocr"`, and `ocr.recognizedPages` lists the pages the provider
answered for in this call. Its text is the transcription:

```sh
pdfocr read_pages --tool-arg filePath=supply-agreement.pdf 'pages=[2]' ocr=true \
  | jq -r '.pages[0].markdown'
```

```text
Schedule B – Payment terms

Contract value: EUR 48,000

Payment: 12 monthly instalments of EUR 4,000

Due date: the 15th day of each month

Late payment interest: 1.5% per month

Signed for Northwind Supplies: Ada Lovelace

Signed for Harbor Retail: Emre Kaya

Date: 12 January 2026
```

Only pages marked `needsOcr` are sent; a page with a text layer never is. A running server keeps
each transcription, keyed by the document's content and the page number, so an agent that reads the
page again gets it without a second trip to the model. The helper above starts a new server for
every call, so here each call transcribes the page afresh.

## 5. Search the whole document

The same flag makes the scanned page searchable:

```sh
pdfocr find_in_document --tool-arg filePath=supply-agreement.pdf query="48,000" ocr=true \
  | jq -c '{matches: [.matches[] | {page, context}], coverageComplete}'
```

```json
{"matches":[{"page":2,"context":"Contract value: EUR 48,000"}],"coverageComplete":true}
```

The contract value is found on page 2, and `coverageComplete` is `true`: every page was read.

## Connect it to your client

In a client configuration, add `--ocr` and the binding's absolute path after the folder. To reach an
Ollama on another machine, set `SEZZLEE_PDF_OCR_URL` in the server's environment; the binding above
reads it, and `SEZZLEE_PDF_OCR_MODEL` for the model:

```json
{
  "mcpServers": {
    "pdf": {
      "command": "npx",
      "args": ["-y", "@sezzlee/pdf-mcp", "/Users/you/documents", "--ocr", "/Users/you/sezzlee-ocr/binding.mjs"],
      "env": { "SEZZLEE_PDF_OCR_URL": "http://10.0.0.5:11434" }
    }
  }
}
```

The server does not pass its environment on to anything else: the variables are read only by your
binding.

## What to expect from a long scan

- **Ten pages per call.** At most ten pages are sent to the provider in one call. When more of the
  requested pages need OCR, `ocr.truncated` is `true` and the rest keep `needsOcr`; the same call
  again, to the same running server, transcribes the next ten, since the first ten come from its
  cache. A binding can lower the
  batch with `maxPagesPerCall`, never raise it.
- **One run at a time, two minutes at most.** A second call that needs OCR while one is running fails
  with `resource_limit`. A run over its budget fails with `ocr_failed`; a binding can lower the
  budget with `timeoutMs`. A run that has started cannot be cancelled, so its slot stays taken until
  the provider answers.
- **An empty answer is not text.** If the model returns nothing for a page, the page stays `needsOcr`
  rather than becoming an empty page.
- **Searching walks the scan in order.** `find_in_document` with `ocr=true` stops before a page it has
  not transcribed yet and returns a `nextCursor`; follow it to the end and every page is searched.
