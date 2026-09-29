// Controller for the browser-local de-identification model-pack lifecycle:
// loading, downloading, importing, verifying and removing model packs, plus
// the "make sure the selected model is ready" gate used before local
// inference. Pure service calls live in src/patient-context/ (deid-client,
// deid-model-options, model-pack-storage, model-packs); this module owns the
// UI-edge orchestration that previously lived in src/ui/app.js. It touches
// the DOM only for download-progress updates and the folder picker, like the
// other feature controllers.
import {
  crossOriginIsolationBlocker,
  preloadAdvancedDeidModel,
  resetAdvancedDeidWorker,
  verifyAdvancedDeidModel
} from "../../patient-context/deid-client.js?v=20260921-medication-card-v4";
import {
  DEFAULT_DEID_MODEL_KEY,
  DEID_MODEL_OPTIONS,
  STRUCTURED_DEID_MODE,
  deidModelOptionByKey
} from "../../patient-context/deid-model-options.js?v=20260929-obi-default";
import {
  ensureModelPackServiceWorker,
  getModelPackState,
  importModelPack,
  installModelPack,
  markModelPackVerified,
  modelFilesFromDirectoryHandle,
  removeModelPack,
  requestPersistentModelStorage
} from "../../patient-context/model-pack-storage.js?v=20260925-sw-auth-fix";
import {
  formatBytes,
  hasAutomaticModelDownload,
  isInstallableModel,
  modelDownloadBytes
} from "../../patient-context/model-packs.js?v=20260921-medication-card-v4";

export function createModelPackController({
  app,
  byId,
  setStatus,
  render,
  renderStatusBar,
  refreshWebGpuAvailability,
  refreshDeidControlsInActiveView,
  updateDeidStatus,
  updateDeidOperation,
  modelPackFailureMessage,
  selectedDeidOption,
  selectedDeidReadiness
}) {
  // Loads/downloads/verifies the selected model automatically instead of
  // requiring a separate manual trip to Settings first - once a model has
  // loaded in this session, selectedDeidReadiness().ready is already true and
  // this resolves immediately without reloading anything.
  async function ensureSelectedDeidReady() {
    const readiness = selectedDeidReadiness();
    if (readiness.ready) return readiness;
    const option = selectedDeidOption();
    if (crossOriginIsolationBlocker()) throw new Error(crossOriginIsolationBlocker());
    let caughtMessage = "";
    try {
      if (option && isInstallableModel(option) && hasAutomaticModelDownload(option)) {
        const pack = await getModelPackState(option);
        app.modelPacks = { ...app.modelPacks, [option.key]: pack };
        if (pack.state === "installed") await verifyInstalledModelPack(option.key);
        else await downloadSelectedModelPack(option.key);
      } else {
        await loadAdvancedModel();
      }
    } catch (error) {
      caughtMessage = error instanceof Error ? error.message : "";
    }
    const finalReadiness = selectedDeidReadiness();
    if (finalReadiness.ready) return finalReadiness;
    throw new Error((option && app.modelPackErrors?.[option.key]) || caughtMessage || finalReadiness.message);
  }

  async function selectedModelLoadBlocker(option) {
    if (!option) return "Structured-only de-identification selected.";
    if (!option.browserRunnable) return option.disabledReason || "This model is not available in this browser build.";
    if (isInstallableModel(option)) {
      const pack = await getModelPackState(option);
      app.modelPacks = { ...app.modelPacks, [option.key]: pack };
      if (!pack.ready) return pack.message;
    }
    return crossOriginIsolationBlocker() || webGpuRuntimeBlocker(option);
  }


  async function webGpuRuntimeBlocker(option) {
    if (!option?.requiresWebGpu) return "";
    const available = await refreshWebGpuAvailability({ renderAfter: false });
    if (available) return "";
    return `${option.label} needs graphics acceleration this browser doesn't support. The model stays downloaded on this device — try a different browser, or use a device with a compatible graphics card.`;
  }


  function modelPackProgressText(option) {
    const progress = app.modelPackProgress[option.key];
    if (!progress) return "";
    const totalBytes = progress.totalBytes || modelDownloadBytes(option);
    const percent = totalBytes ? Math.min(100, Math.floor((progress.completedBytes / totalBytes) * 100)) : 0;
    return `${percent}% - ${formatBytes(progress.completedBytes)} of ${formatBytes(totalBytes)} (${progress.file})`;
  }


  async function loadAdvancedModel() {
    if (app.deidMode === STRUCTURED_DEID_MODE) {
      setStatus("Structured-only de-identification selected.");
      return;
    }
    const requestedKey = app.deidMode;
    const option = deidModelOptionByKey(requestedKey);
    const blocker = await selectedModelLoadBlocker(option);
    if (blocker) {
      setStatus(blocker);
      render();
      return;
    }
    app.loadingDeidModelKey = requestedKey;
    updateDeidOperation({ active: true, message: `Loading ${option.label} locally…` });
    setStatus(`Loading ${option.label}...`);
    renderStatusBar();
    refreshDeidControlsInActiveView();
    try {
      const loadedStatus = await preloadAdvancedDeidModel({
        modelKey: requestedKey,
        onStatus: updateDeidStatus,
        onProgress: (progress) => {
          if (progress?.message) {
            setStatus(progress.message);
            updateDeidOperation({ active: true, message: progress.message });
          }
        }
      });
      app.deidStatus = loadedStatus;
      setStatus(`${option.label} loaded locally.`);
      updateDeidOperation({ active: false, message: `${option.label} is verified and ready locally.` });
    } catch (error) {
      updateDeidOperation({ active: false, message: error instanceof Error ? error.message : "The selected model did not load." });
      throw error;
    } finally {
      if (app.loadingDeidModelKey === requestedKey) app.loadingDeidModelKey = "";
    }
    refreshDeidControlsInActiveView();
  }


  async function refreshModelPackStates({ renderAfter = true } = {}) {
    const entries = await Promise.all(DEID_MODEL_OPTIONS.map(async (option) => [option.key, await getModelPackState(option)]));
    app.modelPacks = Object.fromEntries(entries);
    if (renderAfter) {
      refreshDeidControlsInActiveView();
    }
  }


  async function importSelectedModelPack(modelKey, entries) {
    const option = deidModelOptionByKey(modelKey);
    if (!isInstallableModel(option)) return;
    app.modelPackBusyKey = option.key;
    setStatus(`Preparing ${option.label} for local import...`);
    refreshDeidControlsInActiveView();
    try {
      const service = await ensureModelPackServiceWorker();
      app.modelPackService = service;
      await requestPersistentModelStorage();
      const imported = await importModelPack(option, entries, {
        onProgress: ({ completedBytes, totalBytes, file }) =>
          setStatus(`Importing ${option.label}: ${file} (${formatBytes(completedBytes)} of ${formatBytes(totalBytes)})...`)
      });
      if (imported.source === "imported" && !service.ready) throw new Error(service.message);
      resetAdvancedDeidWorker();
      await verifyAdvancedDeidModel({
        modelKey: option.key,
        assetSource: imported.source,
        onStatus: updateDeidStatus,
        onProgress: (progress) => progress?.message && setStatus(progress.message)
      });
      await markModelPackVerified(option);
      app.deidMode = option.key;
      app.quickDeid.status = `${option.label} installed and verified locally.`;
      await refreshModelPackStates({ renderAfter: false });
      setStatus(`${option.label} is ready for local de-identification.`);
    } finally {
      app.modelPackBusyKey = "";
      app.pendingModelPackKey = "";
      refreshDeidControlsInActiveView();
    }
  }


  function updateModelPackDownloadProgress(option, progress) {
    app.modelPackProgress = { ...app.modelPackProgress, [option.key]: progress };
    const card = document.querySelector(`.model-pack-card[data-model-key="${option.key}"]`);
    const progressElement = card?.querySelector("progress");
    const text = card?.querySelector("[data-model-pack-progress]");
    if (progressElement) {
      progressElement.value = progress.completedBytes;
      progressElement.max = Math.max(1, progress.totalBytes);
    }
    if (text) text.textContent = modelPackProgressText(option);
    const activeProgress = document.querySelector("[data-active-model-progress]");
    const activeText = document.querySelector("[data-active-model-progress-text]");
    const sharedProgress = document.querySelector("[data-shared-model-progress]");
    const sharedText = document.querySelector("[data-shared-model-progress-text]");
    if (app.deidMode === option.key && activeProgress) {
      activeProgress.value = progress.completedBytes;
      activeProgress.max = Math.max(1, progress.totalBytes);
    }
    if (app.deidMode === option.key && activeText) activeText.textContent = modelPackProgressText(option);
    if (app.deidMode === option.key && sharedProgress) {
      sharedProgress.value = progress.completedBytes;
      sharedProgress.max = Math.max(1, progress.totalBytes);
    }
    if (app.deidMode === option.key && sharedText) sharedText.textContent = modelPackProgressText(option);
    const message = `Downloading ${option.label}: ${modelPackProgressText(option)}...`;
    app.quickDeid.status = message;
    setStatus(message);
  }


  async function downloadSelectedModelPack(modelKey) {
    const option = deidModelOptionByKey(modelKey);
    if (!isInstallableModel(option) || !hasAutomaticModelDownload(option)) return;
    const blocker = crossOriginIsolationBlocker() || (await webGpuRuntimeBlocker(option));
    if (blocker) {
      app.quickDeid.status = blocker;
      setStatus(blocker);
      refreshDeidControlsInActiveView();
      return;
    }
    app.modelPackBusyKey = option.key;
    app.modelPackErrors = { ...app.modelPackErrors, [option.key]: "" };
    app.modelPackAbortController = new AbortController();
    app.modelPackProgress = {
      ...app.modelPackProgress,
      [option.key]: { completedBytes: 0, totalBytes: modelDownloadBytes(option), file: "Preparing local storage" }
    };
    setStatus(`Preparing ${option.label} for a local browser download...`);
    refreshDeidControlsInActiveView();
    try {
      if (option.download?.storage === "cache") {
        const service = await ensureModelPackServiceWorker();
        app.modelPackService = service;
        if (!service.ready) throw new Error(service.message);
      }
      const persistent = await requestPersistentModelStorage();
      if (!persistent)
        setStatus("The browser did not grant persistent storage. The model remains local, but the browser may evict it when space is low.");
      const installed = await installModelPack(option, {
        signal: app.modelPackAbortController.signal,
        onProgress: (progress) => updateModelPackDownloadProgress(option, progress)
      });
      resetAdvancedDeidWorker();
      app.modelPackProgress = {
        ...app.modelPackProgress,
        [option.key]: { completedBytes: installed.totalBytes, totalBytes: installed.totalBytes, file: "Verifying local inference" }
      };
      refreshDeidControlsInActiveView();
      await verifyAdvancedDeidModel({
        modelKey: option.key,
        assetSource: installed.source,
        onStatus: updateDeidStatus,
        onProgress: (progress) => progress?.message && setStatus(progress.message)
      });
      await markModelPackVerified(option);
      app.deidMode = option.key;
      app.quickDeid.status = `${option.label} downloaded and verified locally.`;
      app.modelPackErrors = { ...app.modelPackErrors, [option.key]: "" };
      setStatus(`${option.label} is ready for local de-identification.`);
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      const message = cancelled ? `${option.label} download paused. Resume whenever you are ready.` : modelPackFailureMessage(option, error);
      app.quickDeid.status = message;
      app.modelPackErrors = {
        ...app.modelPackErrors,
        [option.key]: cancelled ? "" : message
      };
      setStatus(message);
    } finally {
      app.modelPackBusyKey = "";
      app.modelPackAbortController = null;
      await refreshModelPackStates({ renderAfter: false });
      refreshDeidControlsInActiveView();
    }
  }


  function cancelModelPackDownload(modelKey) {
    if (app.modelPackBusyKey !== modelKey) return;
    app.modelPackAbortController?.abort();
    setStatus("Pausing model download...");
  }


  async function chooseModelPack(modelKey) {
    const option = deidModelOptionByKey(modelKey);
    if (!isInstallableModel(option)) return;
    if (typeof window.showDirectoryPicker === "function") {
      const directory = await window.showDirectoryPicker({ mode: "read" });
      await importSelectedModelPack(option.key, await modelFilesFromDirectoryHandle(directory));
      return;
    }
    app.pendingModelPackKey = option.key;
    byId("modelPackFolderInput")?.click();
  }


  async function verifyInstalledModelPack(modelKey) {
    const option = deidModelOptionByKey(modelKey);
    if (!isInstallableModel(option)) return;
    const blocker = crossOriginIsolationBlocker() || (await webGpuRuntimeBlocker(option));
    if (blocker) {
      app.quickDeid.status = blocker;
      setStatus(blocker);
      refreshDeidControlsInActiveView();
      return;
    }
    app.modelPackBusyKey = option.key;
    app.modelPackErrors = { ...app.modelPackErrors, [option.key]: "" };
    app.quickDeid.status = `Verifying ${option.label} on this device...`;
    refreshDeidControlsInActiveView();
    try {
      const state = await getModelPackState(option);
      if (!state.source || state.source === "bundled") throw new Error("Import this model folder before verifying it.");
      if (state.source === "imported") {
        const service = await ensureModelPackServiceWorker();
        app.modelPackService = service;
        if (!service.ready) throw new Error(service.message);
      }
      resetAdvancedDeidWorker();
      await verifyAdvancedDeidModel({
        modelKey: option.key,
        assetSource: state.source,
        onStatus: updateDeidStatus,
        onProgress: (progress) => progress?.message && setStatus(progress.message)
      });
      await markModelPackVerified(option);
      app.deidMode = option.key;
      app.quickDeid.status = `${option.label} verified locally.`;
      app.modelPackErrors = { ...app.modelPackErrors, [option.key]: "" };
      await refreshModelPackStates({ renderAfter: false });
      setStatus(`${option.label} is ready for local de-identification.`);
    } catch (error) {
      const message = modelPackFailureMessage(option, error);
      app.quickDeid.status = message;
      app.modelPackErrors = { ...app.modelPackErrors, [option.key]: message };
      setStatus(message);
    } finally {
      app.modelPackBusyKey = "";
      await refreshModelPackStates({ renderAfter: false });
      refreshDeidControlsInActiveView();
    }
  }


  async function removeSelectedModelPack(modelKey) {
    const option = deidModelOptionByKey(modelKey);
    if (!isInstallableModel(option)) return;
    app.modelPackBusyKey = option.key;
    try {
      await removeModelPack(option);
      resetAdvancedDeidWorker();
      if (app.deidMode === option.key) app.deidMode = DEFAULT_DEID_MODEL_KEY;
      app.quickDeid.status = `${option.label} removed from this browser.`;
      await refreshModelPackStates({ renderAfter: false });
      setStatus(`${option.label} local files removed.`);
    } finally {
      app.modelPackBusyKey = "";
      refreshDeidControlsInActiveView();
    }
  }


  return {
    ensureSelectedDeidReady,
    loadAdvancedModel,
    refreshModelPackStates,
    importSelectedModelPack,
    updateModelPackDownloadProgress,
    downloadSelectedModelPack,
    cancelModelPackDownload,
    chooseModelPack,
    verifyInstalledModelPack,
    removeSelectedModelPack,
    modelPackProgressText
  };
}
