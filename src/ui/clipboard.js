// Clipboard utilities - extracted from app.js to respect the
// coordinator-file size boundary (scripts/check-ui-module-boundaries.js).
export function createClipboard({ setStatus }) {
  async function copyText(text) {
    try {
      if (!text) {
        setStatus("Nothing to copy yet.");
        return;
      }
      await navigator.clipboard.writeText(text);
      setStatus("Copied.");
    } catch (error) {
      console.error("Copy failed:", error);
      setStatus("Copy failed. Your browser blocked clipboard access — select the text and copy it manually.");
    }
  }

  return Object.freeze({ copyText });
}
