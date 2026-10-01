// Pure presentation for the Sample Notes test data tab. No DOM, no storage,
// no network: every renderer takes data in and returns an HTML string.
// The controller in ./controller.js owns expand state, the active section
// per chart, and all actions.
//
// Each fixture is a full synthetic chart: the note plus labs, medications,
// vitals, and imaging sections. Tabs hide any section a fixture does not
// have (the clinic fixture has no imaging).
//
// Chart text builders (buildSectionText / buildChartText) are top level
// exports so the controller and the fixture tests can use them without a
// presentation instance. Every section text carries the patient header
// line so copied or loaded text keeps testing the de-identification
// pipeline.

export function availableSections(note) {
  const out = [{ key: "note", label: "Note" }];
  if (Array.isArray(note.labs) && note.labs.length) out.push({ key: "labs", label: "Labs" });
  if (Array.isArray(note.medications) && note.medications.length) out.push({ key: "medications", label: "Medications" });
  if (Array.isArray(note.vitals) && note.vitals.length) out.push({ key: "vitals", label: "Vitals" });
  if (Array.isArray(note.imaging) && note.imaging.length) out.push({ key: "imaging", label: "Imaging" });
  return out;
}

export function resolveSection(note, requested) {
  const keys = availableSections(note).map((s) => s.key);
  return keys.includes(requested) ? requested : "note";
}

function patientLine(note) {
  const p = (note && note.patient) || {};
  const bits = [];
  if (String(p.name || "").trim()) bits.push(`Patient: ${String(p.name).trim()}`);
  if (String(p.dob || "").trim()) bits.push(`DOB: ${String(p.dob).trim()}`);
  if (String(p.mrn || "").trim()) bits.push(`MRN: ${String(p.mrn).trim()}`);
  return bits.join("    ");
}

function labsSectionText(note) {
  const lines = ["LABORATORY RESULTS", patientLine(note), ""];
  for (const panel of note.labs || []) {
    lines.push(`${panel.panel}, collected ${panel.collected}`);
    for (const t of panel.tests || []) {
      const flag = t.flag ? ` [${t.flag}]` : "";
      const units = t.units ? ` ${t.units}` : "";
      const ref = t.ref ? ` (ref ${t.ref})` : "";
      lines.push(`${t.name}: ${t.value}${units}${flag}${ref}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function medicationsSectionText(note) {
  const lines = ["MEDICATIONS", patientLine(note), ""];
  for (const m of note.medications || []) {
    lines.push(`${m.name} ${m.dose} ${m.route}, ${m.frequency} [${m.status}]`);
  }
  return lines.join("\n");
}

function vitalsSectionText(note) {
  const lines = ["VITAL SIGNS", patientLine(note), "", "Time | Temp (F) | HR | BP | RR | SpO2 | Pain"];
  for (const v of note.vitals || []) {
    lines.push(
      [v.time, v.temp, v.hr, v.bp, v.rr, v.spo2, v.pain]
        .map((x) => String(x ?? ""))
        .join(" | ")
    );
  }
  return lines.join("\n");
}

function imagingSectionText(note) {
  const lines = ["IMAGING REPORTS", patientLine(note), ""];
  for (const img of note.imaging || []) {
    lines.push(`${img.title} (${img.modality}), ${img.date}`);
    lines.push(String(img.body || ""));
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export function buildSectionText(note, section) {
  if (!note) return "";
  switch (section) {
    case "labs":
      return labsSectionText(note);
    case "medications":
      return medicationsSectionText(note);
    case "vitals":
      return vitalsSectionText(note);
    case "imaging":
      return imagingSectionText(note);
    default:
      return String(note.body || "");
  }
}

export function buildChartText(note) {
  if (!note) return "";
  const parts = [String(note.body || "").trimEnd()];
  for (const s of availableSections(note)) {
    if (s.key === "note") continue;
    parts.push(buildSectionText(note, s.key));
  }
  return parts.filter(Boolean).join("\n\n");
}

export function createSampleNotesPresentation({ escapeHtml, icon }) {
  const PREVIEW_LINES = 8;

  function previewText(body, expanded) {
    const text = String(body || "");
    if (expanded) return text;
    const lines = text.split("\n");
    if (lines.length <= PREVIEW_LINES) return text;
    return lines.slice(0, PREVIEW_LINES).join("\n");
  }

  function renderBanner() {
    return `
      <div class="notice sample-notes-banner" role="note">
        <strong>Synthetic test data — no real patients.</strong>
        <p class="muted">Every chart on this page is fictional and was written for testing. Names, dates, addresses, and record numbers are invented. Use these charts to exercise de-identification and review flows without touching real patient data.</p>
      </div>
    `;
  }

  function copyButton(noteId, section, label) {
    return `
      <button class="button--quiet" type="button" data-action="sample-notes-copy-section" data-note-id="${escapeHtml(noteId)}" data-section="${escapeHtml(section)}">
        ${icon("copy")} ${escapeHtml(label)}
      </button>
    `;
  }

  function renderTabs(note, activeSection) {
    const buttons = availableSections(note)
      .map((s) => {
        const selected = s.key === activeSection;
        return `
          <button type="button" role="tab" aria-selected="${selected ? "true" : "false"}"
            class="sample-note-tab${selected ? " sample-note-tab--active" : ""}"
            data-action="sample-notes-section" data-note-id="${escapeHtml(note.id)}" data-section="${s.key}">
            ${escapeHtml(s.label)}
          </button>
        `;
      })
      .join("");
    return `<div class="sample-note-tabs" role="tablist" aria-label="Chart sections">${buttons}</div>`;
  }

  function renderNoteSection(note, expanded) {
    const full = previewText(note.body, expanded);
    const truncated = !expanded && String(note.body || "").split("\n").length > PREVIEW_LINES;
    return `
      <div class="sample-section-head">
        <h4>Note</h4>
        ${copyButton(note.id, "note", "Copy note")}
      </div>
      <pre class="sample-note-preview" aria-label="Note preview">${escapeHtml(full)}${truncated ? "\n…" : ""}</pre>
    `;
  }

  function renderLabsSection(note) {
    const panels = (note.labs || [])
      .map((panel) => {
        const rows = (panel.tests || [])
          .map((t) => {
            const flag = String(t.flag || "").toUpperCase();
            const flagged = flag === "H" || flag === "L";
            return `
              <tr>
                <td>${escapeHtml(t.name)}</td>
                <td class="${flagged ? "sample-flag" : ""}">${escapeHtml(String(t.value ?? ""))}</td>
                <td>${escapeHtml(t.units || "")}</td>
                <td class="${flagged ? "sample-flag" : ""}">${escapeHtml(flag)}</td>
                <td class="muted">${escapeHtml(t.ref || "")}</td>
              </tr>
            `;
          })
          .join("");
        return `
          <div class="sample-lab-panel">
            <div class="sample-section-subhead">
              <h4>${escapeHtml(panel.panel)}</h4>
              <span class="muted">${escapeHtml(panel.collected || "")}</span>
            </div>
            <div class="sample-table-wrap">
              <table class="sample-chart-table">
                <thead><tr><th>Test</th><th>Result</th><th>Units</th><th>Flag</th><th>Reference</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
        `;
      })
      .join("");
    return `
      <div class="sample-section-head">
        <h4>Labs</h4>
        ${copyButton(note.id, "labs", "Copy labs")}
      </div>
      ${panels}
    `;
  }

  function renderMedicationsSection(note) {
    const rows = (note.medications || [])
      .map(
        (m) => `
          <tr>
            <td>${escapeHtml(m.name)}</td>
            <td>${escapeHtml(m.dose)}</td>
            <td>${escapeHtml(m.route)}</td>
            <td>${escapeHtml(m.frequency)}</td>
            <td>${escapeHtml(m.status)}</td>
          </tr>
        `
      )
      .join("");
    return `
      <div class="sample-section-head">
        <h4>Medications</h4>
        ${copyButton(note.id, "medications", "Copy medications")}
      </div>
      <div class="sample-table-wrap">
        <table class="sample-chart-table">
          <thead><tr><th>Medication</th><th>Dose</th><th>Route</th><th>Frequency</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderVitalsSection(note) {
    const rows = (note.vitals || [])
      .map(
        (v) => `
          <tr>
            <td>${escapeHtml(v.time)}</td>
            <td>${escapeHtml(v.temp || "")}</td>
            <td>${escapeHtml(v.hr || "")}</td>
            <td>${escapeHtml(v.bp || "")}</td>
            <td>${escapeHtml(v.rr || "")}</td>
            <td>${escapeHtml(v.spo2 || "")}</td>
            <td>${escapeHtml(v.pain || "")}</td>
          </tr>
        `
      )
      .join("");
    return `
      <div class="sample-section-head">
        <h4>Vitals</h4>
        ${copyButton(note.id, "vitals", "Copy vitals")}
      </div>
      <div class="sample-table-wrap">
        <table class="sample-chart-table">
          <thead><tr><th>Time</th><th>Temp (F)</th><th>HR</th><th>BP</th><th>RR</th><th>SpO2</th><th>Pain</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderImagingSection(note) {
    const reports = (note.imaging || [])
      .map(
        (img) => `
          <div class="sample-imaging-report">
            <div class="sample-section-subhead">
              <h4>${escapeHtml(img.title)}</h4>
              <span class="muted">${escapeHtml(img.modality)} · ${escapeHtml(img.date)}</span>
            </div>
            <pre class="sample-note-preview" aria-label="Imaging report">${escapeHtml(img.body)}</pre>
          </div>
        `
      )
      .join("");
    return `
      <div class="sample-section-head">
        <h4>Imaging</h4>
        ${copyButton(note.id, "imaging", "Copy imaging")}
      </div>
      ${reports}
    `;
  }

  function renderSection(note, section, expanded) {
    switch (section) {
      case "labs":
        return renderLabsSection(note);
      case "medications":
        return renderMedicationsSection(note);
      case "vitals":
        return renderVitalsSection(note);
      case "imaging":
        return renderImagingSection(note);
      default:
        return renderNoteSection(note, expanded);
    }
  }

  function humanizeTag(tag) {
    return String(tag || "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim();
  }

  // "Try with this chart": what the chart exercises across the app. Renders
  // defensively — older fixtures without coverage metadata simply show
  // nothing here.
  function renderCoverage(note) {
    const coverage = note && typeof note.coverage === "object" ? note.coverage : null;
    if (!coverage) return "";
    const groups = [];
    const calculators = Array.isArray(coverage.calculators) ? coverage.calculators.filter(Boolean) : [];
    if (calculators.length) {
      groups.push(`
        <div class="sample-note-coverage-group">
          <span class="sample-note-coverage-label">Calculators</span>
          <span class="sample-note-coverage-tags">${calculators.map((tag) => `<span class="sample-note-tag">${escapeHtml(humanizeTag(tag))}</span>`).join("")}</span>
        </div>`);
    }
    const sheets = Array.isArray(coverage.cheatSheets) ? coverage.cheatSheets.filter(Boolean) : [];
    if (sheets.length) {
      groups.push(`
        <div class="sample-note-coverage-group">
          <span class="sample-note-coverage-label">Cheat sheets</span>
          <span class="sample-note-coverage-tags">${sheets.map((tag) => `<span class="sample-note-tag">${escapeHtml(humanizeTag(tag))}</span>`).join("")}</span>
        </div>`);
    }
    const interactions = Array.isArray(coverage.drugInteractions) ? coverage.drugInteractions.filter(Boolean) : [];
    if (interactions.length) {
      groups.push(`
        <div class="sample-note-coverage-group">
          <span class="sample-note-coverage-label">Drug interactions</span>
          <ul class="sample-note-coverage-list">${interactions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </div>`);
    }
    if (!groups.length) return "";
    return `
      <div class="sample-note-coverage">
        <div class="sample-note-coverage-title">Try with this chart</div>
        ${groups.join("")}
      </div>
    `;
  }

  function renderCard(note, expanded, activeSection, importingId) {
    const id = escapeHtml(note.id);
    const section = resolveSection(note, activeSection);
    const importing = importingId != null && String(importingId) === String(note.id);
    const body = expanded
      ? `${renderTabs(note, section)}${renderSection(note, section, expanded)}`
      : renderNoteSection(note, false);
    return `
      <article class="panel sample-note-card" data-sample-note-card="${id}">
        <div class="section-heading sample-note-heading">
          <div>
            <h3>${escapeHtml(note.title)}</h3>
            <p class="muted">${escapeHtml(note.description || "")}</p>
          </div>
          <span class="sample-note-type-badge">${escapeHtml(note.type || "Note")}</span>
        </div>
        ${body}
        ${renderCoverage(note)}
        <div class="button-row sample-note-actions">
          <button class="button--quiet" type="button" data-action="sample-notes-toggle" data-note-id="${id}">
            ${icon(expanded ? "chevron" : "plus")} ${expanded ? "Collapse" : "Show full chart"}
          </button>
          <button class="button--primary" type="button" data-action="sample-notes-add" data-note-id="${id}"${importing ? " disabled" : ""}>
            ${icon("plus")} ${importing ? "Adding to vault…" : "Add to vault"}
          </button>
          <button class="button--secondary" type="button" data-action="sample-notes-use" data-note-id="${id}">
            ${icon("wand")} Use in Quick De-ID
          </button>
          <button class="button--quiet" type="button" data-action="sample-notes-copy" data-note-id="${id}">
            ${icon("copy")} Copy full chart
          </button>
        </div>
      </article>
    `;
  }

  function renderSampleNotes({ notes, expandedId, sections, importingId, addAllRunning }) {
    const cards = (notes || [])
      .map((note) => renderCard(note, expandedId === note.id, sections ? sections[note.id] : undefined, importingId))
      .join("");
    return `
      <section class="panel sample-notes-panel">
        <div class="section-heading">
          <div>
            <h2>Sample Notes</h2>
            <p class="muted">Fictional patient charts for end to end testing. Expand a chart to browse its note, labs, medications, vitals, and imaging. Add a chart to your vault to get a fully de-identified patient you can round on, or load the full chart into Quick De-ID.</p>
          </div>
          <button class="button--secondary" type="button" data-action="sample-notes-add-all"${addAllRunning ? " disabled" : ""}>
            ${icon("plus")} ${addAllRunning ? "Adding charts…" : "Add all to vault"}
          </button>
        </div>
        ${renderBanner()}
        <div class="sample-notes-list">
          ${cards}
        </div>
      </section>
    `;
  }

  function renderEmpty() {
    return `
      <section class="panel sample-notes-panel">
        <div class="section-heading">
          <div>
            <h2>Sample Notes</h2>
          </div>
        </div>
        ${renderBanner()}
        <div class="notice">
          <strong>No sample notes available</strong>
          <p class="muted">The bundled test data could not be loaded. Rebuild it with the sample notes data build script and reload.</p>
        </div>
      </section>
    `;
  }

  return Object.freeze({ renderSampleNotes, renderEmpty });
}
