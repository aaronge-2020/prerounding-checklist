// Citation metadata travels with its marker, never as hidden editable note text.
export function citationButton(ref, escapeHtml, label = `[${ref.id}]`) {
  return `<button type="button" class="ap-reference-button" contenteditable="false" data-ap-reference="${escapeHtml(JSON.stringify(ref))}" aria-label="${escapeHtml(`View source ${ref.id}: ${ref.title || 'Citation details'}`)}" aria-haspopup="dialog">${escapeHtml(label)}</button>`;
}

