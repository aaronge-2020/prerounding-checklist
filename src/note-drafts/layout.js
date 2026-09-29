// Note section layout: pure helpers for reordering, hiding, adding, and
// templating the Draft Note's sections. No DOM or storage here — the review
// controller owns events and the vault owns persistence.
//
// Section ids match the editor's existing data-draft-section-id slugs so
// collapse state and controller queries keep working.
export const LAYOUT_SCHEMA = "note_layout_v1";
export const TEMPLATE_SCHEMA = "note_layout_template_v1";

// Note-type ids duplicated from note-drafts/model.js to avoid a module cycle
// (model.js imports this module for layout normalization).
const HP = "hp";
const PROGRESS = "progress";

const SHARED_TAIL = Object.freeze([
  "physical-exam",
  "objective",
  "assessment",
  "plan",
  "fen",
  "ins-outs",
  "vte-prophylaxis",
  "code-status",
  "disposition",
  "medication-regimens",
  "medications"
]);

export const DEFAULT_SECTION_ORDER = Object.freeze({
  [HP]: Object.freeze([
    "one-liner",
    "chief-complaint",
    "history-of-present-illness",
    "review-of-systems",
    "relevant-history",
    "diet-and-exercise",
    ...SHARED_TAIL
  ]),
  [PROGRESS]: Object.freeze([
    "one-liner",
    "subjective",
    ...SHARED_TAIL
  ])
});

// Sections that only exist for one note type. Used to drop stale ids when
// the note type changes or a template is applied cross-type.
const TYPE_SPECIFIC_SECTIONS = Object.freeze({
  [HP]: Object.freeze(new Set([
    "chief-complaint",
    "history-of-present-illness",
    "review-of-systems",
    "relevant-history",
    "diet-and-exercise"
  ])),
  [PROGRESS]: Object.freeze(new Set(["subjective"]))
});

function cleanText(value) {
  return String(value ?? "").trim();
}

function createLocalId(prefix = "id") {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

function isCustomSectionId(id) {
  return String(id || "").startsWith("custom_");
}

export function defaultSectionOrder(noteType) {
  return [...(DEFAULT_SECTION_ORDER[noteType] || DEFAULT_SECTION_ORDER[PROGRESS])];
}

// Normalize a persisted layout: unknown ids are dropped (except custom
// sections, which are validated against the custom list), missing ids are
// appended in default order, hidden is sanitized, custom entries need labels.
export function normalizeLayout(layout, noteType) {
  const defaults = defaultSectionOrder(noteType);
  const source = layout && typeof layout === "object" ? layout : {};
  const slugify = (value) => cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "section";
  const custom = (Array.isArray(source.custom) ? source.custom : [])
    .filter((entry) => entry && typeof entry === "object" && cleanText(entry.label))
    .map((entry) => ({
      // Deterministic fallback id so normalization is stable across loads.
      id: isCustomSectionId(entry.id) ? String(entry.id) : `custom_${slugify(entry.label)}`,
      label: cleanText(entry.label).slice(0, 80)
    }));
  const customIds = new Set(custom.map((entry) => entry.id));
  // Dedupe ids that appear twice under different generated ids but same label.
  const seenLabels = new Set();
  const dedupedCustom = custom.filter((entry) => {
    const key = entry.label.toLowerCase();
    if (seenLabels.has(key)) return false;
    seenLabels.add(key);
    return true;
  });
  const validIds = new Set([...defaults, ...dedupedCustom.map((entry) => entry.id)]);
  const order = [];
  const seen = new Set();
  for (const id of Array.isArray(source.order) ? source.order : []) {
    const key = cleanText(id);
    if (!key || seen.has(key) || !validIds.has(key)) continue;
    // Drop sections that belong to the other note type.
    if (TYPE_SPECIFIC_SECTIONS[HP]?.has(key) && noteType !== HP) continue;
    if (TYPE_SPECIFIC_SECTIONS[PROGRESS]?.has(key) && noteType !== PROGRESS) continue;
    seen.add(key);
    order.push(key);
  }
  for (const id of [...defaults, ...dedupedCustom.map((entry) => entry.id)]) {
    if (!seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }
  const hidden = (Array.isArray(source.hidden) ? source.hidden : [])
    .map(cleanText)
    .filter((id) => id && validIds.has(id) && !isCustomSectionId(id));
  return { schema: LAYOUT_SCHEMA, order, hidden, custom: dedupedCustom };
}

export function getLayout(draft) {
  return normalizeLayout(draft?.layout, draft?.noteType);
}

// Ordered section descriptors for rendering: [{ id, label, custom }].
// Custom labels come from the layout; core labels are supplied by the caller.
export function orderedVisibleSections(draft) {
  const layout = getLayout(draft);
  const hidden = new Set(layout.hidden);
  const customById = new Map(layout.custom.map((entry) => [entry.id, entry.label]));
  return layout.order
    .filter((id) => !hidden.has(id))
    .map((id) => ({ id, custom: isCustomSectionId(id), label: customById.get(id) || "" }));
}

export function hiddenSections(draft, labelFor) {
  const layout = getLayout(draft);
  return layout.hidden.map((id) => ({ id, label: typeof labelFor === "function" ? labelFor(id) : id }));
}

function withLayout(draft, layout) {
  return { ...draft, layout: normalizeLayout(layout, draft?.noteType) };
}

export function moveDraftSection(draft, sectionId, toIndex) {
  const layout = getLayout(draft);
  const from = layout.order.indexOf(sectionId);
  if (from === -1) return draft;
  const next = [...layout.order];
  const [moved] = next.splice(from, 1);
  const clamped = Math.max(0, Math.min(next.length, toIndex));
  next.splice(clamped, 0, moved);
  return withLayout(draft, { ...layout, order: next });
}

export function moveDraftSectionBy(draft, sectionId, delta) {
  const layout = getLayout(draft);
  const from = layout.order.indexOf(sectionId);
  if (from === -1) return draft;
  return moveDraftSection(draft, sectionId, from + delta);
}

export function hideDraftSection(draft, sectionId) {
  const layout = getLayout(draft);
  if (!layout.order.includes(sectionId) || isCustomSectionId(sectionId)) return draft;
  if (layout.hidden.includes(sectionId)) return draft;
  return withLayout(draft, { ...layout, hidden: [...layout.hidden, sectionId] });
}

export function restoreDraftSection(draft, sectionId) {
  const layout = getLayout(draft);
  if (!layout.hidden.includes(sectionId)) return draft;
  return withLayout(draft, { ...layout, hidden: layout.hidden.filter((id) => id !== sectionId) });
}

export function addDraftCustomSection(draft, label, { idFactory = () => createLocalId("section") } = {}) {
  const clean = cleanText(label).slice(0, 80);
  if (!clean) return { draft, sectionId: "" };
  const layout = getLayout(draft);
  const sectionId = `custom_${idFactory()}`;
  const next = withLayout(draft, {
    ...layout,
    order: [...layout.order, sectionId],
    custom: [...layout.custom, { id: sectionId, label: clean }]
  });
  return { draft: next, sectionId };
}

export function removeDraftCustomSection(draft, sectionId) {
  if (!isCustomSectionId(sectionId)) return draft;
  const layout = getLayout(draft);
  const next = withLayout(draft, {
    ...layout,
    order: layout.order.filter((id) => id !== sectionId),
    custom: layout.custom.filter((entry) => entry.id !== sectionId)
  });
  // Drop the section's text as well.
  if (next.sections && Object.hasOwn(next.sections, sectionId)) {
    const sections = { ...next.sections };
    delete sections[sectionId];
    return { ...next, sections };
  }
  return next;
}

export function renameDraftCustomSection(draft, sectionId, label) {
  const clean = cleanText(label).slice(0, 80);
  if (!isCustomSectionId(sectionId) || !clean) return draft;
  const layout = getLayout(draft);
  return withLayout(draft, {
    ...layout,
    custom: layout.custom.map((entry) => (entry.id === sectionId ? { ...entry, label: clean } : entry))
  });
}

// Rebuild the layout when the note type changes: keep custom sections,
// reset everything else to the new type's default order.
export function relayoutForNoteType(draft, noteType) {
  const layout = getLayout(draft);
  return withLayout({ ...draft, noteType }, { custom: layout.custom });
}

// ---- Templates ----
export function createNoteTemplate({ name, noteType, layout, id = createLocalId("template") } = {}) {
  const clean = cleanText(name).slice(0, 80);
  if (!clean) return null;
  return {
    id: cleanText(id) || createLocalId("template"),
    schema: TEMPLATE_SCHEMA,
    name: clean,
    noteType: noteType === HP ? HP : PROGRESS,
    layout: normalizeLayout(layout, noteType === HP ? HP : PROGRESS),
    createdAt: new Date().toISOString()
  };
}

export function normalizeNoteTemplates(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const normalized = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const id = cleanText(entry.id) || createLocalId("template");
    if (seen.has(id)) continue;
    seen.add(id);
    const name = cleanText(entry.name).slice(0, 80);
    if (!name) continue;
    const noteType = entry.noteType === HP ? HP : PROGRESS;
    normalized.push({
      id,
      schema: TEMPLATE_SCHEMA,
      name,
      noteType,
      layout: normalizeLayout(entry.layout, noteType),
      createdAt: cleanText(entry.createdAt)
    });
  }
  return normalized;
}

export function applyTemplateToDraft(draft, template) {
  if (!template || template.noteType !== draft?.noteType) return draft;
  return withLayout(draft, template.layout);
}

export function removeNoteTemplate(list, id) {
  const target = cleanText(id);
  return normalizeNoteTemplates((Array.isArray(list) ? list : []).filter((entry) => cleanText(entry?.id) !== target));
}
