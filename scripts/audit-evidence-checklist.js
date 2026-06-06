import { readFileSync } from "node:fs";
import { auditChecklistForCase, loadEvaluationFixtures } from "./evidence-eval.js";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--case-id") {
      args.caseId = argv[++index];
    } else if (arg === "--checklist-file") {
      args.checklistFile = argv[++index];
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function usage() {
  return `Usage:
  node scripts/audit-evidence-checklist.js --case-id dx_suspected_pe --checklist-file checklist.txt
  type checklist.txt | node scripts/audit-evidence-checklist.js --case-id dx_suspected_pe --json
`;
}

function formatAudit(audit) {
  const lines = [
    `# OpenEvidence Checklist Audit: ${audit.caseId}`,
    "",
    `Presentation: ${audit.presentation}`,
    `Pass: ${audit.pass ? "yes" : "no"}`,
    "",
    `Included expected: ${audit.includedExpected.join("; ") || "none"}`,
    `Included acceptable: ${audit.includedAcceptable.join("; ") || "none"}`,
    `Missed core: ${audit.missedCore.join("; ") || "none"}`,
    `Avoid hits: ${audit.avoidHits.join("; ") || "none"}`,
    `Untraceable exam labels: ${audit.untraceable.join("; ") || "none"}`,
    "",
    "Traceable exam labels:",
    ...audit.traceable.map((item) => `- ${item.label} -> ${item.exam_id}${item.source ? ` (${item.source})` : ""}`)
  ];
  return `${lines.join("\n")}\n`;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.caseId) {
  process.stdout.write(usage());
  process.exit(args.help ? 0 : 1);
}

const checklistText = args.checklistFile
  ? readFileSync(args.checklistFile, "utf8")
  : readFileSync(0, "utf8");

const audit = auditChecklistForCase({
  caseId: args.caseId,
  checklistText,
  fixtures: loadEvaluationFixtures()
});

process.stdout.write(args.json ? `${JSON.stringify(audit, null, 2)}\n` : formatAudit(audit));
process.exit(audit.pass ? 0 : 2);
