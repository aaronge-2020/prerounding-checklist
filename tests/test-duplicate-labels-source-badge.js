import assert from "node:assert/strict";
import { disambiguatedPatientLabels } from "../src/ui/vault/presentation.js";
import { createDailyPresentation } from "../src/ui/daily/presentation.js";

// Duplicate patient labels are disambiguated so the roster/switcher never
// shows two indistinguishable rows.
{
  const patients = [
    { id: "patient-aaa-1111", displayLabel: "Room 4", createdAt: "2026-09-20T10:00:00" },
    { id: "patient-bbb-2222", displayLabel: "Room 4", createdAt: "2026-09-21T10:00:00" },
    { id: "patient-ccc-3333", displayLabel: "Room 5", createdAt: "2026-09-21T10:00:00" }
  ];
  const labels = disambiguatedPatientLabels(patients);
  assert.equal(labels.get("patient-ccc-3333"), "Room 5", "unique labels stay untouched");
  const first = labels.get("patient-aaa-1111");
  const second = labels.get("patient-bbb-2222");
  assert.notEqual(first, second, "duplicate labels must differ");
  assert.ok(/added/.test(first) && /added/.test(second), `date suffix expected: ${first} / ${second}`);

  // Same label AND same creation date falls back to a short id suffix.
  const twins = [
    { id: "patient-aaa-1111", displayLabel: "Room 4", createdAt: "2026-09-21T10:00:00" },
    { id: "patient-bbb-2222", displayLabel: "Room 4", createdAt: "2026-09-21T10:00:00" }
  ];
  const twinLabels = disambiguatedPatientLabels(twins);
  assert.notEqual(twinLabels.get("patient-aaa-1111"), twinLabels.get("patient-bbb-2222"), "same-day duplicates need the id fallback");
}

// The required-source badge names the missing source types, not just a count.
{
  const daily = createDailyPresentation({ escapeHtml: (s) => String(s), icon: () => "" });
  const day = {
    id: "day-1",
    label: "HD1",
    date: "2026-09-24",
    sourceCaptures: [],
    primaryTeamNote: null
  };
  const html = daily.renderDayRow(day, "day-1", 0);
  assert.ok(/required/.test(html), "badge must flag missing required sources");
  assert.ok(!/!\s*1 required\s*</.test(html), "badge must not be a bare count");
  assert.ok(/Laboratory|Medication|Vital/i.test(html), `badge must name the missing source type: ${html.slice(0, 200)}`);

  const completeDay = {
    id: "day-2",
    label: "HD2",
    date: "2026-09-24",
    sourceCaptures: [
      { sourceKind: "laboratory_results", deidentifiedText: "WBC 8.8" },
      { sourceKind: "vital_signs", deidentifiedText: "BP 120/80" },
      { sourceKind: "medication_activity", deidentifiedText: "Lisinopril" },
      { sourceKind: "primary_note", deidentifiedText: "note" }
    ],
    primaryTeamNote: null
  };
  const completeHtml = daily.renderDayRow(completeDay, "day-2", 1);
  assert.ok(/Required saved/.test(completeHtml), "complete days show the saved badge");
}

console.log("duplicate labels + required-source badge: OK");
