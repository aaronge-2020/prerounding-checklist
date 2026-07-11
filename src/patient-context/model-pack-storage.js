import {
  LOCAL_MODEL_RUNTIME_VERSION,
  MODEL_PACK_CACHE_NAME,
  formatBytes,
  hasAutomaticModelDownload,
  importedModelFileUrl,
  importedModelManifestUrl,
  isInstallableModel,
  modelDownloadBytes,
  modelDownloadPlan,
  modelDownloadUrl,
  modelPackManifestIsValid,
  modelPackVerifiedForCurrentRuntime,
  validateModelPackEntries
} from "./model-packs.js?v=20260711-functional-remediation-15";

const MODEL_PACK_DATABASE = "prerounding-local-model-pack-handles-v1";
const MODEL_PACK_STORE = "packs";
const MODEL_PACK_OPFS_DIRECTORY = "prerounding-local-model-packs-v1";
const MODEL_PACK_MANIFEST_FILE = ".manifest.json";

function canUseModelPackCache() {
  return typeof caches !== "undefined" && typeof Response !== "undefined";
}

function canUseModelPackHandles() {
  return typeof indexedDB !== "undefined";
}

function canUseOpfs() {
  return typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function";
}

export function canAutomaticallyInstallModel(option) {
  if (!hasAutomaticModelDownload(option)) return false;
  return option.download?.storage === "cache" ? canUseModelPackCache() : canUseOpfs();
}

function contentTypeFor(path) {
  if (path.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

function normalizedEtag(value) {
  return String(value || "").replace(/^W\//i, "").replace(/^\"|\"$/g, "").trim().toLowerCase();
}

async function verifyPinnedRemoteAsset(option, asset, { signal } = {}) {
  if (!asset?.etag) return;
  const url = modelDownloadUrl(option, asset);
  const response = await fetch(url, { method: "HEAD", cache: "no-store", signal });
  if (!response.ok) throw new Error(`Could not verify the pinned identity for ${asset.path}.`);
  const actual = normalizedEtag(response.headers.get("etag"));
  if (!actual || actual !== normalizedEtag(asset.etag)) {
    throw new Error(`${asset.path} does not match the pinned model artifact. The installer stopped before saving it.`);
  }
}

function assertPinnedResponseAsset(asset, response) {
  if (!asset?.etag) return;
  const actual = normalizedEtag(response?.headers?.get("etag"));
  if (!actual || actual !== normalizedEtag(asset.etag)) {
    throw new Error(`${asset.path} does not match the pinned model artifact. The installer stopped before saving it.`);
  }
}

function opfsPackName(option) {
  return encodeURIComponent(option.modelId);
}

async function opfsPackDirectory(option, { create = false } = {}) {
  if (!canUseOpfs()) return null;
  const root = await navigator.storage.getDirectory();
  const packs = await root.getDirectoryHandle(MODEL_PACK_OPFS_DIRECTORY, { create });
  return packs.getDirectoryHandle(opfsPackName(option), { create });
}

async function opfsFileHandle(option, path, { create = false } = {}) {
  const pack = await opfsPackDirectory(option, { create });
  if (!pack) return null;
  const parts = String(path).split("/").filter(Boolean);
  const name = parts.pop();
  if (!name) return null;
  let directory = pack;
  for (const part of parts) {
    directory = await directory.getDirectoryHandle(part, { create });
  }
  return directory.getFileHandle(name, { create });
}

async function readOpfsManifest(option) {
  try {
    const handle = await opfsFileHandle(option, MODEL_PACK_MANIFEST_FILE);
    if (!handle) return null;
    return JSON.parse(await (await handle.getFile()).text());
  } catch {
    return null;
  }
}

async function removeOpfsPack(option) {
  if (!canUseOpfs()) return;
  try {
    const root = await navigator.storage.getDirectory();
    const packs = await root.getDirectoryHandle(MODEL_PACK_OPFS_DIRECTORY);
    await packs.removeEntry(opfsPackName(option), { recursive: true });
  } catch {
    // The optional OPFS pack may not exist.
  }
}

async function writeOpfsManifest(option, manifest) {
  const handle = await opfsFileHandle(option, MODEL_PACK_MANIFEST_FILE, { create: true });
  if (!handle) throw new Error("This browser cannot create local model storage.");
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(manifest));
  await writable.close();
}

async function opfsFileSize(option, path) {
  try {
    const handle = await opfsFileHandle(option, path);
    return handle ? (await handle.getFile()).size : 0;
  } catch {
    return 0;
  }
}

function opfsPackState(option, manifest) {
  if (!manifest) return null;
  if (manifest.status === "downloading" || manifest.status === "partial") {
    const downloaded = Number(manifest.downloadedBytes || 0);
    const total = Number(manifest.totalBytes || modelDownloadBytes(option));
    return {
      state: "partial",
      source: "opfs",
      ready: false,
      message: `Partial local download: ${formatBytes(downloaded)} of ${formatBytes(total)}. Resume when ready.`,
      manifest,
      totalBytes: total
    };
  }
  if (!modelPackManifestIsValid(option, manifest)) {
    return { state: "invalid", source: "opfs", ready: false, message: "The browser model pack is missing required files.", manifest };
  }
  const verified = modelPackVerifiedForCurrentRuntime(manifest);
  const needsReverification = Boolean(manifest.verifiedAt) && !verified;
  return {
    state: verified ? "ready" : "installed",
    source: "opfs",
    ready: verified,
    message: verified
      ? "Downloaded and verified in this browser."
      : needsReverification
        ? "Downloaded locally. Verify once with this app's updated local runtime before using."
        : "Downloaded locally. Verify before using.",
    manifest,
    totalBytes: Number(manifest.totalBytes || 0)
  };
}

function selfHostedModelFileUrl(option, fileName) {
  return new URL(`../../models/${option.modelId}/${fileName}`, import.meta.url).href;
}

async function hasSelfHostedModelPack(option) {
  try {
    const responses = await Promise.all(option.requiredFiles.map((fileName) =>
      fetch(selfHostedModelFileUrl(option, fileName), { method: "HEAD", cache: "no-store" })
    ));
    return responses.every((response) => response.ok);
  } catch {
    return false;
  }
}

function openHandleDatabase() {
  if (!canUseModelPackHandles()) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MODEL_PACK_DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(MODEL_PACK_STORE, { keyPath: "modelId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open local model-pack storage."));
  });
}

async function readHandlePack(option) {
  const database = await openHandleDatabase();
  if (!database) return null;
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(MODEL_PACK_STORE, "readonly").objectStore(MODEL_PACK_STORE).get(option.modelId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Unable to read local model-pack handles."));
    });
  } finally {
    database.close();
  }
}

async function writeHandlePack(pack) {
  const database = await openHandleDatabase();
  if (!database) throw new Error("This browser cannot retain local model-folder access.");
  try {
    await new Promise((resolve, reject) => {
      const request = database.transaction(MODEL_PACK_STORE, "readwrite").objectStore(MODEL_PACK_STORE).put(pack);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("Unable to save local model-folder access."));
    });
  } finally {
    database.close();
  }
}

async function deleteHandlePack(option) {
  const database = await openHandleDatabase();
  if (!database) return;
  try {
    await new Promise((resolve, reject) => {
      const request = database.transaction(MODEL_PACK_STORE, "readwrite").objectStore(MODEL_PACK_STORE).delete(option.modelId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("Unable to remove local model-folder access."));
    });
  } finally {
    database.close();
  }
}

async function openModelPackCache() {
  if (!canUseModelPackCache()) throw new Error("This browser does not support local model-pack storage.");
  return caches.open(MODEL_PACK_CACHE_NAME);
}

async function removePackResponses(cache, option) {
  const prefix = importedModelFileUrl(option.modelId);
  const keys = await cache.keys();
  await Promise.all(keys.filter((request) => request.url.startsWith(prefix)).map((request) => cache.delete(request)));
}

function handlePackState(option, manifest) {
  if (!modelPackManifestIsValid(option, manifest)) {
    return { state: "invalid", ready: false, message: "The selected model folder is missing required files." };
  }
  const verified = modelPackVerifiedForCurrentRuntime(manifest);
  const needsReverification = Boolean(manifest.verifiedAt) && !verified;
  return {
    state: verified ? "ready" : "installed",
    source: "handles",
    ready: verified,
    message: verified
      ? "Linked and verified from a local model folder."
      : needsReverification
        ? "Local folder selected. Verify once with this app's updated local runtime before using."
        : "Local folder selected. Verify before using.",
    manifest,
    totalBytes: Number(manifest.totalBytes || 0)
  };
}

export async function getModelPackState(option) {
  if (!option) return { state: "unavailable", ready: false, message: "Unknown model." };
  if (!option.browserRunnable) {
    return { state: "unavailable", ready: false, message: option.disabledReason || "This model is not available in the browser." };
  }
  if (!isInstallableModel(option)) {
    return { state: "bundled", source: "bundled", ready: true, message: "Bundled with this static app." };
  }
  const handlePack = await readHandlePack(option);
  if (handlePack) return handlePackState(option, handlePack);
  const opfsState = opfsPackState(option, await readOpfsManifest(option));
  if (opfsState) return opfsState;
  if (canUseModelPackCache()) {
    const cache = await openModelPackCache();
    const response = await cache.match(importedModelManifestUrl(option.modelId));
    if (response) {
      try {
        const manifest = await response.json();
        if (!modelPackManifestIsValid(option, manifest)) {
          return { state: "invalid", ready: false, message: "The imported folder is missing required model files." };
        }
        const verified = modelPackVerifiedForCurrentRuntime(manifest);
        const needsReverification = Boolean(manifest.verifiedAt) && !verified;
        return {
          state: verified ? "ready" : "installed",
          source: "imported",
          ready: verified,
          message: verified
            ? "Installed and verified locally."
            : needsReverification
              ? "Imported locally. Verify once with this app's updated local runtime before using."
              : "Imported locally. Verify before using.",
          manifest,
          totalBytes: Number(manifest.totalBytes || 0)
        };
      } catch {
        return { state: "invalid", ready: false, message: "The local model-pack manifest could not be read." };
      }
    }
  }
  // Automatic packs live in browser-owned storage. Do not probe non-existent
  // `/models/` URLs for them: that creates noisy 404s and is not a fallback the
  // installer can safely claim is available. A packaged local build must opt in.
  if (option.allowSelfHosted && await hasSelfHostedModelPack(option)) {
    return { state: "self-hosted", source: "bundled", ready: true, message: "Available from this self-hosted local app." };
  }
  if (!canUseModelPackCache() && !canUseModelPackHandles() && !canUseOpfs()) {
    return { state: "unsupported", ready: false, message: "This browser cannot retain a local model pack." };
  }
  if (hasAutomaticModelDownload(option) && canAutomaticallyInstallModel(option)) {
    return {
      state: "not-installed",
      source: option.download?.storage === "cache" ? "imported" : "opfs",
      ready: false,
      message: "Download this model once to use it locally in this browser."
    };
  }
  return { state: "not-installed", ready: false, message: "Import this local model folder to enable it." };
}

function buildManifest(option, validation) {
  return {
    version: 1,
    modelId: option.modelId,
    label: option.label,
    installedAt: new Date().toISOString(),
    totalBytes: validation.totalBytes,
    files: validation.files.map((entry) => ({ path: entry.path, size: entry.size }))
  };
}

export async function importModelPack(option, entries, { onProgress } = {}) {
  if (!isInstallableModel(option)) throw new Error("This model is bundled and does not need to be imported.");
  const validation = validateModelPackEntries(option, entries);
  if (!validation.valid) {
    throw new Error(`Missing required files: ${validation.missing.join(", ")}. Select the ${option.label} model folder.`);
  }
  const manifest = buildManifest(option, validation);
  // A valid user-selected folder is authoritative over an interrupted
  // automatic download of the same model. Otherwise getModelPackState sees
  // stale OPFS "partial" metadata first and makes a complete import look
  // broken.
  await removeOpfsPack(option);
  const canLinkFolder = option.engine !== "gliner" && canUseModelPackHandles() && validation.files.every((entry) => entry.handle?.kind === "file");
  if (canLinkFolder) {
    await writeHandlePack({
      ...manifest,
      source: "handles",
      files: validation.files.map((entry) => ({ path: entry.path, size: entry.size, handle: entry.handle }))
    });
    if (canUseModelPackCache()) await removePackResponses(await openModelPackCache(), option);
    return { ...manifest, source: "handles", message: `Linked ${formatBytes(validation.totalBytes)} from the selected local folder.` };
  }
  if (!canUseModelPackCache()) {
    throw new Error("Choose a model folder in a Chromium browser to link this model locally.");
  }
  const cache = await openModelPackCache();
  await removePackResponses(cache, option);
  try {
    let completedBytes = 0;
    for (const entry of validation.files) {
      const file = entry.file || entry;
      await cache.put(importedModelFileUrl(option.modelId, entry.path), new Response(file, {
        headers: {
          "content-type": file.type || contentTypeFor(entry.path),
          "content-length": String(entry.size)
        }
      }));
      completedBytes += entry.size;
      onProgress?.({ completedBytes, totalBytes: validation.totalBytes, file: entry.path });
    }
    await cache.put(
      importedModelManifestUrl(option.modelId),
      new Response(JSON.stringify(manifest), { headers: { "content-type": "application/json" } })
    );
    return { ...manifest, source: "imported", message: `Imported ${formatBytes(validation.totalBytes)} locally.` };
  } catch (error) {
    await removePackResponses(cache, option);
    throw error;
  }
}

async function installCacheModelPack(option, { signal, onProgress } = {}) {
  if (!canUseModelPackCache()) throw new Error("This browser cannot cache this model locally. Use Import model folder instead.");
  const plan = modelDownloadPlan(option);
  const cache = await openModelPackCache();
  await removePackResponses(cache, option);
  const completedFiles = [];
  let completedBytes = 0;
  try {
    for (const asset of plan) {
      await verifyPinnedRemoteAsset(option, asset, { signal });
      const response = await fetch(modelDownloadUrl(option, asset), { cache: "no-store", signal });
      if (!response.ok || !response.body) throw new Error(`Could not download ${asset.path} (${response.status || "network error"}).`);
      assertPinnedResponseAsset(asset, response);
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength && contentLength !== asset.bytes) {
        throw new Error(`${asset.path} has an unexpected download size. The installer stopped before saving it.`);
      }
      let fileBytes = 0;
      const counter = new TransformStream({
        transform(chunk, controller) {
          fileBytes += chunk.byteLength;
          onProgress?.({
            file: asset.path,
            fileBytes,
            fileTotalBytes: asset.bytes,
            completedBytes: completedBytes + fileBytes,
            totalBytes: modelDownloadBytes(option)
          });
          controller.enqueue(chunk);
        }
      });
      await cache.put(
        importedModelFileUrl(option.modelId, asset.path),
        new Response(response.body.pipeThrough(counter), {
          headers: {
            "content-type": response.headers.get("content-type") || contentTypeFor(asset.path),
            "content-length": String(asset.bytes)
          }
        })
      );
      if (fileBytes !== asset.bytes) throw new Error(`${asset.path} did not finish downloading. Start the install again.`);
      completedFiles.push({ path: asset.path, size: asset.bytes, ...(asset.etag ? { etag: asset.etag } : {}) });
      completedBytes += fileBytes;
    }
    const manifest = buildManifest(option, {
      files: completedFiles.map((file) => ({ ...file, file: null })),
      totalBytes: completedBytes
    });
    await cache.put(
      importedModelManifestUrl(option.modelId),
      new Response(JSON.stringify(manifest), { headers: { "content-type": "application/json" } })
    );
    return { ...manifest, source: "imported", message: `Downloaded ${formatBytes(manifest.totalBytes)} locally.` };
  } catch (error) {
    await removePackResponses(cache, option);
    throw error;
  }
}

function installationManifest(option, status, files = [], downloadedBytes = 0, lastError = "") {
  return {
    version: 2,
    modelId: option.modelId,
    label: option.label,
    source: "opfs",
    status,
    installedAt: new Date().toISOString(),
    totalBytes: modelDownloadBytes(option),
    downloadedBytes,
    files,
    download: {
      provider: option.download?.provider || "Model publisher",
      repository: option.download?.repository || "",
      revision: option.download?.revision || ""
    },
    lastError
  };
}

function downloadedBytesFor(option, completedFiles, activeFileBytes = 0) {
  return completedFiles.reduce((total, file) => total + file.size, 0) + activeFileBytes;
}

async function downloadedOpfsBytes(option, plan) {
  const sizes = await Promise.all(plan.map(async (asset) => Math.min(await opfsFileSize(option, asset.path), asset.bytes)));
  return sizes.reduce((total, size) => total + size, 0);
}

async function streamModelAsset(option, asset, existingBytes, { signal, onProgress, completedFiles }) {
  const url = modelDownloadUrl(option, asset);
  if (!url) throw new Error(`${option.label} does not have a trusted browser download source.`);
  await verifyPinnedRemoteAsset(option, asset, { signal });
  const headers = existingBytes > 0 ? { Range: `bytes=${existingBytes}-` } : undefined;
  const response = await fetch(url, { cache: "no-store", headers, signal });
  if (!response.ok || !response.body) {
    throw new Error(`Could not download ${asset.path} (${response.status || "network error"}).`);
  }
  assertPinnedResponseAsset(asset, response);

  const append = existingBytes > 0 && response.status === 206;
  const initialBytes = append ? existingBytes : 0;
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength && initialBytes + contentLength !== asset.bytes) {
    throw new Error(`${asset.path} has an unexpected download size. The installer stopped before saving it.`);
  }

  const handle = await opfsFileHandle(option, asset.path, { create: true });
  if (!handle) throw new Error("This browser cannot create local model storage.");
  const writable = await handle.createWritable({ keepExistingData: append });
  let bytes = initialBytes;
  try {
    if (append) await writable.seek(existingBytes);
    else await writable.truncate(0);
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) throw new DOMException("The model download was cancelled.", "AbortError");
      await writable.write(value);
      bytes += value.byteLength;
      onProgress?.({
        file: asset.path,
        fileBytes: bytes,
        fileTotalBytes: asset.bytes,
        completedBytes: downloadedBytesFor(option, completedFiles, bytes),
        totalBytes: modelDownloadBytes(option)
      });
    }
    await writable.close();
  } catch (error) {
    await writable.abort();
    throw error;
  }
  if (bytes !== asset.bytes || await opfsFileSize(option, asset.path) !== asset.bytes) {
    throw new Error(`${asset.path} did not finish downloading. You can resume the install.`);
  }
  return { path: asset.path, size: asset.bytes, ...(asset.etag ? { etag: asset.etag } : {}) };
}

export async function installModelPack(option, { signal, onProgress } = {}) {
  if (!isInstallableModel(option)) throw new Error("This model is bundled and does not need to be downloaded.");
  if (!hasAutomaticModelDownload(option)) throw new Error(`${option.label} does not have a trusted automatic download source.`);
  if (option.download?.storage === "cache") return installCacheModelPack(option, { signal, onProgress });
  if (!canUseOpfs()) throw new Error("This browser cannot download a large local model automatically. Use Import model folder instead.");

  const plan = modelDownloadPlan(option);
  const completedFiles = [];
  for (const asset of plan) {
    if (await opfsFileSize(option, asset.path) === asset.bytes) {
      completedFiles.push({ path: asset.path, size: asset.bytes });
    }
  }
  let downloadedBytes = await downloadedOpfsBytes(option, plan);
  await writeOpfsManifest(option, installationManifest(option, "downloading", completedFiles, downloadedBytes));

  try {
    for (const asset of plan) {
      if (completedFiles.some((file) => file.path === asset.path)) continue;
      const existingBytes = await opfsFileSize(option, asset.path);
      const file = await streamModelAsset(option, asset, existingBytes, {
        signal,
        completedFiles,
        onProgress: (progress) => {
          downloadedBytes = progress.completedBytes;
          onProgress?.(progress);
        }
      });
      completedFiles.push(file);
      downloadedBytes = downloadedBytesFor(option, completedFiles);
      await writeOpfsManifest(option, installationManifest(option, "downloading", completedFiles, downloadedBytes));
    }
    const manifest = installationManifest(option, "installed", completedFiles, downloadedBytes);
    await writeOpfsManifest(option, manifest);
    return { ...manifest, source: "opfs", message: `Downloaded ${formatBytes(manifest.totalBytes)} locally.` };
  } catch (error) {
    const partialBytes = await downloadedOpfsBytes(option, plan);
    await writeOpfsManifest(option, installationManifest(
      option,
      "partial",
      completedFiles,
      partialBytes,
      error instanceof Error ? error.message : "Model download interrupted."
    ));
    throw error;
  }
}

export async function markModelPackVerified(option) {
  const handlePack = await readHandlePack(option);
  if (handlePack) {
    if (!modelPackManifestIsValid(option, handlePack)) throw new Error("The selected model folder is incomplete.");
    const next = {
      ...handlePack,
      verifiedAt: new Date().toISOString(),
      runtimeVersion: LOCAL_MODEL_RUNTIME_VERSION,
      lastVerificationError: ""
    };
    await writeHandlePack(next);
    return next;
  }
  const opfsManifest = await readOpfsManifest(option);
  if (opfsManifest) {
    if (!modelPackManifestIsValid(option, opfsManifest)) throw new Error("The browser model pack is incomplete.");
    const next = {
      ...opfsManifest,
      status: "installed",
      verifiedAt: new Date().toISOString(),
      runtimeVersion: LOCAL_MODEL_RUNTIME_VERSION,
      lastVerificationError: ""
    };
    await writeOpfsManifest(option, next);
    return next;
  }
  const cache = await openModelPackCache();
  const manifestResponse = await cache.match(importedModelManifestUrl(option.modelId));
  if (!manifestResponse) throw new Error("Import the model pack before verifying it.");
  const manifest = await manifestResponse.json();
  if (!modelPackManifestIsValid(option, manifest)) throw new Error("The imported model pack is incomplete.");
  const next = {
    ...manifest,
    verifiedAt: new Date().toISOString(),
    runtimeVersion: LOCAL_MODEL_RUNTIME_VERSION,
    lastVerificationError: ""
  };
  await cache.put(
    importedModelManifestUrl(option.modelId),
    new Response(JSON.stringify(next), { headers: { "content-type": "application/json" } })
  );
  return next;
}

function unverifiedManifest(manifest, error) {
  return {
    ...manifest,
    verifiedAt: "",
    runtimeVersion: "",
    lastVerificationError: error instanceof Error ? error.message : String(error || "Local inference did not complete.")
  };
}

// Preserve the downloaded model after a failed run, but never leave it marked
// verified. The UI can then offer an explicit retry without a second download.
export async function invalidateModelPackVerification(option, error) {
  if (!isInstallableModel(option)) return null;
  const handlePack = await readHandlePack(option);
  if (handlePack) {
    const next = unverifiedManifest(handlePack, error);
    await writeHandlePack(next);
    return next;
  }
  const opfsManifest = await readOpfsManifest(option);
  if (opfsManifest) {
    const next = { ...unverifiedManifest(opfsManifest, error), status: "installed" };
    await writeOpfsManifest(option, next);
    return next;
  }
  if (!canUseModelPackCache()) return null;
  const cache = await openModelPackCache();
  const manifestResponse = await cache.match(importedModelManifestUrl(option.modelId));
  if (!manifestResponse) return null;
  const next = unverifiedManifest(await manifestResponse.json(), error);
  await cache.put(
    importedModelManifestUrl(option.modelId),
    new Response(JSON.stringify(next), { headers: { "content-type": "application/json" } })
  );
  return next;
}

export async function removeModelPack(option) {
  if (!isInstallableModel(option)) return;
  await deleteHandlePack(option);
  await removeOpfsPack(option);
  if (canUseModelPackCache()) await removePackResponses(await openModelPackCache(), option);
}

export async function readModelPackFileResponse(modelId, fileName) {
  const database = await openHandleDatabase();
  if (database) {
    try {
      const pack = await new Promise((resolve, reject) => {
        const request = database.transaction(MODEL_PACK_STORE, "readonly").objectStore(MODEL_PACK_STORE).get(modelId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error("Unable to read local model-folder access."));
      });
      const entry = pack?.files?.find((file) => file.path === fileName);
      if (entry?.handle) {
        const file = await entry.handle.getFile();
        return new Response(file, { headers: { "content-type": file.type || contentTypeFor(fileName) } });
      }
    } finally {
      database.close();
    }
  }
  if (!canUseOpfs()) return null;
  try {
    const option = { modelId };
    const handle = await opfsFileHandle(option, fileName);
    if (!handle) return null;
    const file = await handle.getFile();
    return new Response(file, { headers: { "content-type": file.type || contentTypeFor(fileName) } });
  } catch {
    return null;
  }
}

export async function ensureModelPackServiceWorker() {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) {
    return { ready: false, message: "This browser does not support the local model installer." };
  }
  await navigator.serviceWorker.register(new URL("../../service-worker.js", import.meta.url));
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 1500);
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
    });
  }
  return {
    ready: Boolean(navigator.serviceWorker.controller),
    message: navigator.serviceWorker.controller ? "Local model installer ready." : "Refresh once to activate the local model installer."
  };
}

export async function requestPersistentModelStorage() {
  if (!navigator.storage?.persist) return false;
  try {
    return Boolean(await navigator.storage.persist());
  } catch {
    return false;
  }
}

export async function modelFilesFromDirectoryHandle(handle, basePath = "") {
  const entries = [];
  for await (const [name, child] of handle.entries()) {
    const path = basePath ? `${basePath}/${name}` : name;
    if (child.kind === "directory") entries.push(...await modelFilesFromDirectoryHandle(child, path));
    if (child.kind === "file") entries.push({ path, file: await child.getFile(), handle: child });
  }
  return entries;
}

export function modelFilesFromInput(fileList) {
  return [...(fileList || [])].map((file) => ({ path: file.webkitRelativePath || file.name, file }));
}
