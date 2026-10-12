import { sentinelizeSectionCitations } from "./section-citations.js?v=20261012-concise-context";
import { linkifyCitations } from "../../ai/citation-links.js?v=20261004-cite-links-v1";
import { renderChatMarkdown } from "../../local-llm/markdown.js?v=20261004-cite-links-v1";

const escape = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// One numbering sequence per reply, in reading order. Keep source metadata
// in the marker; neither chart quotes nor long source titles interrupt prose.
export function renderNumberedCitations(text, citations, messageIndex, sources) {
  const { text: chartText, cites } = sentinelizeSectionCitations(text);
  const sourceList = Array.isArray(sources) ? sources : [];
  const linked = linkifyCitations(chartText, sourceList);
  const references = [];
  const numbers = new Map();
  const markers = [];
  const body = linked.replace(/`[^`\n]*`|\uE000SECITE(\d+)\uE001|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, index, label, url) => {
    if (match.startsWith("`")) return match;
    let ref, key;
    if (index !== undefined) {
      const cite = cites[Number(index)];
      const meta = citations?.[Number(index)];
      ref = { kind: "chart", title: cite.section, excerpt: cite.quote, pieceId: meta?.pieceId || "", messageIndex };
      key = JSON.stringify(["chart", ref.title, ref.excerpt]);
    } else {
      const source = sourceList.find(item => item.url === url);
      ref = { kind: "web", title: source?.title || label, url, excerpt: source?.excerpt || "", isSearch: url.startsWith("https://www.google.com/search?q=") };
      key = url;
    }
    if (!numbers.has(key)) { numbers.set(key, references.length + 1); references.push(ref); }
    const number = numbers.get(key);
    markers.push(`<button type="button" class="aic-citation-number" data-ap-reference="${escape(JSON.stringify({ ...ref, id: number }))}" aria-label="Citation ${number}: ${escape(ref.title)}">${number}</button>`);
    return `\uE000NUMBERCITE${markers.length - 1}\uE001`;
  });
  return renderChatMarkdown(body)
    .replace(/\uE000NUMBERCITE(\d+)\uE001/g, (_, index) => markers[Number(index)])
    .replace(/\uE000SECITE(\d+)\uE001/g, (_, index) => escape(String(text).slice(cites[Number(index)].start, cites[Number(index)].end)));
}
