#!/usr/bin/env node
// Regenerates docs/index-html-css-region-map.md: a coarse table of contents
// for styles.css, grouped by selector prefix runs.
// Run after editing styles.css: node scripts/gen-index-html-css-region-map.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const cssPath = path.join(repoRoot, "styles.css");
const outPath = path.join(repoRoot, "docs", "index-html-css-region-map.md");

const css = fs.readFileSync(cssPath, "utf8");
const lines = css.split("\n");

const reTopLevelRule = /^    ([^\s{][^{]*)\{\s*$/;
const selectors = [];
for (let i = 0; i < lines.length; i++) {
  const m = reTopLevelRule.exec(lines[i]);
  if (m) selectors.push({ line: i + 1, sel: m[1].trim() });
}

function prefixOf(sel) {
  const first = sel.split(/[ ,>]/)[0];
  let m = /^\.([a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)?)/.exec(first);
  if (m) return m[1];
  m = /^\[data-view="([a-zA-Z0-9]+)/.exec(first);
  if (m) return m[1];
  if (first.startsWith("#")) return first.slice(1);
  if (first.startsWith(":root")) return ":root-vars";
  if (first.startsWith("@media")) return "@media";
  if (first.startsWith("body")) return "body";
  return first.slice(0, 20);
}

const regions = [];
let cur = null;
for (const s of selectors) {
  const p = prefixOf(s.sel);
  if (cur && cur.prefix === p) {
    cur.end = s.line;
    cur.count++;
  } else {
    if (cur) regions.push(cur);
    cur = { prefix: p, start: s.line, end: s.line, count: 1 };
  }
}
if (cur) regions.push(cur);

const rows = regions
  .filter((r) => r.count >= 3)
  .map((r) => `${r.start}-${r.end}\t${r.prefix}\t${r.count} rules`)
  .join("\n");

const header = `# styles.css Region Map

Coarse table of contents for \`styles.css\` (${lines.length} lines), grouped by selector prefix runs. CSS rules here are mostly written in feature-contiguous chunks, so a selector-prefix range is a reasonable place to start reading, not just a single line.

Regenerate with: \`node scripts/gen-index-html-css-region-map.js\` after CSS edits.

Columns: line range in styles.css, dominant class/id/media prefix in that range, number of top-level rules matched.

\`\`\`
`;

const output = header + rows + "\n```\n";

if (process.argv.includes("--check")) {
  const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : "";
  if (current !== output) {
    throw new Error(`${path.relative(repoRoot, outPath)} is out of date. Run npm run build:index-html-css-map.`);
  }
  console.log(`${path.relative(repoRoot, outPath)} is current.`);
} else {
  fs.writeFileSync(outPath, output);
  console.log(`Wrote ${regions.length} regions to ${path.relative(repoRoot, outPath)}`);
}
