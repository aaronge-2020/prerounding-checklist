import { createDraftPrivacyReview, decideDraftPrivacyChange, draftPrivacyText } from "../local-llm/draft-privacy-review.js?v=20261015-clinical-drafts";
import { aiReviewElement as element } from "./external-ai-review.js?v=20261015-simple-review";

export function createLocalDraftPrivacyReview(source, safe, onChange) {
  let state = createDraftPrivacyReview(source, safe);
  const root = element("details", "", { "data-local-draft-privacy": "" });
  root.open = state.changes.length > 0;
  const render = () => {
    root.replaceChildren();
    const pending = state.changes.filter(change => change.state === "pending").length;
    root.hidden = !state.changes.length && !state.warnings.length;
    root.append(element("summary", pending ? `${pending} privacy change${pending === 1 ? "" : "s"} to review` : "Privacy changes reviewed"));
    root.append(element("p", "Keep identifiers redacted. Restore only text you confirm is not identifying. Clinical shorthand may need correction here."));
    for (const [index, change] of state.changes.entries()) {
      const row = element("div", "", { class: "local-privacy-choice", "data-local-privacy-state": change.state });
      if (change.state === "pending") row.append(element("s", change.original), element("span", " → "), element("mark", change.placeholder));
      else if (change.state === "confirmed") row.append(element("mark", change.placeholder), element("span", " · Redaction kept"));
      else row.append(element("span", `${change.original} · Restored as not PHI`));
      for (const [decision, label] of [["confirmed", "Keep redaction"], ["restored", "Not PHI — restore"], ["pending", "Undo decision"]]) {
        if (change.state === "confirmed" && decision !== "pending") continue;
        if (decision === change.state || decision === "pending" && change.state === "pending") continue;
        const button = element("button", label, { type: "button", "data-local-privacy-decision": decision, "data-local-privacy-index": String(index), "aria-label": `${label}: ${change.state === "confirmed" ? change.placeholder : change.original}` });
        button.disabled = decision === "restored" && !state.mapped;
        button.addEventListener("click", () => { decideDraftPrivacyChange(state, index, decision); render(); onChange(); }); row.append(button);
      }
      root.append(row);
    }
    if (pending) {
      const all = element("button", "Keep all remaining redactions", { type: "button", "data-local-privacy-keep-all": "" });
      all.addEventListener("click", () => { for (const change of state.changes) if (change.state === "pending") change.state = "confirmed"; render(); onChange(); }); root.append(all);
    }
    if (!state.mapped && state.changes.length) root.append(element("p", "Exact restoration is unavailable for this output. Edit the source and regenerate to correct it."));
    for (const warning of state.warnings) root.append(element("p", typeof warning === "string" ? warning : String(warning.snippet || warning.message || warning.type || "Potential residual identifier")));
    if (state.warnings.length) root.append(element("p", `${state.warnings.length} residual privacy warning(s): review the source and proposed text before applying.`));
  };
  render();
  return { element: root, text: () => draftPrivacyText(state), pending: () => state.changes.some(change => change.state === "pending"), clear() { state = null; root.replaceChildren(); root.remove(); } };
}
