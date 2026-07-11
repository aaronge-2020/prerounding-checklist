import {
  deidentifyText,
  preloadAdvancedDeidModel
} from "./deid-service.js";

function post(type, id, value) {
  self.postMessage({ type, id, value });
}

self.addEventListener("message", async (event) => {
  const { id, action, payload = {} } = event.data || {};
  if (!id || !action) return;
  const onStatus = (status) => post("status", id, status);
  const onProgress = (progress) => post("progress", id, progress);
  try {
    const value = action === "preload"
      ? await preloadAdvancedDeidModel({ ...payload, onStatus, onProgress })
      : await deidentifyText(payload.rawText, { ...payload.options, onStatus, onProgress });
    post("result", id, value);
  } catch (error) {
    post("error", id, error instanceof Error ? error.message : "De-identification failed.");
  }
});
