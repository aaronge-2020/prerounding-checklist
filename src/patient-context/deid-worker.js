import {
  deidentifyText,
  preloadAdvancedDeidModel,
  verifyAdvancedDeidModel
} from "./deid-service.js?v=20260717-guided-demo-ux";

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
      : action === "verify"
        ? await verifyAdvancedDeidModel({ ...payload, onStatus, onProgress })
        : await deidentifyText(payload.rawText, { ...payload.options, onStatus, onProgress });
    post("result", id, value);
  } catch (error) {
    post("error", id, error instanceof Error ? error.message : "De-identification failed.");
  }
});
