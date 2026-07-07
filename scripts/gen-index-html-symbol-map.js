#!/usr/bin/env node
// Regenerates docs/index-html-js-symbol-map.md: a name -> line -> feature-area
// lookup table for the large inline `<script type="module">` block in index.html.
// Run after editing that block: node scripts/gen-index-html-symbol-map.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const indexPath = path.join(repoRoot, "index.html");
const outPath = path.join(repoRoot, "docs", "index-html-js-symbol-map.md");

const html = fs.readFileSync(indexPath, "utf8");
const lines = html.split("\n");

const moduleStart = lines.findIndex((l) => l.includes('<script type="module">'));
const moduleEnd = lines.findIndex((l, i) => i > moduleStart && l.trim() === "</script>");
if (moduleStart === -1 || moduleEnd === -1) {
  throw new Error("Could not locate the inline module script block in index.html");
}

const reFunc = /^    (async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/;
const reConstAsyncFn = /^    const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*async function/;
const reConstFn = /^    const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(async\s*)?\(?.*=>/;
const reClass = /^    class\s+([A-Za-z_$][A-Za-z0-9_$]*)/;

const symbols = [];
for (let i = moduleStart; i <= moduleEnd; i++) {
  const line = lines[i];
  let m;
  if ((m = reFunc.exec(line))) symbols.push({ line: i + 1, name: m[2] });
  else if ((m = reClass.exec(line))) symbols.push({ line: i + 1, name: m[1] });
  else if ((m = reConstAsyncFn.exec(line))) symbols.push({ line: i + 1, name: m[1] });
  else if ((m = reConstFn.exec(line))) symbols.push({ line: i + 1, name: m[1] });
}

const buckets = [
  ["Workup Studio & Contribution", ["workupstudio", "workupauthoring", "workupsection", "workupreview", "workupchangeset", "workupdraft", "studio", "contribution", "github", "workup"]],
  ["Evidence & Physical Exam", ["evidence", "physicalexam", "bedside", "redflag", "exam"]],
  ["De-identification & Vault", ["deid", "vault", "encrypt", "decrypt"]],
  ["Checklist / Complaint CDS / Clinical Intent", ["checklist", "complaintcds", "clinicalintent", "intent", "catalog", "module"]],
  ["Continuity", ["continuity"]],
  ["Lab Timeline", ["lab"]],
  ["QR / Phone Handoff", ["qr", "phone", "deeplink", "clipboard"]],
  ["OpenEvidence Workflows", ["openevidence"]],
  ["Supabase & Auth", ["supabase", "auth", "session"]],
  ["Clinical Pathway Graph", ["pathway", "graph", "cytoscape"]],
  ["Service Preferences & Picker", ["servicepreference", "servicepicker", "serviceprofile", "servicefield", "serviceuser"]],
  ["Patient Roster / Admission", ["patient", "admission", "roster"]],
  ["Layout & Navigation Chrome", ["layout", "nav"]],
  ["Notes / H&P / Discharge", ["note", "discharge", "soap", " hp", "presentation"]],
  ["Generic Utilities", ["search", "filter", "sort", "validate", "parse", "format", "trend", "print"]],
];

function assignBucket(name) {
  const n = name.toLowerCase();
  for (const [bucket, keywords] of buckets) {
    for (const kw of keywords) {
      if (n.includes(kw)) return bucket;
    }
  }
  return "General/App State";
}

const withBucket = symbols.map((s) => ({ ...s, bucket: assignBucket(s.name) }));
withBucket.sort((a, b) => a.name.localeCompare(b.name));

const header = `# index.html Inline Script Symbol Map

Generated lookup table, not narrative docs. Regenerate after edits to the inline \`<script type="module">\` block (currently \`index.html:${moduleStart + 1}-${moduleEnd + 1}\`) with:

\`\`\`
node scripts/gen-index-html-symbol-map.js
\`\`\`

## How to use this

1. Grep this file for the function/const name you need (\`grep "functionName" docs/index-html-js-symbol-map.md\`).
2. Read the \`Line\` column, then \`Read index.html\` with an offset near that line (e.g. offset = line - 5, limit = 80) instead of scanning the whole file.
3. Do **not** assume functions in the same feature area sit near each other in the file. They mostly don't — the inline script grew by appending new code near where it was easiest to paste, not by feature. The line range in AGENTS.md's feature-area summary table is the min/max span of matching functions, not a contiguous block. This table's per-function \`Line\` value is the only reliable coordinate.
4. "Feature area" is a heuristic tag assigned by name-keyword matching, not a verified functional grouping. Treat it as a hint, not ground truth.

Covers ${withBucket.length} top-level function/class/const-fn declarations found in the inline module script. Plain data constants (config objects/lists) are not included.

| Function | Line | Feature area |
|---|---|---|
`;

const rows = withBucket.map((s) => `| ${s.name} | ${s.line} | ${s.bucket} |`).join("\n");

fs.writeFileSync(outPath, header + rows + "\n");
console.log(`Wrote ${withBucket.length} symbols to ${path.relative(repoRoot, outPath)}`);
