import assert from "node:assert/strict";
import { workupWorkspaceFilename, workupWorkspaceMirrorPlan, WORKUP_WORKSPACE_DIRECTORY, WORKUP_WORKSPACE_MANIFEST } from "../src/workups/workspace-mirror-plan.js";
import { writeWorkupWorkspaceMirror } from "../src/app/state/workspace-mirror.js";

const workup = {
  schema: "prerounding_workup_v1",
  id: "acute-dyspnea",
  title: "Acute dyspnea",
  aliases: ["shortness of breath"],
  items: [
    { id: "history-01", kind: "history", system: "respiratory", text: "New dyspnea?", choices: ["No", "Yes"], select: "one" },
    { id: "exam-01", kind: "exam", system: "respiratory", text: "Work of breathing", choices: ["Normal", "Increased"], select: "one" }
  ]
};

const plan = workupWorkspaceMirrorPlan({ [workup.id]: workup });
assert.deepEqual(plan.directory, WORKUP_WORKSPACE_DIRECTORY);
assert.equal(workupWorkspaceFilename(workup), "acute-dyspnea.workup.json");
assert.equal(plan.files.at(-1).name, WORKUP_WORKSPACE_MANIFEST);
assert.match(plan.files[0].contents, /Acute dyspnea/);
assert.doesNotMatch(plan.files.at(-1).contents, /dyspnea\?/i);

function directory(name = "root") {
  const directories = new Map();
  const files = new Map();
  return {
    name,
    directories,
    files,
    async getDirectoryHandle(child, { create } = {}) {
      if (!directories.has(child) && create) directories.set(child, directory(child));
      return directories.get(child);
    },
    async getFileHandle(file, { create } = {}) {
      if (!files.has(file) && create) files.set(file, { async createWritable() {
        let contents = "";
        return { async write(value) { contents = String(value); }, async close() { files.set(file, { contents }); } };
      } });
      return files.get(file);
    }
  };
}

const root = directory();
const result = await writeWorkupWorkspaceMirror(root, plan);
assert.equal(result.workups, 1);
assert.equal(result.path, "workups/local");
const target = root.directories.get("workups").directories.get("local");
assert.match(target.files.get("acute-dyspnea.workup.json").contents, /acute-dyspnea/);
assert.match(target.files.get(WORKUP_WORKSPACE_MANIFEST).contents, /workspace_mirror_v1/);

console.log("workspace workup mirror tests passed");
