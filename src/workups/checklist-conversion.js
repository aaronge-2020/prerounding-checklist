export function workupsToChecklistItems(workups = []) {
  return workups.flatMap((workup) =>
    workup.items.map((item) => ({
      id: `${workup.id}:${item.id}`,
      workupId: workup.id,
      workupTitle: workup.title,
      itemId: item.id,
      kind: item.kind,
      system: item.system || "",
      text: item.text,
      choices: item.choices,
      select: item.select || "one"
    }))
  );
}

export function createChecklistSnapshot(workups, { now = () => new Date().toISOString(), id = "" } = {}) {
  return {
    schema: "prerounding_checklist_v1",
    id: id || `checklist_${Date.now().toString(36)}`,
    createdAt: now(),
    workupIds: workups.map((workup) => workup.id),
    workupTitles: workups.map((workup) => workup.title),
    items: workupsToChecklistItems(workups)
  };
}
