// Builds src/data/sample-notes.data.js from src/data/sample-notes.json.
//
// The app imports the generated JS module instead of the raw JSON so the
// fixture data loads through plain script-module semantics on every
// browser the static site supports (JSON import attributes are not
// universal on older mobile browsers). The JSON stays the source of truth;
// tests/test-sample-notes-data.js fails if the generated module drifts.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = join(root, "src", "data", "sample-notes.json");
const outPath = join(root, "src", "data", "sample-notes.data.js");

const data = JSON.parse(readFileSync(jsonPath, "utf8"));
const body = `// GENERATED from src/data/sample-notes.json by scripts/build-sample-notes-data-module.js.
// Do not hand-edit: regenerate with \`npm run build:sample-notes-data\`.
export const SAMPLE_NOTES_DATA = ${JSON.stringify(data)};
`;
writeFileSync(outPath, body);
console.log(`Wrote ${outPath} (${body.length} bytes)`);
