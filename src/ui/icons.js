const iconPaths = {
  shield: '<path d="M12 3l7 3v5c0 4.4-2.9 8.4-7 10-4.1-1.6-7-5.6-7-10V6l7-3z"/><path d="M9.5 12.2l1.7 1.7 3.6-4"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  clipboard: '<path d="M9 4h6l1 2h3v15H5V6h3l1-2z"/><path d="M9 10h6M9 14h6M9 18h3"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  workup: '<path d="M6 4h9l3 3v13H6z"/><path d="M14 4v4h4M9 12h6M9 16h6"/>',
  checklist: '<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6l1 1 2-3M4 12l1 1 2-3M4 18l1 1 2-3"/>',
  prompt: '<path d="M5 5h14v10H8l-3 3z"/><path d="M8 9h8M8 12h5"/>',
  wand: '<path d="M4 20l10-10"/><path d="M13 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3zM19 13l.6 1.4L21 15l-1.4.6L19 17l-.6-1.4L17 15l1.4-.6L19 13z"/>',
  settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/><path d="M3 12h2M19 12h2M12 3v2M12 19v2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  archive: '<path d="M4 7h16l-1 13H5L4 7z"/><path d="M3 4h18v3H3zM9 11h6"/>',
  download: '<path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M4 20h16"/>',
  upload: '<path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M4 20h16"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.3 10.8 7.4-4.5M8.3 13.2l7.4 4.5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>',
  edit: '<path d="M4 20h4l11-11-4-4L4 16z"/><path d="M13 7l4 4"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/>',
  grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
  alert: '<path d="M12 3 2 21h20L12 3z"/><path d="M12 9v5M12 17h.01"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  moveUp: '<path d="M12 20V4"/><path d="m7 9 5-5 5 5"/>',
  moveDown: '<path d="M12 4v16"/><path d="m17 15-5 5-5-5"/>',
  externalLink: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
  play: '<path d="m9 5 10 7-10 7z"/>'
};

export function icon(name, className = "icon") {
  const paths = iconPaths[name] || iconPaths.check;
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;
}
