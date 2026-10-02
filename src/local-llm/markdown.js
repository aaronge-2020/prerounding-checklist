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
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// [label](https://…) → a safe hyperlink. Runs on already-escaped text, so
// the URL and label can't break out of the attribute or tag. Only http(s)
// URLs become links; javascript:/data: stay inert text.
function renderLinks(h) {
  const stash = [];
  h = h.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) => {
    stash.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    return "\x00LINK" + (stash.length - 1) + "\x00";
  });
  return { html: h, restore: (done) => done.replace(/\x00LINK(\d+)\x00/g, (m, i) => stash[Number(i)]) };
}

function renderInline(h) {
  // Inline code first; stash it so later transforms can't touch it.
  const stash = [];
  h = h.replace(/`([^`\n]+)`/g, (m, code) => {
    stash.push(`<code>${code}</code>`);
    return "\x00CODE" + (stash.length - 1) + "\x00";
  });
  // Links next, also stashed so bold/italic can't corrupt the href.
  const links = renderLinks(h);
  h = links.html;
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  h = h.replace(/(^|[^_\w])_([^_\n]+)_/g, "$1<em>$2</em>");
  h = links.restore(h);
  h = h.replace(/\x00CODE(\d+)\x00/g, (m, i) => stash[Number(i)]);
  return h;
}

export function renderChatMarkdown(src) {
  const lines = renderInline(escapeHtmlText(src)).split("\n");
  let out = "";
  let list = null; // "ul" | "ol" | null
  // Running ordered-list counter for the whole message. Small on-device
  // models emit "1. Diagnosis …\n\n1. Treatment …" (one logical list with
  // blank lines, or a bullet sub-list in between), which used to render as
  // "1. 1. 1. 1." — disjointed. Keeping the count across interruptions and
  // emitting start="N" keeps numbering continuous.
  let olNumber = 0;
  const closeList = () => {
    if (list) {
      out += `</${list}>`;
      list = null;
    }
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      // Blank lines no longer close lists: they usually separate items of
      // one logical list in model output, not distinct lists.
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
      olNumber += 1;
      if (list !== "ol") {
        closeList();
        out += `<ol start="${olNumber}">`;
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
