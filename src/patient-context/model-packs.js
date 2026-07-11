export const MODEL_PACK_CACHE_NAME = "prerounding-local-model-packs-v1";
export const MODEL_PACK_ROUTE = "__prerounding-models";
// A pack is not ready merely because its files are present. A worker self-test
// must succeed against the currently shipped local runtime. Bump this value
// whenever model-loader behavior changes so stale "verified" badges cannot
// survive a runtime upgrade.
export const LOCAL_MODEL_RUNTIME_VERSION = "20260711-openmed-standard-wasm-v1";

function normalizedPath(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
}

function currentAppBaseUrl() {
  return new URL("../../", import.meta.url).href;
}

export function importedModelBaseUrl(baseUrl = currentAppBaseUrl()) {
  return new URL(`${MODEL_PACK_ROUTE}/`, baseUrl).href;
}

export function importedModelFileUrl(modelId, fileName = "", baseUrl = currentAppBaseUrl()) {
  const modelPath = normalizedPath(modelId);
  const filePath = normalizedPath(fileName);
  return new URL(`${MODEL_PACK_ROUTE}/${modelPath}${filePath ? `/${filePath}` : ""}`, baseUrl).href;
}

export function importedModelManifestUrl(modelId, baseUrl = currentAppBaseUrl()) {
  return importedModelFileUrl(modelId, ".manifest.json", baseUrl);
}

export function isInstallableModel(option) {
  return option?.assetMode === "installable";
}

export function modelPackVerifiedForCurrentRuntime(manifest) {
  return Boolean(
    manifest?.verifiedAt
      && manifest?.runtimeVersion === LOCAL_MODEL_RUNTIME_VERSION
  );
}

function encodedPath(path) {
  return normalizedPath(path).split("/").map(encodeURIComponent).join("/");
}

export function requiredModelPackFiles(option) {
  return [...new Set((option?.requiredFiles || []).map(normalizedPath).filter(Boolean))];
}

export function modelDownloadPlan(option) {
  const download = option?.download;
  const assets = Array.isArray(download?.assets) ? download.assets : [];
  const required = new Set(requiredModelPackFiles(option));
  const seen = new Set();
  const plan = [];
  for (const asset of assets) {
    const path = normalizedPath(asset?.path);
    const sourcePath = normalizedPath(asset?.sourcePath || path);
    const bytes = Number(asset?.bytes || 0);
    if (!required.has(path) || !sourcePath || bytes <= 0 || seen.has(path)) continue;
    seen.add(path);
    const etag = String(asset?.etag || "").replace(/^\"|\"$/g, "").toLowerCase();
    plan.push({ path, sourcePath, bytes, ...(etag ? { etag } : {}) });
  }
  return plan;
}

export function hasAutomaticModelDownload(option) {
  const download = option?.download;
  return isInstallableModel(option)
    && typeof download?.repository === "string"
    && typeof download?.revision === "string"
    && modelDownloadPlan(option).length === requiredModelPackFiles(option).length;
}

export function modelDownloadUrl(option, asset) {
  if (!hasAutomaticModelDownload(option)) return "";
  const repository = String(option.download.repository).split("/").map(encodeURIComponent).join("/");
  return `https://huggingface.co/${repository}/resolve/${encodeURIComponent(option.download.revision)}/${encodedPath(asset.sourcePath || asset.path)}`;
}

export function modelDownloadBytes(option) {
  return modelDownloadPlan(option).reduce((total, asset) => total + asset.bytes, 0);
}

export function formatBytes(bytes = 0) {
  const value = Number(bytes) || 0;
  if (value < 1024 * 1024) return `${Math.max(0, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(value >= 1024 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function modelPackEntryPath(rawPath, option) {
  const path = normalizedPath(rawPath);
  const modelId = normalizedPath(option?.modelId);
  if (!path || !modelId) return "";
  const marker = `/${modelId}/`;
  const markedIndex = `/${path}`.indexOf(marker);
  if (markedIndex >= 0) return normalizedPath(`/${path}`.slice(markedIndex + marker.length));
  const expected = requiredModelPackFiles(option)
    .sort((left, right) => right.length - left.length)
    .find((file) => path === file || path.endsWith(`/${file}`));
  return expected || "";
}

export function validateModelPackEntries(option, entries) {
  const required = requiredModelPackFiles(option);
  const files = new Map();
  for (const entry of entries || []) {
    const path = modelPackEntryPath(entry?.path || entry?.webkitRelativePath || entry?.name, option);
    if (!path || files.has(path)) continue;
    const size = Number(entry?.file?.size ?? entry?.size ?? 0);
    if (size <= 0) continue;
    files.set(path, { ...entry, path, size });
  }
  const missing = required.filter((path) => !files.has(path));
  return {
    valid: missing.length === 0,
    required,
    missing,
    files: [...files.values()],
    totalBytes: [...files.values()].reduce((total, file) => total + file.size, 0)
  };
}

export function modelPackManifestIsValid(option, manifest) {
  const required = requiredModelPackFiles(option);
  const files = new Set((manifest?.files || []).map((entry) => normalizedPath(entry?.path)));
  return manifest?.modelId === option?.modelId && required.every((path) => files.has(path));
}
