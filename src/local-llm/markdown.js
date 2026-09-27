// Minimal, safe markdown renderer for Local AI assistant messages.
//
// Model output is untrusted text: escape HTML first, then apply a small
// subset of markdown (bold, italic, inline code, headings, bullet and
// numbered lists, paragraphs). Not a full parser — just what chat answers
// actually use. Raw HTML from the model is never rendered.

function escapeHtmlText(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(h) {
  // Inline code first; stash it so later transforms can't touch it.
  const stash = [];
  h = h.replace(/`([^`\n]+)`/g, (m, code) => {
    stash.push(`<code>${code}</code>`);
    return "\x00CODE" + (stash.length - 1) + "\x00";
  });
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  h = h.replace(/(^|[^_\w])_([^_\n]+)_/g, "$1<em>$2</em>");
  h = h.replace(/\x00CODE(\d+)\x00/g, (m, i) => stash[Number(i)]);
  return h;
}

export function renderChatMarkdown(src) {
  const lines = renderInline(escapeHtmlText(src)).split("\n");
  let out = "";
  let list = null; // "ul" | "ol" | null
  const closeList = () => {
    if (list) {
      out += `</${list}>`;
      list = null;
    }
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    let m;
    const heading = line.match(/^(#{1,3})\s+(.*)/);
    if (heading) {
      closeList();
      out += `<p><strong>${heading[2]}</strong></p>`;
    } else if ((m = line.match(/^[-*]\s+(.*)/))) {
      if (list !== "ul") {
        closeList();
        out += "<ul>";
        list = "ul";
      }
      out += `<li>${m[1]}</li>`;
    } else if ((m = line.match(/^\d+[.)]\s+(.*)/))) {
      if (list !== "ol") {
        closeList();
        out += "<ol>";
        list = "ol";
      }
      out += `<li>${m[1]}</li>`;
    } else {
      closeList();
      out += `<p>${line}</p>`;
    }
  }
  closeList();
  return out;
}
