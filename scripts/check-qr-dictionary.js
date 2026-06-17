import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { QR_ZSTD_TRAINING_SOURCE_PATHS } from "../vendor/qr-zstd-dictionary.js";

const root = resolve(process.cwd());
const manifestPath = resolve(root, "medical-knowledge", "manifest.json");

async function main() {
  const manifestRaw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);
  const currentPaths = (manifest.complaint_modules || [])
    .map((p) => p.replace(/\\/g, "/"));

  const trainedPaths = new Set(QR_ZSTD_TRAINING_SOURCE_PATHS || []);
  const currentSet = new Set(currentPaths);

  const newWorkups = currentPaths.filter((p) => !trainedPaths.has(p));
  const removedWorkups = (QR_ZSTD_TRAINING_SOURCE_PATHS || []).filter((p) => !currentSet.has(p));

  if (newWorkups.length > 0 || removedWorkups.length > 0) {
    console.log("QR Dictionary Status: STALE");
    if (newWorkups.length > 0) {
      console.log("\nNew workups not yet trained:");
      newWorkups.forEach((p) => console.log(`  + ${p}`));
    }
    if (removedWorkups.length > 0) {
      console.log("\nTrained workups no longer in library:");
      removedWorkups.forEach((p) => console.log(`  - ${p}`));
    }
    console.log("\nAction required: Run 'npm run build:qr-dictionary' to rebuild the compression dictionary.");
    process.exitCode = 1;
  } else {
    console.log("QR Dictionary Status: UP TO DATE");
    console.log(`All ${currentPaths.length} workups in the library are trained in the current compression dictionary.`);
  }
}

main().catch(console.error);
