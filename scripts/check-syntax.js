import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const files = [
  "checklist.js",
  "clinical-intents.js",
  "complaint-cds.js",
  "continuity.js",
  "deid.js",
  "deid-worker.js",
  "embedding-recall.js",
  "evidence.js",
  "labs.js",
  "medical-knowledge-db.js",
  "open-evidence-results.js",
  "open-evidence-workflows.js",
  "workup-authoring.js",
  "utils/supabase/env.js",
  "utils/supabase/node.js",
  "scripts/deid-fixtures.js",
  "scripts/build-medical-knowledge-db.js",
  "scripts/import-medical-knowledge.js",
  "scripts/export-medical-knowledge.js",
  "scripts/grant-workup-access.js",
  "scripts/deploy-supabase-workup-authoring.js",
  "scripts/check-supabase-auth-readiness.js",
  "scripts/build-physical-exam-evidence.js",
  "scripts/audit-evidence-checklist.js",
  "scripts/evidence-eval.js",
  "scripts/iterate-clinical-workups.js",
  "scripts/generate-clinical-pathway-trees.js",
  "scripts/hand-polish-clinical-pathway-trees.js",
  "scripts/audit-clinical-pathway-trees.js",
  "scripts/audit-clinical-cutoff-gaps.js",
  "scripts/generate-endocrine-workups.js",
  "scripts/install-endocrine-workups.js",
  "scripts/test-endocrine-knowledge.js",
  "scripts/benchmark-embedding-models.js",
  "scripts/test-complaint-cds.js",
  "scripts/test-medical-knowledge-db.js",
  "scripts/test-workup-authoring.js",
  "scripts/test-workup-studio-auth.js",
  "scripts/test-workup-studio-ui.js",
  "scripts/test-supabase-config.js",
  "scripts/test-clinical-intents.js",
  "scripts/test-open-evidence-workflows.js",
  "scripts/test-embedding-recall.js",
  "scripts/test-evidence-adversarial.js",
  "scripts/test-evidence-eval.js",
  "scripts/test-evidence.js",
  "scripts/test-labs.js",
  "scripts/test-checklist.js",
  "scripts/test-deid.js",
  "scripts/benchmark-deid.js",
  "scripts/check-syntax.js",
  "scripts/test-clinical-ui-browser.js",
  "scripts/test-desktop-responsive-ui.js",
  "scripts/test-vault-state-machine.js"
];

function runNodeCheck(file) {
  if (!existsSync(file)) return;
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`Syntax check failed for ${file}`);
  }
}

for (const file of files) {
  runNodeCheck(file);
}

const html = readFileSync("index.html", "utf8");

if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html)) {
  throw new Error("Do not load third-party Google Fonts in the clinical app shell.");
}
if (/\bHIPAA compliant\b/i.test(html)) {
  throw new Error("Avoid HIPAA compliant phrasing; describe safeguards and limitations instead.");
}
const removedRosterDashboardPattern = new RegExp([
  ["local cen", "sus"].join(""),
  ["cen", "susView"].join(""),
  ["openCen", "susButton"].join(""),
  ["addCen", "susCaseButton"].join(""),
  ["cen", "susRows"].join(""),
  ['data-view-target="', "cen", 'sus"'].join("")
].join("|"), "i");
if (removedRosterDashboardPattern.test(html)) {
  throw new Error("The redundant local roster dashboard interface must not be present in index.html.");
}
if (/localStorage\.setItem\(\s*LEGACY_STORAGE_KEY/.test(html)) {
  throw new Error("Legacy plaintext state key must never be written.");
}

const cspMatch = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
if (!cspMatch) {
  throw new Error("index.html must define a Content Security Policy.");
}
const csp = cspMatch[1];
for (const requiredDirective of [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "worker-src 'self'",
  "connect-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'"
]) {
  if (!csp.includes(requiredDirective)) {
    throw new Error(`Content Security Policy missing required directive: ${requiredDirective}`);
  }
}
if (csp.includes("frame-ancestors")) {
  throw new Error("HTML meta CSP must not include frame-ancestors; browsers ignore it there.");
}

for (const requiredSnippet of [
  '<meta name="theme-color" content="#f4f7f7">',
  "color-scheme: light;",
  "--bg: #f4f7f7;",
  "Pre-Rounding Checklist Builder",
  "Local-first",
  "All data stays on this device",
  "No analytics, telemetry, tracking pixels, or ad scripts",
  "No cloud upload by default",
  "not HIPAA certification",
  "does not legally certify HIPAA de-identification",
  "not a HIPAA certification service",
  "No app-server upload by default",
  "Raw chart text is not saved to the vault",
  "Patients in the open local vault",
  "Open local patient vault",
  "Create new vault",
  "Start single patient",
  "VAULT_DATA_KEY",
  "encryptVaultPayload",
  "Start one temporary workflow. Reloading or locking clears this session.",
  "Copy after PHI review",
  "PHI safety check for OpenEvidence prompt",
  "PHI safety check for reviewed redacted text",
  "Standalone local de-ID",
  "Use this for quick local redaction only. It does not save text or update the chart context or checklist.",
  "Quick de-ID",
  "Clinical workup",
  "OpenEvidence review tasks",
  "Phone handoff",
  "Bring phone findings back",
  "Bedside checklist",
  "Final update review"
]) {
  if (!html.includes(requiredSnippet)) {
    throw new Error(`Expected clinical UI guardrail copy not found: ${requiredSnippet}`);
  }
}

for (const requiredId of [
  "startWorkspaceButton",
  "vaultAccessView",
  "openVaultForm",
  "createVaultForm",
  "singlePatientWorkflowButton",
  "demoCaseButton",
  "sidebarDemoCaseButton",
  "topDemoCaseButton",
  "patientAdmissionForm",
  "dischargePatientButton",
  "lockVaultButton",
  "sidebarAdmitPatientButton",
  "sidebarQuickDeidButton",
  "runDeidButton",
  "deidBuildChecklistButton",
  "workupConcernInput",
  "workupOrdersPanel",
  "decisionTreePanel",
  "patientWorkupOrdersPanel",
  "patientDecisionTreePanel",
  "buildChecklistButton",
  "copyWorkupButton",
  "sharedPromptWorkbench",
  "patientEvidenceTaskStrip",
  "promptVariableBar",
  "copyPromptButton",
  "savePromptTemplateButton",
  "decisionTreeJsonInput",
  "decisionTreeImportPreview",
  "saveDecisionTreeSourceButton",
  "decisionTreeZoomSelect",
  "zoomInDecisionTreeButton",
  "zoomOutDecisionTreeButton",
  "saveDecisionTreeDefaultButton",
  "saveDecisionTreeLocalFileButton",
  "workupStudioSearchInput",
  "workupStudioStatusFilter",
  "workupStudioList",
  "workupStudioSectionTabs",
  "workupStudioEditor",
  "workupStudioImportInput",
  "workupStudioOpenEvidencePromptOutput",
  "workupStudioCopyPromptButton",
  "workupStudioOpenEvidenceButton",
  "workupStudioPreviewImportButton",
  "workupStudioAcceptImportButton",
  "workupStudioPublishImportButton",
  "workupStudioExportPatchButton",
  "workupStudioBackendStatus",
  "workupStudioMagicLinkEmailField",
  "workupStudioMagicLinkEmailInput",
  "workupStudioSignInButton",
  "workupStudioLoadBackendDraftsButton",
  "workupStudioSignOutButton",
  "exportPhoneContextButton",
  "importPhoneFindingsButton",
  "pastePhoneFindingsButton",
  "startReturnQrScannerButton",
  "phoneReturnQrOverlay",
  "maximizePhoneReturnQrButton",
  "bedsideCompletionPanel",
  "maximizeBedsideReturnQrButton",
  "completionCopyPhoneReturnPayloadButton",
  "workspaceChecklistPhoneButton",
  "showPhoneReturnQrButton",
  "copyPhoneReturnPayloadButton",
  "useLaptopChecklistButton",
  "checklistSections",
  "reviewFindingsButton",
  "copyFinalUpdateButton",
  "phiOverlay",
  "quickDeidOverlay"
]) {
  if (!html.includes(`id="${requiredId}"`)) {
    throw new Error(`Expected reachable workflow control missing: ${requiredId}`);
  }
}

for (const requiredImport of [
  "deidentifyTextStructuredOnly",
  "evaluateComplaintCds",
  "formatComplaintCdsReport",
  "buildLocalChecklistFromWorkup",
  "checklistItemOptions",
  "parseChecklist",
  "openEvidenceTasks",
  "buildOpenEvidencePrompt"
]) {
  if (!html.includes(requiredImport)) {
    throw new Error(`Expected shared clinical module import/use missing: ${requiredImport}`);
  }
}

const moduleMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!moduleMatch) {
  throw new Error("index.html must contain a module script for the local app shell.");
}
const moduleScript = moduleMatch[1];
const checklistModule = readFileSync("checklist.js", "utf8");
for (const checklistSnippet of ["BEDSIDE QUESTION CHECKLIST", "TARGETED PHYSICAL EXAM CHECKLIST"]) {
  if (!checklistModule.includes(checklistSnippet)) {
    throw new Error(`Expected checklist module contract missing: ${checklistSnippet}`);
  }
}
if (/localStorage\.setItem[\s\S]{0,900}(chartInput|labsInput|medsInput|handoffInput)/.test(moduleScript)) {
  throw new Error("Raw intake fields must not be persisted to localStorage.");
}
if (!/state\.phonePayload\s*=\s*encodePayload/.test(moduleScript)) {
  throw new Error("Phone handoff should create a code-paired local payload from app state.");
}
if (/const options\s*=\s*\["\(-\) No", "\(\+\) Yes"\]/.test(moduleScript)) {
  throw new Error("Checklist rendering must not collapse every item to generic No/Yes controls.");
}
if (!/const options\s*=\s*checklistOptionsForItem\(section,\s*item\)/.test(moduleScript)) {
  throw new Error("Checklist rendering must use item-specific answer choices from the checklist module.");
}
if (!/endorsementComponentsForItem/.test(moduleScript) || !/endorsement-button/.test(html)) {
  throw new Error("Checklist rendering must expose per-symptom -/+ endorsement controls.");
}
if (!/itemNotes/.test(moduleScript) || !/item-note-input/.test(html)) {
  throw new Error("Checklist rendering must preserve row-level notes for findings outside the choices.");
}

const scratch = mkdtempSync(join(tmpdir(), "preround-syntax-"));
try {
  const modulePath = join(scratch, "index-inline.mjs");
  writeFileSync(modulePath, moduleScript, "utf8");
  runNodeCheck(modulePath);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log("Syntax checks passed.");
