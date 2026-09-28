import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const contentDir = path.resolve(here, "../src/content");
const samplesDir = path.resolve(here, "../public/samples");
const write = process.argv.includes("--write");
const only = process.argv.filter((arg) => arg.endsWith(".md"));

const products = {
  "excel-mcp": {
    bins: { "liaiso-excel": "packages/servers/excel-mcp/dist/cli.js" },
    folder: "liaiso-sheets",
    samples: {
      default: ["sales.xlsx", "report.xlsx"],
      "tutorial/01-reading-your-first-workbook.md": ["sales.xlsx"],
    },
    preamble: `excel() {
  npx -y @modelcontextprotocol/inspector --cli liaiso-excel ~/liaiso-sheets \\
    --method tools/call --tool-name "$@" | jq '.content[0].text | fromjson'
}`,
  },
};

const skipped = [/^npm install -g /, /^claude mcp add /, /^npx -y @liaiso\//];
const helper = /^[a-z]+\(\) \{/;
const volatile = [/"modifiedAt": "[^"]+"/g, /"nextCursor": "[^"]+"/g];
const mask = (text) =>
  volatile.reduce(
    (out, pattern) => out.replace(pattern, (m) => m.split(":")[0]),
    text,
  );

function blocksOf(markdown) {
  const blocks = [];
  const fence = /^```(\w*)\n([\s\S]*?)^```$/gm;
  let match;
  while ((match = fence.exec(markdown))) {
    blocks.push({
      lang: match[1],
      body: match[2],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return blocks;
}

function pagesOf(product) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".md")) out.push(full);
    }
  };
  walk(path.join(contentDir, product));
  return out.filter(
    (file) =>
      !file.includes(`${path.sep}reference${path.sep}`) &&
      (only.length === 0 || only.some((wanted) => file.endsWith(wanted))),
  );
}

/**
 * Guard: every page runs in a fresh HOME so `~/<folder>` in a command is a sandbox, never the
 * reader's or the author's home, while npm keeps the real cache so `npx` does not re-download.
 */
function sandbox(product, config, file) {
  const home = mkdtempSync(path.join(tmpdir(), `liaiso-examples-${product}-`));
  const bin = path.join(home, ".bin");
  mkdirSync(bin);
  for (const [name, entry] of Object.entries(config.bins)) {
    const shim = path.join(bin, name);
    writeFileSync(
      shim,
      `#!/bin/sh\nexec "${process.execPath}" "${path.join(repo, entry)}" "$@"\n`,
    );
    chmodSync(shim, 0o755);
  }
  const folder = path.join(home, config.folder);
  mkdirSync(folder);
  const page = path.relative(path.join(contentDir, product), file);
  for (const sample of config.samples[page] ?? config.samples.default) {
    cpSync(path.join(samplesDir, product, sample), path.join(folder, sample));
  }
  return { home, bin };
}

function run(product, config, file) {
  const markdown = readFileSync(file, "utf8");
  const blocks = blocksOf(markdown);
  const pairs = [];
  for (const [i, block] of blocks.entries()) {
    if (block.lang !== "sh") continue;
    const body = block.body.trim();
    if (helper.test(body)) {
      if (body !== config.preamble) {
        drift.push(
          `${path.relative(repo, file)}: its shell helper differs from the preamble`,
        );
      }
      continue;
    }
    if (skipped.some((pattern) => pattern.test(body))) continue;
    const next = blocks[i + 1];
    const between = next ? markdown.slice(block.end, next.start).trim() : "x";
    pairs.push({
      command: block,
      output: next && between === "" && next.lang !== "sh" ? next : undefined,
    });
  }
  if (pairs.length === 0) return { file, failures: [], markdown };
  const { home, bin } = sandbox(product, config, file);
  const marker = "__LIAISO_EXAMPLE_END__";
  const script = [
    "set -o pipefail",
    `cd "$HOME"`,
    config.preamble,
    ...pairs.map((pair) => `{\n${pair.command.body}} 2>&1\necho "${marker}"`),
  ].join("\n");
  const result = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      PATH: `${bin}:${process.env.PATH}`,
      npm_config_cache: path.join(homedir(), ".npm"),
      npm_config_update_notifier: "false",
    },
    timeout: 600_000,
  });
  rmSync(home, { recursive: true, force: true });
  const outputs = result.stdout.split(`${marker}\n`);
  const failures = [];
  let rewritten = markdown;
  for (const [i, pair] of [...pairs.entries()].reverse()) {
    if (!pair.output) continue;
    const actual = outputs[i] ?? "";
    if (mask(actual) === mask(pair.output.body)) continue;
    failures.push({
      command: pair.command.body.trim(),
      actual,
      expected: pair.output.body,
    });
    rewritten =
      rewritten.slice(0, pair.output.start) +
      `\`\`\`${pair.output.lang}\n${actual}\`\`\`` +
      rewritten.slice(pair.output.end);
  }
  return { file, failures: failures.reverse(), markdown: rewritten };
}

let failed = 0;
const drift = [];
for (const [product, config] of Object.entries(products)) {
  for (const file of pagesOf(product)) {
    const outcome = run(product, config, file);
    const name = path.relative(repo, file);
    if (outcome.failures.length === 0) {
      process.stdout.write(`ok    ${name}\n`);
      continue;
    }
    if (write) {
      writeFileSync(file, outcome.markdown);
      process.stdout.write(
        `wrote ${name} (${outcome.failures.length} outputs)\n`,
      );
      continue;
    }
    failed += outcome.failures.length;
    for (const failure of outcome.failures) {
      process.stdout.write(
        `FAIL  ${name}\n  $ ${failure.command.split("\n")[0]}\n--- expected\n${failure.expected}--- actual\n${failure.actual}`,
      );
    }
  }
}
for (const line of drift) process.stdout.write(`FAIL  ${line}\n`);
process.exit(failed > 0 || drift.length > 0 ? 1 : 0);
