import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const files = [
  "checklist.js",
  "clinical-intents.js",
  "complaint-cds.js",
  "census.js",
  "continuity.js",
  "deid.js",
  "deid-worker.js",
  "embedding-recall.js",
  "evidence.js",
  "labs.js",
  "medical-knowledge-db.js",
  "open-evidence-results.js",
  "open-evidence-workflows.js",
  "scripts/deid-fixtures.js",
  "scripts/build-medical-knowledge-db.js",
  "scripts/build-physical-exam-evidence.js",
  "scripts/audit-evidence-checklist.js",
  "scripts/evidence-eval.js",
  "scripts/iterate-clinical-workups.js",
  "scripts/generate-endocrine-workups.js",
  "scripts/install-endocrine-workups.js",
  "scripts/test-endocrine-knowledge.js",
  "scripts/benchmark-embedding-models.js",
  "scripts/test-complaint-cds.js",
  "scripts/test-medical-knowledge-db.js",
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
  "scripts/check-syntax.js"
];

function runNodeCheck(file) {
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
for (const requiredSnippet of [
  '<meta name="theme-color" content="#f4f7f7">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
  "color-scheme: light;",
  "--bg: #f4f7f7;",
  "Clinical light shell",
  'background_color: "#f4f7f7"',
  'theme_color: "#f4f7f7"'
]) {
  if (!html.includes(requiredSnippet)) {
    throw new Error(`Expected light clinical shell guardrail not found: ${requiredSnippet}`);
  }
}
if (/<main\b[^>]*\baria-live=/i.test(html)) {
  throw new Error("Do not make the whole app shell a live region; use scoped status elements instead.");
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
for (const requiredSnippet of [
  "No analytics, telemetry, tracking pixels, or ad scripts",
  "No cloud upload by default",
  "structuredOnlyDeidToggle",
  "clipboardAutoClearToggle",
  "does not legally certify HIPAA de-identification",
  "Business Associate Agreement",
  "raw notes, admission text, names, MRNs, and room numbers are not persisted",
  "PHI safety check for encrypted export",
  "PHI safety check for stored OpenEvidence summary"
]) {
  if (!html.includes(requiredSnippet)) {
    throw new Error(`Expected privacy/security guardrail copy not found: ${requiredSnippet}`);
  }
}
for (const requiredSnippet of [
  '<button id="reviewPhiPreviewButton" class="btn btn-secondary" type="button">Review preview</button>',
  '<button id="rerunPhiCheckButton" class="btn btn-secondary" type="button">Run check again</button>',
  '<button id="copyPhiAnywayButton" class="btn btn-primary" type="button">Copy after PHI review</button>',
  "Copy only after checking the preview for PHI."
]) {
  if (!html.includes(requiredSnippet)) {
    throw new Error(`PHI safety copy should be explicit about review without encouraging bypass: ${requiredSnippet}`);
  }
}
for (const requiredSnippet of [
  '<strong>Standalone local de-ID</strong>',
  "Use this for quick local redaction only. It does not save text or update the chart context, checklist, or census.",
  '<label for="utilityRawInput">Text for local de-ID</label>',
  "Paste text to redact locally. Review the redacted preview before copying.",
  '<button id="utilityDeidButton" class="btn btn-primary" type="button">Run local de-ID</button>',
  '<button id="utilityCopyButton" class="btn btn-secondary" type="button">Copy reviewed text</button>',
  'elements.utilityDeidButton.textContent = isBusy ? "Working..." : "Run local de-ID";',
  'elements.utilityCopyButton.textContent = isBusy ? "Working..." : "Copy reviewed text";',
  'elements.utilityStatus.textContent = "Run local de-ID first.";',
  "PHI safety check for reviewed redacted text"
]) {
  if (!html.includes(requiredSnippet)) {
    throw new Error(`Standalone de-ID utility should stay local, reviewed, and clinically worded: ${requiredSnippet}`);
  }
}
for (const forbiddenSnippet of [
  "Patient data stays on this computer",
  "saved patient workspaces",
  "patient workspace to a backend service",
  "I reviewed this for PHI, copy anyway",
  "Review Preview",
  "Run Check Again",
  "De-identify anything",
  "Paste any note, lab header, message, or draft text here.",
  "Copy redacted text",
  "De-identify text first.",
  "PHI safety check for redacted text"
]) {
  if (html.includes(forbiddenSnippet)) {
    throw new Error(`Unsafe privacy copy remains in index.html: ${forbiddenSnippet}`);
  }
}
const securityDoc = readFileSync("SECURITY.md", "utf8");
const privacyDoc = readFileSync("PRIVACY.md", "utf8");
const readmeDoc = readFileSync("README.md", "utf8");
for (const [label, doc] of [["README.md", readmeDoc], ["SECURITY.md", securityDoc], ["PRIVACY.md", privacyDoc], ["index.html", html]]) {
  if (/\bHIPAA compliant\b/i.test(doc)) {
    throw new Error(`${label} should avoid HIPAA compliant phrasing; describe obligations and safeguards instead.`);
  }
}
for (const requiredSnippet of [
  "HIPAA compliance depends on the full operating environment",
  "Security risk analysis guidance",
  "Business associate guidance",
  "do not by themselves satisfy HIPAA obligations",
  "Encrypted context export is user-initiated and gated by the PHI safety check",
  "frame-ancestors 'none'"
]) {
  if (!securityDoc.includes(requiredSnippet)) {
    throw new Error(`Expected SECURITY.md guidance not found: ${requiredSnippet}`);
  }
}
for (const requiredSnippet of [
  "not a legal de-identification certification service",
  "Local-First Defaults",
  "Data That Can Leave The Browser",
  "External clinical AI tools",
  "Raw chart text, admission intake text, patient names, MRNs, room numbers, and obvious roster identifiers are dropped before vault storage"
]) {
  if (!privacyDoc.includes(requiredSnippet)) {
    throw new Error(`Expected PRIVACY.md guidance not found: ${requiredSnippet}`);
  }
}
if (/Use one OpenEvidence conversation for the patient/i.test(html)) {
  throw new Error("Remove implementation-style OpenEvidence workflow copy from the visible UI.");
}
const vaultAssuranceMatch = html.match(/<ul class="vault-assurance-list"[\s\S]*?<\/ul>/);
if (!vaultAssuranceMatch) {
  throw new Error("Expected local privacy protections list on the vault start screen.");
}
if (/<\/strong>[A-Z]/.test(vaultAssuranceMatch[0])) {
  throw new Error("Vault privacy bullets must separate bold lead-in text from body copy.");
}
for (const requiredSnippet of [
  'id="vaultDecisionGrid" class="vault-decision-grid"',
  'vaultDecisionGrid: document.getElementById("vaultDecisionGrid")',
  'function orderVaultEntryCards({ vaultExists, storageUnavailable, createPrimary, singlePatientPrimary, recoveredChecklist })',
  'elements.vaultDecisionGrid.appendChild(card)',
  'const showUnlockCard = true;',
  'elements.unlockVaultCard.hidden = !showUnlockCard;',
  'elements.vaultDecisionGrid.classList.toggle("is-no-vault", !showUnlockCard);',
  'orderVaultEntryCards({ vaultExists, storageUnavailable, createPrimary, singlePatientPrimary, recoveredChecklist });'
]) {
  if (!html.includes(requiredSnippet)) {
    throw new Error(`Vault start cards must keep visual, DOM, and keyboard order aligned: ${requiredSnippet}`);
  }
}
if (!/\.vault-decision-grid\.is-no-vault\s*\{\s*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/.test(html)) {
  throw new Error("The first-run vault chooser should keep all three workspace choices visible in DOM order.");
}
if (!/\.vault-decision-grid\s*\{[\s\S]*?align-items:\s*start;/.test(html)) {
  throw new Error("Vault chooser cards should size to their content instead of stretching shorter choices into empty panels.");
}
if (!/@media\s*\(max-width:\s*430px\)[\s\S]*?\.vault-decision-grid\.is-no-vault,\s*[\s\S]*?\.patient-editor-grid,[\s\S]*?\.batch-snippet-controls\s*\{[\s\S]*?grid-template-columns:\s*1fr;/.test(html)) {
  throw new Error("The three-choice vault layout must collapse to one column on mobile.");
}
if (/\.vault-decision-card\.is-(?:primary|recovery)\s*\{[\s\S]{0,120}order\s*:/.test(html)
  || /#singlePatientVaultCard\s*\{[\s\S]{0,120}order\s*:/.test(html)
  || /#(?:unlockVaultCard|createVaultCard)\.is-disabled\s*\{[\s\S]{0,120}order\s*:/.test(html)) {
  throw new Error("Vault start cards should be reordered in the DOM, not with CSS order that breaks keyboard flow.");
}
if (!/body\[data-screen="censusScreen"\]\s+\.census-topbar\s*\{\s*display:\s*none;\s*\}/.test(html)) {
  throw new Error("The census start screen should hide redundant patient-census navigation chrome.");
}
if (!/\.vault-unlocked-summary\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;/.test(html)) {
  throw new Error("The unlocked census summary should span the saved-roster grid so the roster stays in the wide column.");
}
if (!/\.patient-table\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;[\s\S]*?overflow-x:\s*auto;/.test(html)) {
  throw new Error("The census roster table should contain narrow-width overflow inside the roster panel, not the page.");
}
if (!/function\s+scrollCensusWorkspaceStartIntoView\(\)\s*\{[\s\S]*?censusUnlockedSummary[\s\S]*?scrollIntoView\(\{[\s\S]*?behavior:\s*"auto"/.test(html)) {
  throw new Error("The saved census workspace should scroll to its unlocked summary after create or unlock.");
}
for (const requiredSnippet of [
  "renderCensusDashboard();\n        scrollCensusWorkspaceStartIntoView();\n        elements.censusVaultStatus.textContent = \"Local encrypted vault created.",
  "renderCensusDashboard();\n        scrollCensusWorkspaceStartIntoView();\n        scheduleCensusSave(50);"
]) {
  if (!html.includes(requiredSnippet)) {
    throw new Error(`Saved census create/unlock transitions must orient the user at the workspace start: ${requiredSnippet}`);
  }
}
if (!/body\[data-screen="checklistScreen"\]\s+\.workflow-status-line\s*\{\s*display:\s*none;\s*\}/.test(html)) {
  throw new Error("The checklist screen should hide the duplicate detailed workflow status line.");
}
if (!/body\[data-screen="pasteScreen"\]\s+\.workflow-status-line\s*\{\s*display:\s*none;\s*\}/.test(html)) {
  throw new Error("The prepare screen should hide the duplicate detailed workflow status line.");
}
if (!/@media\s*\(max-width:\s*430px\)[\s\S]*?\.workflow-status-line\s*\{\s*display:\s*none;\s*\}/.test(html)) {
  throw new Error("The mobile workflow rail should hide the duplicate detailed status line.");
}
if (/\.workflow-compact-label\s*\{[^}]*display:\s*inline-flex;/.test(html)) {
  throw new Error("The mobile workflow rail should not show a duplicate compact text summary above the step buttons.");
}
if (!/@media\s*\(max-width:\s*430px\)[\s\S]*?\.simple-workflow-strip\s*\{\s*display:\s*none;\s*\}/.test(html)) {
  throw new Error("The mobile prepare screen should hide the duplicate simple workflow strip.");
}
if (!/@media\s*\(max-width:\s*430px\)[\s\S]*?#pasteScreen\s*>\s*\.hero\s*\{\s*padding:\s*6px\s*2px\s*8px;\s*\}[\s\S]*?#pasteScreen\s*>\s*\.hero h1\s*\{[\s\S]*?font-size:\s*1\.45rem;[\s\S]*?\.device-mode-switch button\s*\{[\s\S]*?min-height:\s*48px;/.test(html)) {
  throw new Error("The mobile prepare screen should keep the workflow header compact so the task area appears in the first viewport.");
}
if (!/@media\s*\(max-width:\s*430px\)[\s\S]*?#sourceWorkflowCard\s+\.source-toggle\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[\s\S]*?#sourceWorkflowCard\s+\.source-choice-copy\s*\{\s*display:\s*none;[\s\S]*?#sourceWorkflowCard\s*>\s*div:first-child\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?#sourceCompletenessPanel\s+\.status-chip-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/.test(html)) {
  throw new Error("The mobile prepare source chooser and chart-info summary should stay compact so the first chart input is reachable quickly.");
}
if (!/@media\s*\(max-width:\s*700px\)[\s\S]*?body\[data-screen="pasteScreen"\]\s+\.privacy-summary-copy\s*\{\s*display:\s*none;[\s\S]*?body\[data-screen="pasteScreen"\]\s+#priorSourcePanel\s+\.phi-note,\s*body\[data-screen="pasteScreen"\]\s+#priorSourcePanel\s+\.next-action-copy\s*\{[\s\S]*?display:\s*none;/.test(html)) {
  throw new Error("The mobile prepare flow should compact repeated privacy and de-ID hints so the de-identify action stays reachable.");
}
if (!/@media\s*\(min-width:\s*760px\)[\s\S]*?body\[data-screen="pasteScreen"\]\s+#pasteScreen\s*>\s*\.hero\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*0\.34fr\)\s+minmax\(0,\s*0\.66fr\);[\s\S]*?body\[data-screen="pasteScreen"\]\s+\.simple-workflow-strip\s*\{[\s\S]*?display:\s*none;[\s\S]*?body\[data-screen="pasteScreen"\]\s+#sourceWorkflowCard\s*>\s*div:first-child,\s*body\[data-screen="pasteScreen"\]\s+#priorSourcePanel\s*>\s*\.guided-step\s*\{[\s\S]*?clip:\s*rect\(0,\s*0,\s*0,\s*0\);[\s\S]*?body\[data-screen="pasteScreen"\]\s+#sourceWorkflowCard\s+\.source-choice-copy\s*\{[\s\S]*?display:\s*none;/.test(html)) {
  throw new Error("The desktop prepare flow should keep the chart input reachable by compacting duplicate headers and source-choice copy.");
}
if (!/@media\s*\(min-width:\s*760px\)[\s\S]*?body\[data-screen="pasteScreen"\]\s+\.tools-body\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[\s\S]*?body\[data-screen="pasteScreen"\]\s+\.tools-body\s*>\s*details\[open\],\s*body\[data-screen="pasteScreen"\]\s+\.tools-body\s*>\s*\.tool-section\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;[\s\S]*?body\[data-screen="pasteScreen"\]\s+\.tools-body\s*>\s*details:not\(\[open\]\)\s*>\s*summary\s*\{[\s\S]*?min-height:\s*40px;/.test(html)) {
  throw new Error("The desktop clinical tools drawer should use a compact selector grid while opened tools remain full-width.");
}
if (!/@media\s*\(max-width:\s*700px\)[\s\S]*?body\[data-screen="pasteScreen"\]\s+\.tools-body\s*\{[\s\S]*?gap:\s*8px;[\s\S]*?padding:\s*8px;[\s\S]*?body\[data-screen="pasteScreen"\]\s+\.tools-body\s*>\s*details:not\(\[open\]\)\s*>\s*summary\s*\{[\s\S]*?min-height:\s*38px;/.test(html)) {
  throw new Error("The mobile clinical tools drawer should keep closed modules compact so the active workflow stays reachable.");
}
if (!/@media\s*\(min-width:\s*760px\)[\s\S]*?body\[data-screen="pasteScreen"\]\s+#priorSourcePanel\s*>\s*label\[for="rawSoapInput"\]\s*\{[\s\S]*?order:\s*1;[\s\S]*?body\[data-screen="pasteScreen"\]\s+#rawSoapInput\s*\{[\s\S]*?order:\s*2;[\s\S]*?min-height:\s*132px;[\s\S]*?body\[data-screen="pasteScreen"\]\s+#priorSourcePanel\s+\.guided-primary-actions\s*\{[\s\S]*?order:\s*4;[\s\S]*?body\[data-screen="pasteScreen"\]\s+#priorSourcePanel\s*>\s*label\[for="rawLabsInput"\]\s*\{[\s\S]*?order:\s*9;[\s\S]*?body\[data-screen="pasteScreen"\]\s+#rawMedicationInput\s*\{[\s\S]*?order:\s*17;/.test(html)) {
  throw new Error("The desktop chart-info panel should show the main note and de-identify action before optional context fields.");
}
for (const requiredSnippet of [
  '<h2 id="promptOneTitle" class="workflow-title">Add chart context</h2>',
  'elements.sourceWorkflowTitle.textContent = "Add chart context";',
  'title: "Next step"',
  'label: "Paste chart text"'
]) {
  if (!html.includes(requiredSnippet)) {
    throw new Error(`The prepare source workflow should avoid duplicate Paste Epic info headings: ${requiredSnippet}`);
  }
}
if (/elements\.sourceWorkflowTitle\.textContent\s*=\s*"Paste Epic info"/.test(html)) {
  throw new Error("The prepare source workflow parent heading should not duplicate the Epic info panel title.");
}
if (!/@media\s*\(max-width:\s*430px\)[\s\S]*?#priorSourcePanel\s*>\s*label\[for="rawSoapInput"\]\s*\{\s*order:\s*1;[\s\S]*?#rawSoapInput\s*\{\s*order:\s*2;\s*min-height:\s*148px;[\s\S]*?#priorSourcePanel\s+\.guided-primary-actions\s*\{\s*order:\s*5;[\s\S]*?#priorSourcePanel\s*>\s*label\[for="rawLabsInput"\]\s*\{\s*order:\s*11;[\s\S]*?#rawMedicationInput\s*\{\s*order:\s*19;/.test(html)) {
  throw new Error("The mobile prepare flow should show the main note and de-identify action before optional chart-context fields.");
}
if (!/@media\s*\(max-width:\s*430px\)[\s\S]*?body\[data-screen="checklistScreen"\]\s+\.audit-panel\s*\{[\s\S]*?gap:\s*8px;[\s\S]*?body\[data-screen="checklistScreen"\]\s+\.audit-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[\s\S]*?body\[data-screen="checklistScreen"\]\s+\.checklist-utilities\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[\s\S]*?body\[data-screen="checklistScreen"\]\s+\.section-drawer summary\s*\{[\s\S]*?min-height:\s*38px;/.test(html)) {
  throw new Error("The mobile checklist quality and navigation chrome should stay compact so bedside items remain reachable.");
}
if (!/id="evidenceReviewCard"[\s\S]*?id="evidenceSupportedCount"[\s\S]*?id="evidenceNeedsReviewCount"[\s\S]*?id="evidenceNoSourceCount"[\s\S]*?id="evidenceReviewItems"/.test(html)) {
  throw new Error("The bedside checklist should expose a first-class evidence review card with real counts and supported-item rows.");
}
if (!/@media\s*\(min-width:\s*760px\)[\s\S]*?body\[data-screen="checklistScreen"\]\s+\.checklist-utilities\s*\{[\s\S]*?grid-template-columns:\s*minmax\(300px,\s*1fr\)\s+minmax\(220px,\s*0\.52fr\);[\s\S]*?body\[data-screen="checklistScreen"\]\s+\.checklist-utilities\s*>\s*\.tool-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[\s\S]*?body\[data-screen="checklistScreen"\]\s+\.mini-btn,\s*body\[data-screen="checklistScreen"\]\s+\.section-drawer summary\s*\{[\s\S]*?min-height:\s*40px;/.test(html)) {
  throw new Error("The desktop checklist navigation should stay compact so bedside items appear sooner.");
}
if (!/@media\s*\(max-width:\s*700px\)[\s\S]*?\.clinical-modifier-note\s*\{\s*display:\s*none;[\s\S]*?\.clinical-modifier-chips\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[\s\S]*?\.complaint-cds-actions,\s*\.exam-tester-actions\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[\s\S]*?#runComplaintCdsButton,\s*#runExamTesterButton\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;/.test(html)) {
  throw new Error("The mobile clinical workup and reviewer action panels should stay compact and scannable.");
}
for (const requiredSnippet of [
  '<details class="clinical-modifier-control">',
  '<summary class="clinical-modifier-title">Clinical modifiers</summary>',
  'class="clinical-modifier-body"',
  'aria-label="Poor intake or dehydration">Poor intake</button>',
  'aria-label="Unilateral leg swelling">Leg swelling</button>',
  'aria-label="Pregnancy possible">Pregnancy</button>'
]) {
  if (!html.includes(requiredSnippet)) {
    throw new Error(`Clinical modifiers should remain a compact optional disclosure: ${requiredSnippet}`);
  }
}
for (const requiredSnippet of [
  '<details class="review-details review-redaction-details" hidden>',
  '<summary>Redaction summary</summary>',
  'function setReviewGroupContainerHidden(container, hidden)',
  'const disclosure = container.closest(".review-redaction-details");',
  'setReviewGroupContainerHidden(container, groups.size === 0);',
  'setReviewGroupContainerHidden(elements.scrubReviewGroups, true);',
  'setReviewGroupContainerHidden(elements.utilityReviewGroups, true);'
]) {
  if (!html.includes(requiredSnippet)) {
    throw new Error(`Redaction review groups should stay collapsed behind a disclosure: ${requiredSnippet}`);
  }
}
if (!html.includes("Review before bedside use.")) {
  throw new Error("Checklist quality copy should be short enough for the mobile bedside flow.");
}
if (!html.includes(".finding-section-chevron::before")) {
  throw new Error("Checklist section toggles should use a decorative CSS chevron instead of visible text.");
}
if (/chevron\.textContent\s*=\s*"v"/.test(html)) {
  throw new Error("Checklist section toggles should not expose a literal v as the chevron.");
}
for (const requiredSnippet of [
  '<button id="generateButton" class="btn btn-primary" type="button">Review findings</button>',
  '<h2 id="outputTitle">Bedside findings review</h2>',
  '<button id="copyPresentationPromptButton" class="btn btn-primary" type="button">Copy final update prompt</button>',
  '<button id="editButton" class="btn btn-secondary" type="button">Back to checklist</button>',
  '<button id="newButton" class="btn btn-quiet" type="button">Start new patient</button>'
]) {
  if (!html.includes(requiredSnippet)) {
    throw new Error(`Bedside handoff should read like a review workflow, not a prototype output screen: ${requiredSnippet}`);
  }
}
for (const deprecatedSnippet of [
  '<button id="generateButton" class="btn btn-primary" type="button">Prepare Update</button>',
  '<h2 id="outputTitle">Findings</h2>',
  '<button id="copyButton" class="btn btn-secondary" type="button">Copy findings only</button>',
  'elements.newButton.textContent = "Tap Again to Reset";'
]) {
  if (html.includes(deprecatedSnippet)) {
    throw new Error(`Deprecated bedside handoff wording still appears: ${deprecatedSnippet}`);
  }
}
for (const requiredSnippet of [
  'id="singlePatientVaultNote"',
  'const createPrimary = !vaultExists && !storageUnavailable && hasWorkspaceContent && !recoveredChecklist;',
  'const singlePatientPrimary = recoveredChecklist || storageUnavailable || (!vaultExists && !hasWorkspaceContent);',
  'elements.singlePatientVaultCard.classList.toggle("is-primary", singlePatientPrimary);',
  'elements.createCensusButton.classList.toggle("btn-primary", createPrimary);',
  'elements.continueSinglePatientButton.classList.toggle("btn-primary", singlePatientPrimary);',
  "Start one-patient prep without saving, or create an encrypted local vault for a saved roster.",
  "elements.singlePatientVaultCard.classList.toggle(\"is-recovery\", recoveredChecklist);",
  "Recovered bedside answers and notes are available in this browser session.",
  'elements.continueSinglePatientButton.textContent = recoveredChecklist ? "Resume bedside checklist" : "Start one-patient prep";',
  "if (state.recoveredChecklistAvailable) {",
  'showScreen("checklistScreen");',
  'setDeviceWorkflowMode("prepare", { focus: false, silent: true });'
]) {
  if (!html.includes(requiredSnippet)) {
    throw new Error(`Recovered checklist should be a first-screen resume action, not an overlay toast: ${requiredSnippet}`);
  }
}
for (const requiredSnippet of [
  'class="vault-icon" aria-hidden="true" data-icon="unlock"',
  'class="vault-icon" aria-hidden="true" data-icon="create"',
  'class="vault-icon" aria-hidden="true" data-icon="single-patient"',
  '.vault-icon svg'
]) {
  if (!html.includes(requiredSnippet)) {
    throw new Error(`Vault start cards should use polished SVG icons instead of placeholder text badges: ${requiredSnippet}`);
  }
}
if (/<span class="vault-icon" aria-hidden="true">[A-Z0-9]<\/span>/.test(html)) {
  throw new Error("Vault start cards should not use single-character placeholder badges.");
}
if (/showToast\("Recovered bedside checklist from this tab\."/.test(html)) {
  throw new Error("Recovered checklist restore should not overlay the start/vault screen with an action toast.");
}
if (/No local vault exists yet\. Choose a new passcode and click Create local vault/.test(html)) {
  throw new Error("No-vault start copy should make one-patient prep the first action, not passcode creation.");
}
if (!/Encrypted local storage is unavailable in this browser; single-patient mode still works[\s\S]{0,240}renderCensusDashboard\(\);\s*showScreen\("censusScreen"\);/.test(html)) {
  throw new Error("Storage-unavailable startup should still show the start/vault workspace chooser.");
}
if (!/@media\s*\(max-width:\s*430px\)[\s\S]*?#priorSourcePanel\s*>\s*\.guided-step\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?clip:\s*rect\(0,\s*0,\s*0,\s*0\);/.test(html)) {
  throw new Error("The mobile chart-info panel should not repeat the source-card heading before the first chart input.");
}
if (!/id="rawMedicationInput"[\s\S]*?<\/textarea>\s*<div id="sourceCompletenessPanel" class="source-completeness-panel"/.test(html)) {
  throw new Error("Chart-info coverage chips should sit after the chart text fields instead of blocking the first input.");
}
if (/phoneQuickStartCard|phone-quick-card|startChecklistFirstButton|showSourceWorkflowButton|Bedside phone workflow|Paste checklist now/.test(html)) {
  throw new Error("The prepare workflow should not reintroduce a viewport-only phone quick-start card.");
}
for (const requiredSnippet of [
  'id="toast" class="toast" aria-hidden="true"',
  'id="toastMessage" class="toast-message" role="status" aria-live="polite" aria-atomic="true"',
  'id="toastAction" class="toast-action" type="button" hidden disabled',
  'id="toastClose" class="toast-close" type="button" aria-label="Dismiss notification" hidden disabled',
  '.toast-close svg',
  '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">',
  '.toast[aria-hidden="true"]',
  'elements.toast.setAttribute("aria-hidden", "false");',
  'elements.toast.setAttribute("aria-hidden", "true");',
  "elements.toastClose.disabled = false;",
  "elements.toastClose.disabled = true;",
  'elements.toastAction.textContent = "";'
]) {
  if (!html.includes(requiredSnippet)) {
    throw new Error(`Toast visibility/focus guardrail missing: ${requiredSnippet}`);
  }
}
if (/id="toastClose"[^>]*>\s*x\s*<\/button>/.test(html)) {
  throw new Error("Toast close control should use the icon button, not a literal x.");
}
for (const requiredSnippet of [
  "function clearDownstreamWorkflowState()",
  "const clearedDownstream = clearDownstreamWorkflowState();",
  "state.sections = [];",
  "state.compiledText = \"\";",
  "state.conversationChecklistReady = false;",
  "state.conversationFinalReady = false;",
  "state.recoveredChecklistAvailable = false;",
  "clearChecklistSession();"
]) {
  if (!html.includes(requiredSnippet)) {
    throw new Error(`Source context invalidation must clear downstream checklist/update state: ${requiredSnippet}`);
  }
}
for (const requiredSnippet of [
  '<p class="eyebrow">Rounds workflow</p>',
  '<p class="compact-summary-title">Prompt and checklist progress</p>',
  '<ul class="conversation-steps" aria-label="Rounds workflow progress">',
  '<li id="conversationStepChecklist">Local checklist</li>',
  '<li id="conversationStepFindings">Final update</li>',
  'elements.conversationStatusText.textContent = "Final update prompt copied. Paste it where you made the initial report.";',
  'elements.conversationStatusText.textContent = "Bedside findings are ready. Review them, then copy the final update prompt.";',
  'id="sidebarSourceStatus"',
  'id="sidebarChecklistStatus"',
  'id="sidebarFindingsStatus"',
  'id="sidebarOutputStatus"',
  'id="sidebarFindingsStatus">Bedside pending</span>',
  'id="findingsReadyStatus">Bedside pending</span>',
  ': "Bedside pending";',
  ".workflow-status-line span.is-current",
  ".guide-sidebar-list span.is-current",
  ".guide-sidebar-list span.is-ready",
  "const statusStates = [",
  "elements.sidebarSourceStatus.textContent = sourceStatus;",
  "elements.sidebarChecklistStatus.textContent = checklistStatus;",
  "elements.sidebarFindingsStatus.textContent = findingsStatus;",
  "elements.sidebarOutputStatus.textContent = outputStatus;",
  "[elements.sidebarSourceStatus, facts.sourceReviewed, !facts.sourceReviewed]",
  "[elements.sidebarChecklistStatus, checklistReady, facts.sourceReviewed && !checklistReady]",
  "element.setAttribute(\"aria-current\", \"step\");"
]) {
  if (!html.includes(requiredSnippet)) {
    throw new Error(`Guide sidebar workflow status must be live, not hard-coded: ${requiredSnippet}`);
  }
}
for (const deprecatedSnippet of [
  '<p class="compact-summary-title">OpenEvidence progress</p>',
  '<ul class="conversation-steps" aria-label="OpenEvidence conversation progress">',
  '<li id="conversationStepChecklist">Checklist</li>',
  '<li id="conversationStepFindings">Bedside update</li>',
  'if (state.bedsideFindingsReady || state.conversationFinalReady) {'
]) {
  if (html.includes(deprecatedSnippet)) {
    throw new Error(`Workflow progress card should distinguish local checklist work from OpenEvidence prompt work: ${deprecatedSnippet}`);
  }
}
const scriptMatch = html.match(/<script\s+type="module">([\s\S]*?)<\/script>/i);
if (!scriptMatch) {
  throw new Error("Could not find the module script in index.html.");
}

const moduleScript = scriptMatch[1];
if (!/from\s+["']\.\/deid\.js(?:\?[^"']+)?["']/.test(moduleScript)) {
  throw new Error("index.html must import the shared deid.js module.");
}
if (!/from\s+["']\.\/checklist\.js(?:\?[^"']+)?["']/.test(moduleScript)) {
  throw new Error("index.html must import the shared checklist.js module.");
}
if (!/from\s+["']\.\/clinical-intents\.js(?:\?[^"']+)?["']/.test(moduleScript)) {
  throw new Error("index.html must import the clinical intents module.");
}
if (!/from\s+["']\.\/complaint-cds\.js(?:\?[^"']+)?["']/.test(moduleScript)) {
  throw new Error("index.html must import the complaint CDS module.");
}
if (!/from\s+["']\.\/labs\.js(?:\?[^"']+)?["']/.test(moduleScript)) {
  throw new Error("index.html must import the shared labs.js module.");
}
if (!/from\s+["']\.\/evidence\.js(?:\?[^"']+)?["']/.test(moduleScript)) {
  throw new Error("index.html must import the shared evidence.js module.");
}
if (!/from\s+["']\.\/embedding-recall\.js(?:\?[^"']+)?["']/.test(moduleScript)) {
  throw new Error("index.html must import the embedding recall module.");
}
if (!/from\s+["']\.\/open-evidence-workflows\.js(?:\?[^"']+)?["']/.test(moduleScript)) {
  throw new Error("index.html must import the OpenEvidence workflow module.");
}
if (!/from\s+["']\.\/open-evidence-results\.js(?:\?[^"']+)?["']/.test(moduleScript)) {
  throw new Error("index.html must import the OpenEvidence results module.");
}
for (const importedName of ["cleanupDeidArtifacts", "deidentifyTextStructuredOnly", "normalizeResidualTemporalPhi"]) {
  if (!new RegExp(`\\b${importedName}\\b`).test(moduleScript)) {
    throw new Error(`index.html must use shared ${importedName} from deid.js.`);
  }
}
for (const importedName of ["parseChecklist", "validateChecklist", "normalizeChecklistText", "buildCleanupPrompt"]) {
  if (!new RegExp(`\\b${importedName}\\b`).test(moduleScript)) {
    throw new Error(`index.html must use shared ${importedName} from checklist.js.`);
  }
}
for (const importedName of ["resolveClinicalIntents", "selectedValidatedClinicalIntents", "buildValidatedClinicalIntentPromptBlock"]) {
  if (!new RegExp(`\\b${importedName}\\b`).test(moduleScript)) {
    throw new Error(`index.html must use shared ${importedName} from clinical-intents.js.`);
  }
}
for (const importedName of ["evaluateComplaintCds", "formatComplaintCdsReport"]) {
  if (!new RegExp(`\\b${importedName}\\b`).test(moduleScript)) {
    throw new Error(`index.html must use shared ${importedName} from complaint-cds.js.`);
  }
}

for (const requiredSnippet of [
  "knowledgeBasePanel",
  "knowledgeModuleSelect",
  "knowledgeModuleEditor",
  "knowledgeProposalList",
  "medicalKnowledgeProposalV1",
  "preRoundMedicalKnowledgeLocalOverridesV1",
  "Local knowledge editor",
  "Edit active local copy",
  "saveKnowledgeLocalOverrideButton",
  "suggestKnowledgeLocalOverrideButton",
  "resetKnowledgeLocalOverrideButton",
  "knowledgeSectionSelect",
  "knowledgeItemSearchInput",
  "loadKnowledgeJsonToFormButton",
  "applyKnowledgeFormToJsonButton",
  "knowledgeSectionTabs",
  "Local knowledge edits only.",
  "Do not paste patient chart text, names, room numbers, MRNs, or encounter details.",
  "Reviewer role or team",
  "Role or team, no patient identifiers",
  "selectedKnowledgeEditorModule",
  "saveCurrentKnowledgeOverride",
  "localKnowledgeOverrideForModule",
  "knowledgeChangeSummaryHasMeaningfulChanges",
  "Make a local edit and save it before suggesting",
  "buildGuidelineExtractionPrompt",
  "loadKnowledgeEnvelopeIntoReadableEditor",
  "syncKnowledgeReadableEditorToJson",
  "renderKnowledgeSectionEditor",
  "effectiveComplaintModules",
  "updateKnowledgeProposalStatus",
  "renderKnowledgeBaseWorkbench"
]) {
  if (!html.includes(requiredSnippet) && !moduleScript.includes(requiredSnippet)) {
    throw new Error(`Expected medical knowledge workbench implementation not found: ${requiredSnippet}`);
  }
}
const selectedKnowledgeModuleDefinitions = moduleScript.match(/\bfunction\s+selectedKnowledgeModule\s*\(/g) || [];
if (selectedKnowledgeModuleDefinitions.length !== 1) {
  throw new Error("index.html must define exactly one clinical selectedKnowledgeModule() helper.");
}
for (const importedName of ["parseLabTimeline", "formatLabTimelinePreview", "formatLabChronologyPromptBlock"]) {
  if (!new RegExp(`\\b${importedName}\\b`).test(moduleScript)) {
    throw new Error(`index.html must use shared ${importedName} from labs.js.`);
  }
}
for (const importedName of [
  "buildEvidencePromptReplacement",
  "loadEvidenceCatalog",
  "matchEvidenceForChecklistItem",
  "updateEvidenceReviewState",
  "exportEvidenceReviewState",
  "importEvidenceReviewState"
]) {
  if (!new RegExp(`\\b${importedName}\\b`).test(moduleScript)) {
    throw new Error(`index.html must use shared ${importedName} from evidence.js.`);
  }
}
if (!/\bscanResidualPhi\s+as\s+scanResidualPhiShared\b/.test(moduleScript)) {
  throw new Error("index.html must import shared scanResidualPhi as scanResidualPhiShared.");
}
if (/\bfunction\s+(?:modelPredictionsToEntities|addStructuredSafeHarborEntities|filterLikelyFalsePositiveEntities|scanResidualPhi)\b/.test(moduleScript)) {
  throw new Error("index.html contains duplicate inline de-id helpers; keep de-identification logic in deid.js.");
}
if (!/PHI safety check for medication safety prompt[\s\S]{0,400}reviewScope:\s*"source-free"/.test(moduleScript)) {
  throw new Error("Medication safety prompt must be marked source-free for PHI review.");
}
for (const requiredSnippet of [
  "securitySettingsStorageKey",
  "normalizeSecuritySettings",
  "currentDeidMode",
  "isStructuredOnlyDeid",
  "scheduleClipboardClearAfterCopy",
  "blockingPhiWarnings",
  "storageSafeOpenEvidenceResult",
  "openEvidenceResultStorageText"
]) {
  if (!moduleScript.includes(requiredSnippet)) {
    throw new Error(`Expected security settings implementation not found: ${requiredSnippet}`);
  }
}
if (!/function\s+exportContextToPhone[\s\S]{0,900}runPhiSafetyCheck[\s\S]{0,700}blockingPhiWarnings[\s\S]{0,1200}encryptContextPayload/.test(moduleScript)) {
  throw new Error("Encrypted context export must run a PHI safety check before creating the file.");
}
if (!/function\s+acceptOpenEvidenceResult[\s\S]{0,900}openEvidenceResultStorageText[\s\S]{0,900}blockingPhiWarnings[\s\S]{0,900}storageSafeOpenEvidenceResult/.test(moduleScript)) {
  throw new Error("Accepted OpenEvidence paste-back summaries must be PHI-checked and storage-sanitized.");
}
if (!/function\s+applyOpenEvidenceChecklistResult[\s\S]{0,500}OpenEvidence checklist application is retired[\s\S]{0,400}return false/.test(moduleScript)) {
  throw new Error("OpenEvidence checklist paste-back must not apply checklist text to app state; bedside checklists stay local.");
}
for (const removedChecklistTask of ["generate_checklist", "refine_checklist", "handleChecklistPromptCopied"]) {
  if (moduleScript.includes(removedChecklistTask)) {
    throw new Error(`Removed OpenEvidence checklist-generation path still appears in index.html: ${removedChecklistTask}`);
  }
}
if (!/currentDeidMode\(\)[\s\S]{0,260}structured-only[\s\S]{0,900}deidentifyTextStructuredOnly/.test(moduleScript)) {
  throw new Error("Structured-only mode must bypass the de-ID worker and run shared structured redaction directly.");
}
if (!/function\s+prepareDeidentifierModel\(\)[\s\S]{0,350}isStructuredOnlyDeid\(\)/.test(moduleScript)) {
  throw new Error("Model preparation must respect structured-only mode.");
}
if (/function\s+renderReviewGroups[\s\S]{0,900}raw\.slice/.test(moduleScript)) {
  throw new Error("Rendered review groups must not replay raw redacted PHI spans.");
}
for (const requiredSnippet of [
  "cleanOutputLabel",
  "cleanOutputValue",
  "format-fix prompt",
  "deviceWorkflowMode",
  "laptopHandoffCard",
  "Use checklist on this laptop",
  "Start bedside checklist",
  "Teach me this patient",
  "Clinical tools",
  "loadStudentExamReferenceRows",
  "selectStudentExamReferenceRows",
  "student_exam_reference",
  "Clinical workup",
  "Search concern or diagnosis",
  "clinicalIntentResults",
  "clinicalModifierQuickChips",
  "clinical-search-box",
  "type=\"search\"",
  "copyClinicalImprovementAuditButton",
  "copyExamImprovementAuditButton",
  "formatClinicalImprovementAuditReport",
  "stageKnowledgeGapButton",
  "complaintCdsInput",
  "clinicalDataFetchOptions = { cache: \"no-cache\" }",
  "runComplaintCds",
  "buildUnifiedClinicalWorkup",
  "validatedIntentsForKnowledgeModule",
  "complaintModuleForSelectedIntents",
  "unifiedEvidenceRetrievalContext",
  "Evidence review",
  "Reviewer tools",
  "Run reviewer check",
  "Copy reviewed workup",
  "Copy review audit",
  "Log unsupported concern",
  "examTesterInput",
  "runExamTester",
  "examTesterEmbeddingToggle",
  "Broaden evidence recall",
  "knowledgePackImportInput",
  "Structured JSON editor",
  "Load JSON into cards",
  "Update JSON from cards",
  "Suggest source or script",
  "Save suggestion",
  "Review and edit local module content. Saved edits affect only this browser until exported for maintainer review.",
  "Do not add unvalidated checklist items as final checklist rows"
]) {
  if (!html.includes(requiredSnippet) && !moduleScript.includes(requiredSnippet)) {
    throw new Error(`Expected checklist usability guardrail not found: ${requiredSnippet}`);
  }
}
if (/>\s*Copy checklist prompt\s*</i.test(html) || />\s*Refine with OpenEvidence\s*</i.test(html) || /Copy teaching prompt/i.test(html)) {
  throw new Error("Old workflow labels should not be visible in the app.");
}
if (/fetch\([^)]*clinical|fetch\([^)]*evidence|fetch\([^)]*physical_exam|fetch\([^)]*medical-knowledge/i.test(moduleScript)
  && /cache:\s*"force-cache"/.test(moduleScript)) {
  throw new Error("Clinical evidence/reference fetches must revalidate data; do not use force-cache for clinical CSV/JSON sources.");
}
if (/Evidence exam tester \/ audit/.test(html)) {
  throw new Error("Evidence exam tester should be nested as reviewer audit, not presented as a separate normal workflow.");
}
if (/raw module exam rows|raw conditional module rows/i.test(html) || /raw module exam rows|raw conditional module rows/i.test(moduleScript)) {
  throw new Error("Normal clinical workup UI should not advertise raw module rows as recommendations.");
}
if (/Reviewer audit \/ evidence retrieval/.test(html)) {
  throw new Error("Reviewer audit should not be presented as a separate normal workflow.");
}
if (!/<select id="complaintCdsPopulationSelect">[\s\S]{0,180}<option disabled>Pediatric support unavailable<\/option>/.test(html)) {
  throw new Error("Clinical workup population selector should show pediatric support as unavailable instead of selectable implementation copy.");
}
if (/Pediatric logic not enabled/.test(html)) {
  throw new Error("Clinical workup population selector should not expose implementation-style pediatric logic copy.");
}
if (!/id="complaintCdsResults"[\s\S]{0,1200}<details id="examTesterPanel"[\s\S]{0,120}<summary>Reviewer tools<\/summary>/.test(html)) {
  throw new Error("Reviewer audit tools must be nested inside the Clinical workup panel.");
}
for (const requiredSnippet of [
  '<label for="examTesterInput">Reviewer context</label>',
  'placeholder="Selected concern and non-identifying modifiers appear here before the reviewer check."',
  '<label for="examTesterLimitInput">Reviewer item limit</label>',
  'Clear review'
]) {
  if (!html.includes(requiredSnippet)) {
    throw new Error(`Reviewer audit panel should use user-facing clinical copy: ${requiredSnippet}`);
  }
}
if (/Retrieval audit context|Audit candidate limit|Run retrieval audit|Clear audit/.test(html)) {
  throw new Error("Reviewer tools should avoid raw-retrieval control labels in the visible UI.");
}
if (/Compatibility mirror|legacy tests\/session state/.test(html)) {
  throw new Error("Reviewer audit panel should not expose internal compatibility/test language.");
}
if (/Semantic recall:\s*EmbeddingGemma q4|The tester will use structured tags/.test(html)) {
  throw new Error("Reviewer audit recall toggle should avoid model-version and tester copy in the visible UI.");
}
if (/Copy improvement audit|Copy audit workup|Stage as knowledge gap|Knowledge gap staged|Clinical improvement audit copied|Clinical Workup Improvement Audit/.test(html) || /Copy improvement audit|Copy audit workup|Stage as knowledge gap|Knowledge gap staged|Clinical improvement audit copied|Clinical Workup Improvement Audit/.test(moduleScript)) {
  throw new Error("Clinical workup actions should use user-facing review and unsupported-concern language.");
}
const renderClinicalIntentResultsStart = moduleScript.indexOf("function renderClinicalIntentResults()");
const renderClinicalIntentResultsEnd = moduleScript.indexOf("function selectClinicalIntent", renderClinicalIntentResultsStart);
if (renderClinicalIntentResultsStart < 0 || renderClinicalIntentResultsEnd <= renderClinicalIntentResultsStart) {
  throw new Error("Expected clinical intent result renderer not found.");
}
const renderClinicalIntentResultsSource = moduleScript.slice(renderClinicalIntentResultsStart, renderClinicalIntentResultsEnd);
if (/Suppress rules|suppress_rules|rule_id|unless_tags_include/.test(renderClinicalIntentResultsSource)) {
  throw new Error("Normal clinical intent search results should not expose internal suppress-rule details; keep those in reviewer audit exports.");
}
const renderUnifiedEvidenceSummaryStart = moduleScript.indexOf("function renderUnifiedEvidenceSummary(");
const renderUnifiedEvidenceSummaryEnd = moduleScript.indexOf("function renderComplaintCdsResult", renderUnifiedEvidenceSummaryStart);
if (renderUnifiedEvidenceSummaryStart < 0 || renderUnifiedEvidenceSummaryEnd <= renderUnifiedEvidenceSummaryStart) {
  throw new Error("Expected unified evidence summary renderer not found.");
}
const renderUnifiedEvidenceSummarySource = moduleScript.slice(renderUnifiedEvidenceSummaryStart, renderUnifiedEvidenceSummaryEnd);
if (/state\.examTesterCandidates|retrieved candidates|Semantic recall|Evidence retrieval ran/i.test(renderUnifiedEvidenceSummarySource)) {
  throw new Error("Normal clinical workup summary should show curated recommendations, not raw retrieval or model-status language.");
}
if (!/Core physical exam maneuvers[\s\S]*Suppressed\/not-recommended items/.test(renderUnifiedEvidenceSummarySource)) {
  throw new Error("Normal clinical workup summary should expose core exam maneuvers and suppressed/not-recommended items.");
}
if (!/workup gap[\s\S]*reviewer-only catalog item/.test(renderUnifiedEvidenceSummarySource)) {
  throw new Error("Normal clinical workup summary should separate true workup gaps from reviewer-only catalog/audit items.");
}
if (/\$\{catalogGapReviews\.length\}\s*staged gaps/.test(renderUnifiedEvidenceSummarySource)) {
  throw new Error("Normal clinical workup summary must not collapse reviewer-only catalog items into staged workup-gap counts.");
}
const renderWorkupHistoryQuestionStart = moduleScript.indexOf("function renderWorkupHistoryQuestion(");
const renderWorkupHistoryQuestionEnd = moduleScript.indexOf("function renderWorkupManagementFinding", renderWorkupHistoryQuestionStart);
if (renderWorkupHistoryQuestionStart < 0 || renderWorkupHistoryQuestionEnd <= renderWorkupHistoryQuestionStart) {
  throw new Error("Expected focused history question card renderer not found.");
}
if (!/Detail prompts/.test(moduleScript.slice(renderWorkupHistoryQuestionStart, renderWorkupHistoryQuestionEnd))) {
  throw new Error("Focused history question cards should expose concrete detail prompts.");
}
if (!/renderHistoryOptionResponseControls/.test(moduleScript.slice(renderWorkupHistoryQuestionStart, renderWorkupHistoryQuestionEnd))
  || !/Recorded responses/.test(moduleScript.slice(renderWorkupHistoryQuestionStart, renderWorkupHistoryQuestionEnd))) {
  throw new Error("Focused history question cards should allow per-option positive/negative response marks and show recorded responses.");
}
if (!/data-history-option-response/.test(moduleScript) || !/clinicalHistoryOptionResponses/.test(moduleScript)) {
  throw new Error("Focused history option response controls should be stateful and clickable.");
}
if (!/usesSymptomResponseAnswers/.test(moduleScript)
  || !/finding-symptom-response-button/.test(html)
  || !/Answer every component: left \(-\) denied, right \(\+\) endorsed\./.test(moduleScript)
  || !/\(-\) Denied/.test(moduleScript)
  || !/\(\+\) Endorsed/.test(moduleScript)) {
  throw new Error("Checklist bedside symptom-list questions should render explicit per-component denied/endorsed controls.");
}
if (!/phone-concept-symptom-response-button/.test(html)
  || !/phoneConceptSetSymptomResponse/.test(moduleScript)
  || !/Use left \(-\) Deny and right \(\+\) Endorse/.test(moduleScript)
  || !/data-phone-action="response-option"/.test(moduleScript)) {
  throw new Error("Mobile bedside symptom-list questions should support explicit per-symptom -/+ response controls.");
}
if (/>No default<\/option>/.test(html)) {
  throw new Error("Prompt personalization default options should explain that the workflow default will be used.");
}
for (const requiredSnippet of [
  '<option value="">Use workflow default</option>',
  'createExamTesterSummaryChip(`Semantic recall ${examTesterEmbeddingStatusLabel(embeddingStatus)}`',
  'setExamTesterStatus("Loading evidence catalog and semantic recall...");',
  '"Validated Bedside Workup"',
  "Evidence source: validated local evidence catalog, clinical bundle rules, and active modifiers.",
  '"Core physical exam maneuvers"',
  '"Management-changing findings"',
  '"Limitations and interpretation cautions"',
  '"Evidence/LR metadata"',
  '"Suppressed/not-recommended items"',
  '"Catalog gaps needing review"',
  "catalogGapsNeedingReview",
  "staged catalog gap; not accepted evidence",
  "Recommendation-owned staged catalog gaps",
  "## Recommendation-Owned Staged Catalog Gaps",
  "## Base Catalog Audit Candidates",
  "function renderWorkupCatalogGapReview",
  '`Semantic recall status: ${examTesterEmbeddingStatusLabel(state.examEmbeddingStatus || recommendation.embeddingStatus)}`',
  'Unsupported concern logged for this session. Import a reviewed knowledge pack before activating recommendations.',
  '# Clinical Workup Review Audit',
  'Clinical review audit copied.'
]) {
  if (!html.includes(requiredSnippet) && !moduleScript.includes(requiredSnippet)) {
    throw new Error(`Expected polished reviewer/profile copy not found: ${requiredSnippet}`);
  }
}
if (/Loading evidence catalog and EmbeddingGemma|Semantic recall used|Embedding status:/.test(moduleScript)) {
  throw new Error("Reviewer audit status and copied reports should not expose model-specific or implementation-style wording.");
}
const normalWorkupStart = moduleScript.indexOf("function formatExamTesterReport()");
const normalWorkupEnd = moduleScript.indexOf("function formatUnifiedClinicalWorkupReport()", normalWorkupStart);
if (normalWorkupStart < 0 || normalWorkupEnd < 0 || normalWorkupEnd <= normalWorkupStart) {
  throw new Error("Expected normal workup copy formatter not found.");
}
const examTesterStatusTextStart = moduleScript.indexOf("function examTesterStatusText(");
const examTesterStatusTextEnd = moduleScript.indexOf("async function buildUnifiedClinicalWorkup", examTesterStatusTextStart);
if (examTesterStatusTextStart < 0 || examTesterStatusTextEnd <= examTesterStatusTextStart) {
  throw new Error("Expected exam workup status formatter not found.");
}
const examTesterStatusTextSource = moduleScript.slice(examTesterStatusTextStart, examTesterStatusTextEnd);
if (/retrieved evidence candidates|retrieved candidates|Semantic recall|embeddingNote|EmbeddingGemma/i.test(examTesterStatusTextSource)) {
  throw new Error("Normal clinical workup status should avoid retrieval/model implementation language.");
}
const normalWorkupReportSource = moduleScript.slice(normalWorkupStart, normalWorkupEnd);
if (!/const sanitizedExamInput\s*=\s*sanitizeClinicalAuditText\(elements\.examTesterInput\.value\.trim\(\)\)/.test(normalWorkupReportSource)) {
  throw new Error("Normal copied bedside workup should sanitize reviewer/search input before export.");
}
if (/`Input: \$\{(?:concern|elements\.examTesterInput\.value\.trim\(\))/.test(normalWorkupReportSource)) {
  throw new Error("Normal copied workup must not print raw concern or reviewer context text.");
}
if (/Evidence audit \/ retrieved candidates|Top Retrieved Evidence Candidates|\(state\.examTesterCandidates\s*\|\|\s*\[\]\)\.forEach|raw retrieved candidates|Semantic recall:|Reviewer audit:|embedding_score|Retrieval route/.test(normalWorkupReportSource)) {
  throw new Error("Normal copied workup must not include raw retrieved candidates; use the reviewer audit export instead.");
}
if (/rawOnlyGapRows|state\.examTesterGapRows|Base catalog audit candidates|Base Catalog Audit Candidates|catalog_candidate/.test(normalWorkupReportSource)) {
  throw new Error("Normal copied workup must not include base-catalog audit candidates; use the reviewer audit export instead.");
}
const renderComplaintCdsResultStart = moduleScript.indexOf("function renderComplaintCdsResult()");
const renderComplaintCdsResultEnd = moduleScript.indexOf("function renderExamTesterCandidate", renderComplaintCdsResultStart);
if (renderComplaintCdsResultStart < 0 || renderComplaintCdsResultEnd <= renderComplaintCdsResultStart) {
  throw new Error("Expected clinical workup result renderer not found.");
}
const renderComplaintCdsResultSource = moduleScript.slice(renderComplaintCdsResultStart, renderComplaintCdsResultEnd);
if (/hasWorkupEvidence\s*=\s*Boolean\(state\.examTesterRecommendation\s*\|\|\s*state\.examTesterGapRows/.test(renderComplaintCdsResultSource)) {
  throw new Error("Normal clinical workup copy gating must not treat base-catalog gap rows as validated recommendations.");
}
if (/Recommended physical exam maneuvers/.test(normalWorkupReportSource) || !/Core physical exam maneuvers/.test(normalWorkupReportSource)) {
  throw new Error("Normal copied workup should label the selected bedside exam list as core physical exam maneuvers.");
}
if (!/Suppressed\/not-recommended items[\s\S]*Catalog gaps needing review/.test(normalWorkupReportSource)) {
  throw new Error("Normal copied workup should still include suppressed/not-recommended items and catalog gaps needing review.");
}
if (!/Catalog gaps needing review[\s\S]*Gap ID:[\s\S]*Gap status:[\s\S]*Evidence status: staged catalog gap; not accepted evidence[\s\S]*Resolution plan:[\s\S]*Intent trace:/.test(normalWorkupReportSource)) {
  throw new Error("Normal copied workup should include normalized staged catalog-gap metadata and intent trace.");
}
if (!/Focused history questions[\s\S]*Tags:/.test(normalWorkupReportSource)) {
  throw new Error("Normal copied workup should include tags for focused history questions.");
}
if (!/Focused history questions[\s\S]*Detail prompts:/.test(normalWorkupReportSource)) {
  throw new Error("Normal copied workup should expose concrete detail prompts for focused history questions.");
}
if (!/Management-changing findings[\s\S]*Changes management:[\s\S]*Diagnostic target:[\s\S]*Evidence:/.test(normalWorkupReportSource)) {
  throw new Error("Normal copied workup should include traceable management-changing findings.");
}
if (!/Limitations and interpretation cautions[\s\S]*Caution:[\s\S]*Diagnostic target:[\s\S]*Evidence:/.test(normalWorkupReportSource)) {
  throw new Error("Normal copied workup should include traceable limitations and interpretation cautions.");
}
if (!/Evidence\/LR metadata[\s\S]*Evidence source:[\s\S]*LR: \+/.test(normalWorkupReportSource)) {
  throw new Error("Normal copied workup should include traceable Evidence/LR metadata.");
}
const unifiedWorkupReportStart = moduleScript.indexOf("function formatUnifiedClinicalWorkupReport()");
const unifiedWorkupReportEnd = moduleScript.indexOf("function sanitizeClinicalAuditText", unifiedWorkupReportStart);
if (unifiedWorkupReportStart < 0 || unifiedWorkupReportEnd < 0 || unifiedWorkupReportEnd <= unifiedWorkupReportStart) {
  throw new Error("Expected unified clinical workup report formatter not found.");
}
const unifiedWorkupReportSource = moduleScript.slice(unifiedWorkupReportStart, unifiedWorkupReportEnd);
if (!/const sanitizedConcern\s*=\s*sanitizeClinicalAuditText\(concern\)/.test(unifiedWorkupReportSource)) {
  throw new Error("Unified copied clinical workup should sanitize concern text before export.");
}
if (/`Input: \$\{concern\}`/.test(unifiedWorkupReportSource)) {
  throw new Error("Unified copied clinical workup must not print raw concern text.");
}
const reviewAuditStart = moduleScript.indexOf("function formatClinicalImprovementAuditReport()");
const reviewAuditEnd = moduleScript.indexOf("function clearExamTester()", reviewAuditStart);
if (reviewAuditStart < 0 || reviewAuditEnd < 0 || reviewAuditEnd <= reviewAuditStart) {
  throw new Error("Expected clinical workup review audit formatter not found.");
}
const reviewAuditReportSource = moduleScript.slice(reviewAuditStart, reviewAuditEnd);
if (!/Recommendation-owned staged catalog gaps:[\s\S]*Base catalog audit candidates:/.test(reviewAuditReportSource)) {
  throw new Error("Review audit summary should separate staged recommendation gaps from base catalog audit candidates.");
}
if (!/## Recommendation-Owned Staged Catalog Gaps[\s\S]*compactCatalogGapReviewAuditEntry/.test(reviewAuditReportSource)) {
  throw new Error("Review audit should render recommendation-owned staged gaps through the normalized helper.");
}
const catalogGapAuditHelperStart = moduleScript.indexOf("function compactCatalogGapReviewAuditEntry(");
const catalogGapAuditHelperEnd = moduleScript.indexOf("function compactGuidelineAuditEntry(", catalogGapAuditHelperStart);
if (catalogGapAuditHelperStart < 0 || catalogGapAuditHelperEnd < 0 || catalogGapAuditHelperEnd <= catalogGapAuditHelperStart) {
  throw new Error("Expected compact catalog-gap review audit helper not found.");
}
const catalogGapAuditHelperSource = moduleScript.slice(catalogGapAuditHelperStart, catalogGapAuditHelperEnd);
if (!/evidence_status: staged catalog gap; not accepted evidence[\s\S]*resolution_plan:/.test(catalogGapAuditHelperSource)) {
  throw new Error("Review audit should include normalized staged catalog-gap evidence status and resolution plan.");
}
if (/`Catalog gaps: \$\{gapRows\.length\}`|"## Catalog Gaps"/.test(reviewAuditReportSource)) {
  throw new Error("Review audit should not collapse recommendation-owned staged gaps into raw catalog-gap counts.");
}
if (/Advanced JSON|Load JSON into fields|Apply fields to JSON|Submit source text or clinical script|Stage source suggestion|source\/script submission drawer|Suggestion exported and staged locally|No suggestions staged|Suggestion staged|Staged with review issues|legacy evidence metadata|legacy metadata available/.test(html) || /Advanced JSON|Load JSON into fields|Apply fields to JSON|Submit source text or clinical script|Stage source suggestion|source\/script submission drawer|Suggestion exported and staged locally|No suggestions staged|Suggestion staged|Staged with review issues|legacy evidence metadata|legacy metadata available/.test(moduleScript)) {
  throw new Error("Medical knowledge review UI should avoid prototype staging, advanced JSON, and legacy metadata wording.");
}
for (const requiredSnippet of [
  "Suggestion exported and saved locally. Send the downloaded JSON to the maintainer for approval.",
  "No suggestions saved in this browser.",
  "reference evidence metadata",
  "reference metadata available",
  "Suggestion saved.",
  "Saved with review issues"
]) {
  if (!html.includes(requiredSnippet) && !moduleScript.includes(requiredSnippet)) {
    throw new Error(`Expected polished medical knowledge copy not found: ${requiredSnippet}`);
  }
}
for (const requiredSnippet of [
  'label: `Context message ${index + 1}`',
  'const isFinalPacketMessage = flow.index === flow.prompts.length - 1;',
  'const stepLabel = isFinalPacketMessage ? "Final message" : `Context message ${flow.index + 1}`;',
  'elements.packetProgress.textContent = `${stepLabel} (${flow.index + 1}/${flow.prompts.length})`;',
  '"Paste this context message. OpenEvidence should acknowledge it and wait."',
  ': `Copy context message ${flow.index + 1}`;'
]) {
  if (!moduleScript.includes(requiredSnippet)) {
    throw new Error(`Large-source OpenEvidence packet labels should use clear step labels: ${requiredSnippet}`);
  }
}
for (const requiredSnippet of [
  '<details id="demoPanel" class="demo-panel">',
  '<strong>Demo patient</strong>',
  'class="demo-actions"',
  "Load a synthetic diabetic ketoacidosis consult note for training or walkthroughs."
]) {
  if (!html.includes(requiredSnippet)) {
    throw new Error(`Demo sample should stay collapsed as an optional training affordance: ${requiredSnippet}`);
  }
}
if (/<p class="tool-title">\s*Demo\s*<\/p>/.test(html)) {
  throw new Error("Demo sample should not be a prominent default tool-section panel.");
}
for (const requiredSnippet of [
  'id="checklistFormatToolSection" class="tool-section" hidden',
  'checklistFormatToolSection: document.getElementById("checklistFormatToolSection")',
  'function setChecklistFormatToolVisible(isVisible)',
  'elements.checklistFormatToolSection.hidden = !isVisible;',
  'elements.copyPastedCleanupPromptButton.hidden = !isVisible;',
  'setChecklistFormatToolVisible(true);'
]) {
  if (!html.includes(requiredSnippet) && !moduleScript.includes(requiredSnippet)) {
    throw new Error(`Checklist format-fix tool must stay hidden until parser recovery is actionable: ${requiredSnippet}`);
  }
}
if (/copyPastedCleanupPromptButton\.hidden\s*=\s*false/.test(moduleScript)) {
  throw new Error("Checklist format-fix tool should be shown through setChecklistFormatToolVisible(true).");
}
for (const requiredSnippet of [
  "state.auditResult = validateChecklistForCurrentContext(state.sections);",
  "auditResult: state.sections.length ? validateChecklistForCurrentContext(state.sections) : null",
  "const rebuilt = await buildAndApplyLocalBedsideChecklist(elements.copyStatus);",
  "showToast(\"Checklist rechecked locally.\");"
]) {
  if (!moduleScript.includes(requiredSnippet)) {
    throw new Error(`Checklist audit rebuild should recompute local checklist quality with current validator: ${requiredSnippet}`);
  }
}
if (/parsed\.auditResult\s*\|\|\s*validateChecklist\(state\.sections\)/.test(moduleScript)
  || /normalized\.auditResult\s*\|\|\s*validateChecklist\(state\.sections\)/.test(moduleScript)
  || /auditRebuildButton\.addEventListener\([\s\S]{0,240}refineChecklistOpenEvidenceButton\.click\(\)/.test(moduleScript)) {
  throw new Error("Checklist audit restore/rebuild must not reuse stale audit metadata or route local rebuild through OpenEvidence.");
}
if (!/id="runComplaintCdsButton"[\s\S]{0,160}disabled/.test(html)) {
  throw new Error("Clinical workup build must start disabled until a validated intent is selected.");
}
for (const requiredSnippet of [
  "elements.runComplaintCdsButton.disabled = !selected.length;",
  "Select a validated clinical intent before building recommendations.",
  "action.textContent = mappedValidatedIntents.length ? \"Select validated intent\" : \"Needs review\";",
  "Mapped validated clinical intent selected. Add patient modifiers, then build.",
  "Installed medical knowledge matched, but no validated clinical intent is active for it yet.",
  "No validated clinical intent authorized local bedside checklist generation.",
  "Select a validated clinical intent before building a local bedside checklist.",
  "Local checklist will use the installed validated workup only; evidence retrieval did not complete."
]) {
  if (!moduleScript.includes(requiredSnippet)) {
    throw new Error(`Clinical workup must gate recommendations on selected validated intents: ${requiredSnippet}`);
  }
}
if (/runComplaintCdsButton\.disabled\s*=\s*!selected\.length\s*&&/.test(moduleScript)
  || /if\s*\(\s*!selectedIntents\.length\s*&&\s*!knowledgeModule\s*\)/.test(moduleScript)
  || /Installed guideline-backed workup selected|local generic bedside defaults|Generic bedside checklist/.test(moduleScript)) {
  throw new Error("Clinical workup must not allow installed-module-only selection to authorize recommendations.");
}
if (!/elements\.checklistPasteCard\.hidden\s*=\s*!\(bedsideMode\s*\|\|\s*state\.useChecklistOnLaptop\s*\|\|\s*hasChecklistPasteText\(\)\)/.test(moduleScript)) {
  throw new Error("Laptop mode must not show the checklist paste card by default after prompt copy.");
}
const worker = readFileSync("deid-worker.js", "utf8");
if (!/\bcreateDeidentifier\b/.test(worker) || !/from\s+["']\.\/deid\.js(?:\?[^"']+)?["']/.test(worker)) {
  throw new Error("deid-worker.js must run the shared deidentifier from deid.js.");
}

const checklistModule = readFileSync("checklist.js", "utf8");
const deidModule = readFileSync("deid.js", "utf8");
if (/function\s+entityFlags[\s\S]{0,700}rawText\.slice/.test(deidModule)) {
  throw new Error("De-ID entity flags must not replay raw redacted PHI spans.");
}
for (const requiredSnippet of [
  "Parent checklist titles must be the exact all-caps lines above, with no colon.",
  "categoryForChecklistTitle",
  "dashOptionMatch",
  "questionOptionMatch",
  "student_exam_reference",
  "catalog gap for reviewer follow-up",
  "retrieved_evidence_candidates",
  "reviewer-only evidence context",
  "validated_clinical_intents",
  "Do not add unvalidated checklist items as final checklist rows",
  "Local bedside checklist generation contract",
  "Do not ask OpenEvidence or another external system",
  "BEDSIDE QUESTION CHECKLIST",
  "TARGETED PHYSICAL EXAM CHECKLIST"
]) {
  if (!checklistModule.includes(requiredSnippet)) {
    throw new Error(`Expected shared checklist guardrail not found: ${requiredSnippet}`);
  }
}
for (const requiredSnippet of [
  "OpenEvidence review tasks",
  "openEvidenceTaskBoard",
  "openEvidencePastebackInput",
  "Rebuild locally",
  "local answer review"
]) {
  if (!html.includes(requiredSnippet) && !moduleScript.includes(requiredSnippet)) {
    throw new Error(`Expected OpenEvidence review task guardrail not found: ${requiredSnippet}`);
  }
}
for (const deprecatedSnippet of [
  "OpenEvidence Rounds Hub",
  "structured paste-back review"
]) {
  if (html.includes(deprecatedSnippet) || moduleScript.includes(deprecatedSnippet)) {
    throw new Error(`Deprecated OpenEvidence UI wording still present: ${deprecatedSnippet}`);
  }
}

const complaintCdsModule = readFileSync("complaint-cds.js", "utf8");
for (const requiredSnippet of [
  "complaint-cds-artifact-v1",
  "./medical-knowledge-db.js",
  "evaluateComplaintCds",
  "validateComplaintModules",
  "formatComplaintCdsReport"
]) {
  if (!complaintCdsModule.includes(requiredSnippet)) {
    throw new Error(`Expected complaint CDS implementation not found: ${requiredSnippet}`);
  }
}

const medicalKnowledgeDbModule = readFileSync("medical-knowledge-db.js", "utf8");
for (const requiredSnippet of [
  "Generated by scripts/build-medical-knowledge-db.js",
  "medical_knowledge_database_v1",
  "chest_pain_v1",
  "hyperglycemia_possible_dka_v1",
  "AHA_ACC_CHEST_PAIN_2021",
  "ADA_HYPERGLYCEMIC_CRISES_2024"
]) {
  if (!medicalKnowledgeDbModule.includes(requiredSnippet)) {
    throw new Error(`Expected generated medical knowledge database content not found: ${requiredSnippet}`);
  }
}

const medicalKnowledgeBuilder = readFileSync("scripts/build-medical-knowledge-db.js", "utf8");
for (const requiredSnippet of [
  "medical_knowledge_database_v1",
  "validateMedicalKnowledgeDatabase",
  "medical-knowledge-db.js is out of date"
]) {
  if (!medicalKnowledgeBuilder.includes(requiredSnippet)) {
    throw new Error(`Expected medical knowledge builder implementation not found: ${requiredSnippet}`);
  }
}

const clinicalIntentsModule = readFileSync("clinical-intents.js", "utf8");
for (const requiredSnippet of [
  "clinical-intent-registry-v1",
  "clinicalIntentRegistry",
  "dka_hhs_v1",
  "suspected_pe_v1",
  "abdominal_pain_cramping_v1",
  "resolveClinicalIntents",
  "filterEvidenceCatalogForClinicalIntents",
  "buildValidatedClinicalIntentPromptBlock",
  "validateClinicalIntentRegistry",
  "suppress_rules",
  "normalizeClinicalIntentSuppressRules"
]) {
  if (!clinicalIntentsModule.includes(requiredSnippet)) {
    throw new Error(`Expected clinical intent implementation not found: ${requiredSnippet}`);
  }
}

const physicalExamReferencePath = "data/physical-exam/physical_exam_reference.csv";
const physicalExamOverlayPath = "data/physical-exam/physical_exam_evidence_overlay.csv";
const examTechniqueBasePath = "data/evidence/exam_technique_base.csv";
const examEvidenceOverlayPath = "data/evidence/exam_evidence_overlay.csv";
const retrievalTagDictionaryPath = "data/evidence/retrieval_tag_dictionary.csv";
const priorityEnrichmentQueuePath = "data/evidence/priority_enrichment_queue.csv";
const sourceRegistryCsvPath = "data/evidence/source_registry.csv";
const evidenceEvalCasesPath = "data/evidence/evidence_eval_cases.csv";
const evidenceEvalGoldPath = "data/evidence/evidence_eval_gold.csv";

const examReferenceCsv = readFileSync(physicalExamReferencePath, "utf8");
for (const requiredSnippet of [
  "exam_system,section,region_or_subsection,maneuver_or_finding",
  "Visual acuity",
  "Auscultate heart with diaphragm and bell",
  "Patellar grind Clarke test",
  "Stethoscope hygiene"
]) {
  if (!examReferenceCsv.includes(requiredSnippet)) {
    throw new Error(`Expected physical exam CSV reference not found: ${requiredSnippet}`);
  }
}

const evidenceModule = readFileSync("evidence.js", "utf8");
for (const requiredSnippet of [
  "rankEvidenceCandidates",
  "formatEvidenceCandidatesBlock",
  "mergeLegacyPhysicalExamOverlay",
  "legacyOverlay",
  "replaceStudentReferenceWithEvidenceBlock",
  "retrieved_evidence_candidates",
  "review?.status === \"accepted\"",
  "review?.status === \"rejected\"",
  "clinicalRelevance",
  "bedsideFeasibility"
]) {
  if (!evidenceModule.includes(requiredSnippet)) {
    throw new Error(`Expected evidence retrieval implementation not found: ${requiredSnippet}`);
  }
}

const embeddingRecallModule = readFileSync("embedding-recall.js", "utf8");
for (const requiredSnippet of [
  "defaultEmbeddingModelKey = \"embeddinggemma\"",
  "onnx-community/embeddinggemma-300m-ONNX",
  "task: search result | query:",
  "rankEvidenceCandidatesHybrid",
  "Embedding service is required to build an index.",
  "clinical_knowledge_pack_v1",
  "validateClinicalKnowledgePack",
  "embeddingOnly"
]) {
  if (!embeddingRecallModule.includes(requiredSnippet)) {
    throw new Error(`Expected embedding recall implementation not found: ${requiredSnippet}`);
  }
}

const clinicalIterationModule = readFileSync("scripts/iterate-clinical-workups.js", "utf8");
for (const requiredSnippet of [
  "Clinical Workup Iteration Report",
  "missing_required_domain",
  "high_score_suppressed",
  "filterEvidenceCatalogForClinicalIntents"
]) {
  if (!clinicalIterationModule.includes(requiredSnippet)) {
    throw new Error(`Expected clinical workup iteration runner not found: ${requiredSnippet}`);
  }
}

const endocrineWorkupModule = readFileSync("scripts/generate-endocrine-workups.js", "utf8");
for (const requiredSnippet of [
  "Endocrine Diagnosis Workup Automation Report",
  "ADA_SOC_2026",
  "ES_PRIMARY_ALDO_2025",
  "PCOS_GUIDELINE_2023",
  "resolveClinicalIntents"
]) {
  if (!endocrineWorkupModule.includes(requiredSnippet)) {
    throw new Error(`Expected endocrine workup generator not found: ${requiredSnippet}`);
  }
}

const endocrineInstallModule = readFileSync("scripts/install-endocrine-workups.js", "utf8");
for (const requiredSnippet of [
  "Endocrine Workup Completion Report",
  "complaint-modules\", \"endocrine",
  "active_guideline_workup",
  "Expected 37 endocrine workups"
]) {
  if (!endocrineInstallModule.includes(requiredSnippet)) {
    throw new Error(`Expected endocrine workup installer not found: ${requiredSnippet}`);
  }
}

const endocrineKnowledgeTest = readFileSync("scripts/test-endocrine-knowledge.js", "utf8");
for (const requiredSnippet of [
  "database should include all 37 endocrine workup modules",
  "PCOS should include exclusion and criteria anchors",
  "DI should include urine and hypernatremia thresholds"
]) {
  if (!endocrineKnowledgeTest.includes(requiredSnippet)) {
    throw new Error(`Expected endocrine knowledge test guardrail not found: ${requiredSnippet}`);
  }
}

const openEvidenceWorkflowsModule = readFileSync("open-evidence-workflows.js", "utf8");
for (const requiredSnippet of [
  "openEvidenceTasks",
  "buildOpenEvidencePrompt",
  "initial_rounds_report",
  "final_rounds_update",
  "medication_safety",
  "confirm_guideline",
  "find_exception",
  "attending_plan",
  "teaching_explanation",
  "discharge_checklist",
  "what_am_i_missing"
]) {
  if (!openEvidenceWorkflowsModule.includes(requiredSnippet)) {
    throw new Error(`Expected OpenEvidence workflow registry guardrail not found: ${requiredSnippet}`);
  }
}
for (const removedChecklistTask of ["generate_checklist", "refine_checklist"]) {
  if (openEvidenceWorkflowsModule.includes(removedChecklistTask)) {
    throw new Error(`Bedside checklist task must remain local, not in OpenEvidence registry: ${removedChecklistTask}`);
  }
}

const openEvidenceResultsModule = readFileSync("open-evidence-results.js", "utf8");
for (const requiredSnippet of [
  "open-evidence-task-result-v1",
  "parseOpenEvidenceResult",
  "normalizeOpenEvidenceTaskResult",
  "extractCitations",
  "checklistText",
  "acceptedSummary"
]) {
  if (!openEvidenceResultsModule.includes(requiredSnippet)) {
    throw new Error(`Expected OpenEvidence paste-back parser guardrail not found: ${requiredSnippet}`);
  }
}

const requestedBaseCsv = readFileSync(examTechniqueBasePath, "utf8");
if (requestedBaseCsv !== examReferenceCsv) {
  throw new Error(`${examTechniqueBasePath} must be an unchanged copy of ${physicalExamReferencePath}.`);
}

const requestedOverlayCsv = readFileSync(examEvidenceOverlayPath, "utf8");
const requestedTagDictionaryCsv = readFileSync(retrievalTagDictionaryPath, "utf8");
const requestedQueueCsv = readFileSync(priorityEnrichmentQueuePath, "utf8");
const sourceRegistryCsv = readFileSync(sourceRegistryCsvPath, "utf8");
const evidenceEvalCasesCsv = readFileSync(evidenceEvalCasesPath, "utf8");
const evidenceEvalGoldCsv = readFileSync(evidenceEvalGoldPath, "utf8");
for (const [fileName, csvText, snippets] of [
  [examEvidenceOverlayPath, requestedOverlayCsv, ["base_row_fingerprint", "bedside_question_label", "result_changes_management", "retrieval_tags"]],
  [retrievalTagDictionaryPath, requestedTagDictionaryCsv, ["thyroid_disease", "hypovolemia", "inpatient_diabetes", "pituitary_sellar"]],
  [priorityEnrichmentQueuePath, requestedQueueCsv, ["exam_id", "base_row_number", "priority_reason", "planned_sources"]],
  [sourceRegistryCsvPath, sourceRegistryCsv, ["SM25", "JAMA_RCE", "MCGEE_EBPD", "AHRQ_CALIBRATE_DX"]],
  [evidenceEvalCasesPath, evidenceEvalCasesCsv, ["dx_dka_hhs", "dx_suspected_pe", "cv_chest_pain", "psych_malaise"]],
  [evidenceEvalGoldPath, evidenceEvalGoldCsv, ["expected_core_labels", "dx_dka_hhs", "dx_suspected_pe", "avoid_labels"]]
]) {
  for (const snippet of snippets) {
    if (!csvText.includes(snippet)) {
      throw new Error(`Expected ${fileName} reference not found: ${snippet}`);
    }
  }
}

function parseCsvRow(line) {
  const fields = [];
  let value = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        value += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  fields.push(value);
  return fields;
}

function parseCsvForValidation(csvText, fileName) {
  const lines = String(csvText || "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    throw new Error(`${fileName} must include a header and at least one data row.`);
  }
  const headers = parseCsvRow(lines[0]);
  const rows = lines.slice(1).map((line, rowIndex) => {
    const fields = parseCsvRow(line);
    if (fields.length !== headers.length) {
      throw new Error(`${fileName} row ${rowIndex + 2} has ${fields.length} fields but expected ${headers.length}.`);
    }
    return headers.reduce((row, header, index) => {
      row[header] = fields[index] || "";
      return row;
    }, {});
  });
  return { headers, rows };
}

function assertInSet(value, allowed, label) {
  if (!allowed.has(value)) {
    throw new Error(`${label} has invalid value "${value}".`);
  }
}

function assertNumeric(value, label, { required = true, min = -Infinity, max = Infinity } = {}) {
  if (!value && !required) {
    return;
  }
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label} must be numeric between ${min} and ${max}; got "${value}".`);
  }
}

const examReference = parseCsvForValidation(examReferenceCsv, physicalExamReferencePath);
if (!examReference.headers.includes("exam_id")) {
  throw new Error(`${physicalExamReferencePath} must include exam_id.`);
}
if (examReference.rows.length !== 187) {
  throw new Error(`Expected 187 physical exam reference rows, got ${examReference.rows.length}.`);
}

const examIds = new Set();
for (const [index, row] of examReference.rows.entries()) {
  if (!row.exam_id) {
    throw new Error(`${physicalExamReferencePath} row ${index + 2} is missing exam_id.`);
  }
  if (examIds.has(row.exam_id)) {
    throw new Error(`Duplicate exam_id in ${physicalExamReferencePath}: ${row.exam_id}`);
  }
  examIds.add(row.exam_id);
}

const overlayCsv = readFileSync(physicalExamOverlayPath, "utf8");
const overlay = parseCsvForValidation(overlayCsv, physicalExamOverlayPath);
const expectedOverlayHeaders = [
  "exam_id",
  "condition_or_syndrome",
  "diagnostic_target",
  "when_to_use_structured",
  "result_changes_management",
  "management_link",
  "evidence_source_primary",
  "source_url_or_pubmed",
  "LR_plus",
  "LR_minus",
  "evidence_tier",
  "difficulty",
  "time_burden_minutes",
  "equipment_needed",
  "care_setting",
  "contraindications_or_limitations",
  "retrieval_tags",
  "actionability_score_seed",
  "evidence_status",
  "evidence_summary",
  "last_reviewed"
];
if (overlay.headers.join(",") !== expectedOverlayHeaders.join(",")) {
  throw new Error(`${physicalExamOverlayPath} has an unexpected header order.`);
}
if (overlay.rows.length !== examReference.rows.length) {
  throw new Error(`${physicalExamOverlayPath} must have one row per base exam row.`);
}

const overlayIds = new Set();
const allowedStatuses = new Set(["curated", "public_lr_unavailable", "pending"]);
const allowedTiers = new Set(["rce_or_meta_analysis", "systematic_review", "guideline", "teaching_reference", "expert_consensus", "insufficient_public_evidence"]);
const allowedDifficulties = new Set(["low", "medium", "high"]);

for (const [index, row] of overlay.rows.entries()) {
  const rowLabel = `${physicalExamOverlayPath} row ${index + 2} (${row.exam_id || "missing exam_id"})`;
  if (!examIds.has(row.exam_id)) {
    throw new Error(`${rowLabel} does not match any base exam_id.`);
  }
  if (overlayIds.has(row.exam_id)) {
    throw new Error(`Duplicate exam_id in ${physicalExamOverlayPath}: ${row.exam_id}`);
  }
  overlayIds.add(row.exam_id);
  if (!row.retrieval_tags) {
    throw new Error(`${rowLabel} is missing retrieval_tags.`);
  }
  if (!row.equipment_needed || !row.care_setting || !row.time_burden_minutes) {
    throw new Error(`${rowLabel} is missing feasibility metadata.`);
  }
  assertInSet(row.evidence_status, allowedStatuses, `${rowLabel} evidence_status`);
  assertInSet(row.evidence_tier, allowedTiers, `${rowLabel} evidence_tier`);
  assertInSet(row.difficulty, allowedDifficulties, `${rowLabel} difficulty`);
  assertNumeric(row.time_burden_minutes, `${rowLabel} time_burden_minutes`, { min: 0.1, max: 20 });
  assertNumeric(row.actionability_score_seed, `${rowLabel} actionability_score_seed`, { min: 0, max: 10 });
  assertNumeric(row.LR_plus, `${rowLabel} LR_plus`, { required: false, min: 0, max: 100 });
  assertNumeric(row.LR_minus, `${rowLabel} LR_minus`, { required: false, min: 0, max: 100 });
  if (row.evidence_status !== "pending" && (!row.evidence_source_primary || !row.source_url_or_pubmed || !row.evidence_summary || !row.last_reviewed)) {
    throw new Error(`${rowLabel} has evidence metadata status but lacks source, summary, or review date.`);
  }
  if (row.evidence_status === "pending" && row.last_reviewed) {
    throw new Error(`${rowLabel} should not have last_reviewed while pending.`);
  }
}

if (overlayIds.size !== examIds.size) {
  throw new Error("Overlay/base exam_id sets differ.");
}

const evidenceRows = overlay.rows.filter((row) => row.evidence_status !== "pending");
if (evidenceRows.length !== 75) {
  throw new Error(`Expected exactly 75 evidence-populated overlay rows, got ${evidenceRows.length}.`);
}

const baseById = new Map(examReference.rows.map((row) => [row.exam_id, row]));
const evidenceCountsBySystem = new Map();
for (const row of evidenceRows) {
  const system = baseById.get(row.exam_id)?.exam_system || "Unknown";
  evidenceCountsBySystem.set(system, (evidenceCountsBySystem.get(system) || 0) + 1);
}
if (evidenceCountsBySystem.get("Cardiopulmonary") !== 28 || evidenceCountsBySystem.get("Abdomen") !== 13 || evidenceCountsBySystem.get("Neuro") !== 34) {
  throw new Error(`Evidence tranche must be 28 cardiopulmonary, 13 abdomen, and 34 neuro rows; got ${JSON.stringify(Object.fromEntries(evidenceCountsBySystem))}.`);
}

for (const requiredEvidenceSnippet of [
  "cardiopulmonary_vascular_exam_neck_jvp",
  "cardiopulmonary_cardiac_exam_auscultation_auscultate_heart_with_diaphragm_and_bell",
  "abdomen_advanced_maneuvers_ruq_murphy_sign",
  "abdomen_advanced_maneuvers_appendicitis_psoas_sign",
  "abdomen_advanced_maneuvers_cva_cva_tenderness",
  "2.47",
  "11",
  "2.8",
  "2.38",
  "1.3"
]) {
  if (!overlayCsv.includes(requiredEvidenceSnippet)) {
    throw new Error(`Expected evidence overlay reference not found: ${requiredEvidenceSnippet}`);
  }
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
