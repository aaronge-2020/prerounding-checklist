import { readFile, writeFile } from "node:fs/promises";

const library = JSON.parse(await readFile("workups/libraries/admission-50-core.workup-library.json", "utf8"));
const output = `// Generated from workups/libraries/admission-50-core.workup-library.json.\n// Run: node scripts/build-admission-workup-module.js\nexport const CORE_ADMISSION_WORKUPS = ${JSON.stringify(library.workups, null, 2)};\n`;
await writeFile("src/workups/admission-core.js", output, "utf8");
console.log(`Wrote ${library.workups.length} bundled Core admission workups.`);
