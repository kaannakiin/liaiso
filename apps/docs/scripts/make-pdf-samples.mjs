import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../public/samples/pdf-mcp");
const { createCanvas } = createRequire(
  path.resolve(
    here,
    "../../../packages/adapters/pdf-raster-pdfjs/package.json",
  ),
)("@napi-rs/canvas");

const fonts = { regular: "F1", bold: "F2" };

function escape(text) {
  return text.replace(/[\\()]/g, (c) => `\\${c}`);
}

function textStream(lines) {
  const body = lines
    .map(
      ({ text, x = 72, y, size = 11, bold = false }) =>
        `BT /${bold ? fonts.bold : fonts.regular} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escape(text)}) Tj ET\n`,
    )
    .join("");
  return Buffer.from(body, "latin1");
}

function stream(dictionary, data) {
  return Buffer.concat([
    Buffer.from(`<<${dictionary}/Length ${data.length}>>\nstream\n`, "latin1"),
    data,
    Buffer.from("\nendstream", "latin1"),
  ]);
}

function assemble(objects, info) {
  const chunks = [Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  let offset = chunks[0].length;
  const offsets = [];
  objects.forEach((body, index) => {
    const head = Buffer.from(`${index + 1} 0 obj\n`, "latin1");
    const tail = Buffer.from("\nendobj\n", "latin1");
    const piece = Buffer.concat([
      head,
      Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1"),
      tail,
    ]);
    offsets.push(offset);
    chunks.push(piece);
    offset += piece.length;
  });
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const value of offsets)
    xref += `${String(value).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R/Info ${info} 0 R>>\nstartxref\n${offset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}

function pdf(title, pages) {
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "",
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>",
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>",
  ];
  const kids = [];
  for (const page of pages) {
    const pageNumber = objects.length + 1;
    let resources;
    let content;
    if ("jpeg" in page) {
      objects.push("");
      objects.push(
        stream(
          `/Type/XObject/Subtype/Image/Width ${page.width}/Height ${page.height}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode`,
          page.jpeg,
        ),
      );
      resources = `<</XObject<</Im1 ${pageNumber + 1} 0 R>>>>`;
      content = Buffer.from("q 612 0 0 792 0 0 cm /Im1 Do Q\n", "latin1");
    } else {
      objects.push("");
      resources = "<</Font<</F1 3 0 R/F2 4 0 R>>>>";
      content = textStream(page.lines);
    }
    objects.push(stream("", content));
    const contentNumber = objects.length;
    objects[pageNumber - 1] =
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources${resources}/Contents ${contentNumber} 0 R>>`;
    kids.push(`${pageNumber} 0 R`);
  }
  objects[1] = `<</Type/Pages/Kids[${kids.join(" ")}]/Count ${pages.length}>>`;
  objects.push(
    `<</Title (${escape(title)})/Producer (liaiso docs samples)/CreationDate (D:20260101000000Z)>>`,
  );
  return assemble(objects, objects.length);
}

function flow(blocks, top = 720) {
  const lines = [];
  let y = top;
  for (const block of blocks) {
    if (block.gap) {
      y -= block.gap;
      continue;
    }
    lines.push({ ...block, y });
    y -= Math.round((block.size ?? 11) * 1.6);
  }
  return { lines };
}

function row(cells, y, bold = false) {
  const columns = [72, 220, 330, 440];
  return cells.map((text, index) => ({
    text,
    x: columns[index],
    y,
    bold,
    size: 11,
  }));
}

const heading = (text) => ({ text, size: 16, bold: true });
const para = (text) => ({ text });
const gap = (size) => ({ gap: size });

function annualReport() {
  const table = [
    ["Region", "Revenue", "Orders", "Growth"],
    ["North", "1,240,000", "3,410", "+8.2%"],
    ["South", "980,500", "2,875", "+3.1%"],
    ["East", "1,105,250", "3,020", "+11.4%"],
    ["West", "612,800", "1,940", "-2.6%"],
    ["Total", "3,938,550", "11,245", "+5.9%"],
  ];
  const tablePage = flow([
    heading("2. Revenue by region"),
    gap(8),
    para("Revenue is reported in euros, net of returns."),
  ]);
  table.forEach((cells, index) => {
    tablePage.lines.push(
      ...row(
        cells,
        640 - index * 22,
        index === 0 || index === table.length - 1,
      ),
    );
  });
  tablePage.lines.push({
    text: "West is the only region that shrank; see section 3 for the late delivery issue.",
    x: 72,
    y: 480,
    size: 11,
  });
  return pdf("Northwind Supplies - Annual Report 2025", [
    flow([
      { text: "Northwind Supplies", size: 24, bold: true },
      { text: "Annual Report 2025", size: 18 },
      gap(20),
      heading("1. Summary"),
      para("Revenue grew 5.9% to EUR 3,938,550 across four regions."),
      para("East was the fastest-growing region at 11.4%."),
      para(
        "The number of orders rose to 11,245, and the average order value was EUR 350.",
      ),
      para("Two warehouses were consolidated into one in Rotterdam in March."),
    ]),
    tablePage,
    flow([
      heading("3. Risks"),
      para("Late delivery remains the largest operational risk."),
      para(
        "In the West region, 14% of orders arrived after the promised date.",
      ),
      para("A late delivery triggers a 5% credit under the standard contract."),
      para("Supplier concentration: two suppliers provide 61% of all stock."),
      para("Currency: 18% of purchasing is paid in US dollars."),
    ]),
    flow([
      heading("4. Outlook"),
      para("For 2026 we expect revenue growth between 4% and 6%."),
      para(
        "A second carrier for the West region starts in April to reduce late delivery.",
      ),
      para(
        "Capital expenditure is planned at EUR 240,000, mostly for the Rotterdam site.",
      ),
    ]),
  ]);
}

function scannedPage() {
  const width = 1275;
  const height = 1650;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f4f2ec";
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-0.006);
  ctx.translate(-width / 2, -height / 2);
  ctx.fillStyle = "#1c1c1c";
  const text = [
    ["bold 44px sans-serif", "Schedule B - Payment terms"],
    ["", ""],
    ["30px sans-serif", "Contract value: EUR 48,000"],
    ["30px sans-serif", "Payment: 12 monthly instalments of EUR 4,000"],
    ["30px sans-serif", "Due date: the 15th day of each month"],
    ["30px sans-serif", "Late payment interest: 1.5% per month"],
    ["", ""],
    ["30px sans-serif", "Signed for Northwind Supplies: Ada Lovelace"],
    ["30px sans-serif", "Signed for Harbor Retail: Emre Kaya"],
    ["30px sans-serif", "Date: 12 January 2026"],
  ];
  let y = 200;
  for (const [font, line] of text) {
    if (font !== "") {
      ctx.font = font;
      ctx.fillText(line, 150, y);
    }
    y += 70;
  }
  ctx.strokeStyle = "#1c1c1c";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(150, y + 40);
  ctx.bezierCurveTo(260, y - 30, 330, y + 90, 460, y + 20);
  ctx.stroke();
  ctx.restore();
  return { jpeg: canvas.encodeSync("jpeg", 82), width, height };
}

function contract() {
  return pdf("Supply agreement - Northwind Supplies and Harbor Retail", [
    flow([
      { text: "Supply agreement", size: 22, bold: true },
      para("Between Northwind Supplies B.V. and Harbor Retail Ltd."),
      gap(16),
      heading("1. Scope"),
      para(
        "Northwind Supplies delivers office furniture to Harbor Retail's stores.",
      ),
      para("Each order is confirmed in writing within two working days."),
      heading("2. Delivery"),
      para("Goods are delivered within ten working days of confirmation."),
      para("A late delivery gives Harbor Retail a 5% credit on that order."),
      heading("3. Term"),
      para("The agreement runs for twelve months from 1 February 2026."),
      para("Payment terms are set out in Schedule B."),
    ]),
    scannedPage(),
    flow([
      heading("Schedule C - Contacts"),
      para("Orders: orders@northwind.example"),
      para("Invoices: billing@harbor.example"),
      para("Escalation: the account manager named in the order confirmation."),
    ]),
  ]);
}

mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "annual-report.pdf"), annualReport());
writeFileSync(path.join(out, "supply-agreement.pdf"), contract());
