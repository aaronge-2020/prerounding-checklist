/**
 * Regression tests: ChatGPT custom instructions.
 *
 * Two reports from Aaron:
 *  1. The custom instructions went through redaction review on EVERY send —
 *     the same false-positive suggestions ("Aaron Ge" -> [PROVIDER NAME],
 *     "Preround" -> [ORGANIZATION]) had to be re-decided each time.
 *     Fix: the student's accept/reject decisions are persisted per content
 *     hash (localStorage) and re-applied to the fresh model output, so
 *     unchanged instructions skip the review modal.
 *  2. The custom instructions sent to ChatGPT were byte-identical to the
 *     on-device ones — literally telling GPT "you run ENTIRELY on-device...
 *     no data ever leaves this browser". Fix: separate ChatGPT custom
 *     instructions with a truthful default; the on-device identity claims
 *     are never sent to OpenAI.
 *
 * All fixtures are synthetic and PHI-free. No browser needed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Part 1: the ChatGPT instructions are separate and truthful
// ---------------------------------------------------------------------------

const { DEFAULT_REMOTE_SYSTEM_GUIDELINES, DEFAULT_SYSTEM_GUIDELINES } = await import(
  "../src/local-llm/system-prompt.js"
);

test("the ChatGPT default instructions never claim on-device execution", () => {
  assert.ok(
    typeof DEFAULT_REMOTE_SYSTEM_GUIDELINES === "string" && DEFAULT_REMOTE_SYSTEM_GUIDELINES.length > 0,
    "DEFAULT_REMOTE_SYSTEM_GUIDELINES must exist"
  );
  for (const claim of ["on-device", "no data ever leaves", "Never claim to run on a cloud"]) {
    assert.ok(
      !DEFAULT_REMOTE_SYSTEM_GUIDELINES.includes(claim),
      `ChatGPT instructions must not contain the on-device claim: "${claim}"`
    );
  }
  assert.ok(
    /ChatGPT/.test(DEFAULT_REMOTE_SYSTEM_GUIDELINES),
    "the ChatGPT instructions should identify the model truthfully"
  );
});

test("the on-device default still claims on-device execution", () => {
  assert.ok(
    DEFAULT_SYSTEM_GUIDELINES.includes("ENTIRELY on-device"),
    "the local default must keep grounding the local model in reality"
  );
});

test("settings storage carries the separate ChatGPT instructions field", () => {
  const clientSrc = readFileSync(join(repoRoot, "src/local-llm/client.js"), "utf8");
  assert.match(
    clientSrc,
    /systemGuidelinesRemote/,
    "readLocalLlmSettings must expose systemGuidelinesRemote"
  );
});

test("sidebar edits the two instruction sets separately", () => {
  const presentationSrc = readFileSync(join(repoRoot, "src/ui/ai-chat/presentation.js"), "utf8");
  assert.match(presentationSrc, /data-ai-chat-guidelines-remote/, "sidebar must render the ChatGPT textarea");
  assert.match(presentationSrc, /data-ai-chat-guidelines(?!-remote)/, "sidebar must keep the on-device textarea");
  const controllerSrc = readFileSync(join(repoRoot, "src/ui/ai-chat/controller.js"), "utf8");
  assert.match(
    controllerSrc,
    /data-ai-chat-guidelines-remote[\s\S]*?systemGuidelinesRemote/,
    "the controller must persist the ChatGPT textarea to systemGuidelinesRemote"
  );
});

test("the review gate de-identifies the ChatGPT instructions, not the on-device ones", () => {
  const controllerSrc = readFileSync(join(repoRoot, "src/ui/ai-chat/controller.js"), "utf8");
  const gateStart = controllerSrc.indexOf('title: "Custom instructions (ChatGPT)"');
  assert.ok(gateStart > 0, "the review piece must be titled 'Custom instructions (ChatGPT)'");
  const gateSlice = controllerSrc.slice(gateStart, gateStart + 400);
  assert.match(
    gateSlice,
    /effectiveRemoteGuidelinesText\(settings\(\)\)/,
    "the review gate must de-identify the ChatGPT instructions"
  );
});

// ---------------------------------------------------------------------------
// Part 2: review decisions for the instructions are remembered
// ---------------------------------------------------------------------------

// Stub localStorage before importing the module under test.
const persistedStore = {};
globalThis.localStorage = {
  getItem: (key) => (key in persistedStore ? persistedStore[key] : null),
  setItem: (key, value) => {
    persistedStore[key] = String(value);
  },
  removeItem: (key) => {
    delete persistedStore[key];
  }
};

const {
  effectiveRemoteGuidelinesText,
  hashPiece,
  guidelineDecisionKey,
  applyGuidelineDecisions,
  pieceHasNoPendingRecords,
  persistGuidelineDecisions
} = await import("../src/ui/ai-chat/delta-review.js");

test("effectiveRemoteGuidelinesText falls back to the truthful default", () => {
  assert.equal(effectiveRemoteGuidelinesText({}), DEFAULT_REMOTE_SYSTEM_GUIDELINES);
  assert.equal(effectiveRemoteGuidelinesText({ systemGuidelinesRemote: "  " }), DEFAULT_REMOTE_SYSTEM_GUIDELINES);
  assert.equal(effectiveRemoteGuidelinesText({ systemGuidelinesRemote: "Be terse." }), "Be terse.");
  // The on-device field must not leak into the remote instructions.
  assert.equal(
    effectiveRemoteGuidelinesText({ systemGuidelines: "You run ENTIRELY on-device." }),
    DEFAULT_REMOTE_SYSTEM_GUIDELINES
  );
});

function makeGuidelinesPiece() {
  return {
    id: "guidelines",
    rawText: "You are ChatGPT, assisting Aaron Ge inside Preround.",
    modelRecords: [
      { start: 32, end: 40, label: "PROVIDER NAME", originalText: "Aaron Ge", status: "pending" },
      { start: 49, end: 57, label: "ORGANIZATION", originalText: "Preround", status: "pending" }
    ],
    manualRecords: []
  };
}

test("decisions persist per content hash and are re-applied to a fresh run", () => {
  const piece = makeGuidelinesPiece();
  const hash = hashPiece(piece.rawText);
  // The student rejects both false positives.
  piece.modelRecords.forEach((record) => {
    record.status = "rejected";
  });
  assert.ok(pieceHasNoPendingRecords(piece));
  assert.ok(persistGuidelineDecisions(hash, piece), "fully-decided pieces must persist");

  // A later send re-runs the model fresh; the stored decisions apply.
  const fresh = makeGuidelinesPiece();
  const applied = applyGuidelineDecisions(fresh, hash);
  assert.equal(applied, 2);
  assert.ok(fresh.modelRecords.every((record) => record.status === "rejected"));
  assert.ok(pieceHasNoPendingRecords(fresh), "re-applied decisions leave nothing pending");
});

test("partial reviews are never treated as done", () => {
  const piece = makeGuidelinesPiece();
  const hash = hashPiece(piece.rawText);
  piece.modelRecords[0].status = "accepted"; // one decided, one still pending
  assert.ok(!pieceHasNoPendingRecords(piece));
  assert.ok(!persistGuidelineDecisions(hash, piece), "partial reviews must not persist");
});

test("changed instructions get a fresh review", () => {
  const piece = makeGuidelinesPiece();
  piece.modelRecords.forEach((record) => {
    record.status = "rejected";
  });
  persistGuidelineDecisions(hashPiece(piece.rawText), piece);
  // The student edits the instructions -> different hash -> no stored decisions.
  const edited = makeGuidelinesPiece();
  edited.rawText += " Be concise.";
  const applied = applyGuidelineDecisions(edited, hashPiece(edited.rawText));
  assert.equal(applied, 0);
  assert.ok(!pieceHasNoPendingRecords(edited), "edited instructions need human eyes again");
});

test("a new suggestion from a model update surfaces as pending", () => {
  const piece = makeGuidelinesPiece();
  piece.modelRecords.forEach((record) => {
    record.status = "rejected";
  });
  const hash = hashPiece(piece.rawText);
  persistGuidelineDecisions(hash, piece);
  // A model update finds one more span the old run did not.
  const fresh = makeGuidelinesPiece();
  fresh.modelRecords.push({ start: 0, end: 8, label: "NAME", originalText: "You are", status: "pending" });
  const applied = applyGuidelineDecisions(fresh, hash);
  assert.equal(applied, 2, "the two known suggestions are auto-decided");
  assert.ok(!pieceHasNoPendingRecords(fresh), "the genuinely new suggestion stays pending");
});

test("guidelineDecisionKey is stable for identical spans", () => {
  const record = { start: 32, end: 40, label: "PROVIDER NAME", originalText: "Aaron Ge" };
  assert.equal(guidelineDecisionKey(record), guidelineDecisionKey({ ...record }));
  assert.notEqual(
    guidelineDecisionKey(record),
    guidelineDecisionKey({ ...record, start: 33 }),
    "different spans must not share a decision"
  );
});
