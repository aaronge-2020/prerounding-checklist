export function navigateClinicalLabCollections(target) {
  const view = target.closest('[data-clinical-view="labs"]');
  const panels = [...(view?.querySelectorAll("[data-clinical-lab-panel]") || [])];
  if (!panels.length) return;
  const current = Math.max(0, panels.findIndex((panel) => !panel.hidden));
  const next = Math.max(0, Math.min(panels.length - 1, current + Number(target.dataset.direction || 0)));
  panels.forEach((panel, index) => { panel.hidden = index !== next; });
  const position = view.querySelector("[data-clinical-lab-position]");
  if (position) position.textContent = `${next + 1} of ${panels.length}`;
  const previous = view.querySelector('[data-action="clinical-lab-page"][data-direction="-1"]');
  const following = view.querySelector('[data-action="clinical-lab-page"][data-direction="1"]');
  if (previous) previous.disabled = next === 0;
  if (following) following.disabled = next === panels.length - 1;
}

export function updateClinicalMedicationPage(view, { direction = 0, reset = false } = {}) {
  if (!view) return;
  const query = (view.querySelector("[data-clinical-medication-search]")?.value || "").trim().toLowerCase();
  const rows = [...view.querySelectorAll("[data-medication-row]")];
  const matchingRows = rows.filter((row) => !query || row.textContent.toLowerCase().includes(query));
  const pageCount = Math.max(1, Math.ceil(matchingRows.length / 10));
  const current = reset ? 0 : Number(view.dataset.medicationPage || 0);
  const page = Math.max(0, Math.min(pageCount - 1, current + direction));
  view.dataset.medicationPage = String(page);
  const visible = new Set(matchingRows.slice(page * 10, page * 10 + 10));
  rows.forEach((row) => { row.hidden = !visible.has(row); });
  view.querySelectorAll(".clinical-data-group").forEach((group) => {
    group.hidden = !group.querySelector("[data-medication-row]:not([hidden])");
  });
  const position = view.querySelector("[data-clinical-medication-position]");
  if (position) position.textContent = matchingRows.length ? `${page + 1} of ${pageCount} · ${matchingRows.length} medications` : "No matching medications";
  const previous = view.querySelector('[data-action="clinical-medication-page"][data-direction="-1"]');
  const following = view.querySelector('[data-action="clinical-medication-page"][data-direction="1"]');
  if (previous) previous.disabled = page === 0;
  if (following) following.disabled = page === pageCount - 1 || !matchingRows.length;
}
