import { requestOpenAiEvidence } from "./openai-client.js?v=20261015-simple-review";
import { aiReviewElement as element, onAiSessionClear } from "./external-ai-review.js?v=20261015-simple-review";

// A new, standalone request. Never attach the chart, chat history, custom
// settings instructions, or the result to a patient conversation.
export async function openLiteratureSearch({ apiKey, model }) {
  let cancelled = false;
  let clearResult = () => {};
  const stop = onAiSessionClear(() => { cancelled = true; clearResult(); });
  let result;
  try {
    result = await requestOpenAiEvidence({
      apiKey, model,
      question: "Replace this text with a focused clinical evidence question. Include only de-identified clinical details needed for retrieval."
    });
  } catch (error) { stop(); throw error; }
  if (cancelled) { stop(); return; }
  const dialog = element("dialog", "", { class: "external-ai-review", "aria-label": "Literature search result" });
  dialog.append(element("h3", "Literature search result"), element("p", "General reference only. Check the primary sources before using recommendations."), element("pre", result.text));
  for (const source of result.sources || []) {
    const link = element("a", source.title, { href: source.url, target: "_blank", rel: "noopener noreferrer" });
    dialog.append(link, element("br"));
  }
  const close = element("button", "Close", { type: "button" });
  const clear = () => { stop(); dialog.close(); dialog.replaceChildren(); dialog.remove(); };
  clearResult = clear;
  close.addEventListener("click", clear);
  dialog.addEventListener("cancel", event => { event.preventDefault(); clear(); });
  dialog.append(close);
  document.body.append(dialog);
  dialog.showModal();
}
