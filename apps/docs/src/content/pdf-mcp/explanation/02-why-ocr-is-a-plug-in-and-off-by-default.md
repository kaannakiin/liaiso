# Why OCR is a plug-in and off by default

The server can read scanned pages, but it does not contain an OCR engine, a model client or a
renderer. You supply those in a binding, and even then every call has to ask for OCR by name. This
page explains why it is built that way.

## Page images leave the process

OCR means showing a picture of the page to something that can read it. Nowadays that is usually a
vision model, and a model runs somewhere: on this machine, on a server in the office, or at a cloud
provider. Wherever it runs, the page image goes there. For a contract, a payslip or a medical
record, that is a decision about where confidential pixels are sent. It belongs to whoever runs the
server, not to the server and not to the agent.

So the server makes no such decision. Its source code is not allowed to open a socket at all:
`fetch` and Node's network modules are banned by lint across the whole package. The only code that
can reach a model is the provider in the binding you pass with `--ocr`, which you wrote or chose.
Without `--ocr`, nothing is loaded, and no page image can leave the process.

## Two ports, not one feature

The binding has two parts because they are two separate jobs with separate choices:

- A **rasterizer** turns a PDF page into an image. `@sezzlee/pdf-raster-pdfjs` does this with pdf.js
  locally.
- A **provider** turns an image into text. `@sezzlee/ocr-ollama` sends it to an Ollama model. Another
  provider could call a hosted API or a local engine.

The server depends on neither package. It declares what each part must do and checks a binding for
those methods before it opens a document, so a broken binding fails at startup rather than on the
first scanned page. The same stance runs through sezzlee: the database layer names no database
driver, and the PDF server names no model.

## Off unless a call asks

Even with a binding, `ocr` defaults to `false` on every tool. OCR takes seconds per page where the
text layer takes milliseconds, and it sends data out, so neither should happen because an agent read
a page it did not know was scanned. The agent sees `needsOcr` and `coverageComplete: false`, and can
ask again with `ocr: true` when the answer matters.

Asking without a binding is an error, `ocr_unavailable`, never a quiet fallback to the text layer.
A caller that asked for OCR and got "no matches" would reasonably believe the scanned pages were
searched. `describe_document` reports `capabilities.ocr` so an agent can check before asking.

## Bounded, because it cannot be cancelled

A rasterizer or a model that has started work cannot be stopped from outside. So the server bounds
what it starts instead: one OCR run at a time, at most ten pages per call, two minutes per run. A
run that goes over its budget fails the call with `ocr_failed`, but keeps its slot until the work
really ends. Freeing the slot on a timer would only let a stuck provider pile up more stuck work.

Each transcription is kept in memory, keyed by the document's content and the page number, so a page
is not sent twice while the server runs. A changed file has different content and is transcribed
again.
