import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createWorkupLibrary, mergeWorkupLibraryIntoOverrides, parseWorkupLibraryJson } from "../src/workups/library.js";
import { normalizeWorkup, parseWorkupJson } from "../src/workups/schema.js";
import { isWorkupSystem } from "../src/workups/systems.js";

const directory = resolve("workups", "admission");
const files = (await readdir(directory)).filter((file) => file.endsWith(".workup.json")).sort();
const manifest = JSON.parse(await readFile(resolve(directory, "index.json"), "utf8"));
const workups = await Promise.all(files.map(async (file) => parseWorkupJson(await readFile(resolve(directory, file), "utf8"))));
const bundledLibrary = parseWorkupLibraryJson(await readFile(resolve("workups", "libraries", "admission-50-core.workup-library.json"), "utf8"));

assert.equal(files.length, 50);
assert.equal(new Set(workups.map((workup) => workup.id)).size, 50);
assert.deepEqual(manifest.map((entry) => entry.filename), files);
assert.deepEqual(bundledLibrary.workups, workups);

for (const workup of workups) {
  const historyCount = workup.items.filter((item) => item.kind === "history").length;
  const examCount = workup.items.filter((item) => item.kind === "exam").length;
  assert.ok(historyCount >= 8, `${workup.id} needs at least 8 history items, has ${historyCount}`);
  assert.ok(examCount >= 8, `${workup.id} needs at least 8 exam items, has ${examCount}`);
  assert.equal(workup.items.every((item) => item.choices[0] !== "Unclear" && item.choices[0] !== "Not assessed"), true);
  assert.equal(workup.items.every((item) => isWorkupSystem(item.system)), true);
  assert.deepEqual(normalizeWorkup(workup), workup);
}

const portableLibrary = createWorkupLibrary({ id: "test-library", title: "Test library", workups: workups.slice(0, 2) });
assert.deepEqual(Object.keys(mergeWorkupLibraryIntoOverrides({ existing: workups[2] }, portableLibrary)).sort(), ["existing", ...portableLibrary.workups.map((workup) => workup.id)].sort());
assert.throws(
  () => parseWorkupLibraryJson(JSON.stringify({ ...portableLibrary, workups: [workups[0], workups[0]] })),
  /workup ids must be unique/
);

console.log("50 modular admission workups and their portable library bundle are valid and synchronized.");
