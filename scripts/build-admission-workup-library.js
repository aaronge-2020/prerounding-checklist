import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createWorkupLibrary } from "../src/workups/library.js";
import { parseWorkupJson } from "../src/workups/schema.js";

const sourceDirectory = resolve("workups", "admission");
const libraryDirectory = resolve("workups", "libraries");
const sourceFilenames = (await readdir(sourceDirectory)).filter((filename) => filename.endsWith(".workup.json")).sort();
const readWorkup = async (filename) => parseWorkupJson(await readFile(resolve(sourceDirectory, filename), "utf8"));
const workups = await Promise.all(sourceFilenames.map(readWorkup));
const library = createWorkupLibrary({
  id: "admission-50-core",
  title: "Admission Workups: Core 50",
  version: "1.0.0",
  description: "A portable library assembled from the 50 modular admission workup files.",
  workups
});
const index = workups.map((workup, index) => ({ rank: index + 1, id: workup.id, title: workup.title, filename: sourceFilenames[index] }));

await mkdir(libraryDirectory, { recursive: true });
await Promise.all([
  writeFile(resolve(sourceDirectory, "index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8"),
  writeFile(resolve(libraryDirectory, "admission-50-core.workup-library.json"), `${JSON.stringify(library, null, 2)}\n`, "utf8")
]);
console.log(`Built portable library from ${workups.length} modular workup files.`);
