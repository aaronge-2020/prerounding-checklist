import { workupWorkspaceMirrorPlan } from "../../workups/workspace-mirror-plan.js";

const DB_NAME = "prerounding_workspace_mirror_v1";
const STORE_NAME = "directory_handles";
const WORKUP_MIRROR_KEY = "workups";

function indexedDbAvailable() {
  return typeof indexedDB !== "undefined";
}

function fileSystemAccessAvailable() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

function openDatabase() {
  if (!indexedDbAvailable()) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open workspace-mirror storage."));
  });
}

async function withStore(mode, action) {
  const database = await openDatabase();
  if (!database) return null;
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = action(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Workspace-mirror storage request failed."));
    });
  } finally {
    database.close();
  }
}

async function savedDirectoryHandle() {
  return withStore("readonly", (store) => store.get(WORKUP_MIRROR_KEY));
}

async function saveDirectoryHandle(handle) {
  return withStore("readwrite", (store) => store.put(handle, WORKUP_MIRROR_KEY));
}

async function deleteDirectoryHandle() {
  return withStore("readwrite", (store) => store.delete(WORKUP_MIRROR_KEY));
}

async function permissionFor(handle, request = false) {
  if (!handle?.queryPermission) return "denied";
  const options = { mode: "readwrite" };
  const current = await handle.queryPermission(options);
  if (current === "granted" || !request || !handle.requestPermission) return current;
  return handle.requestPermission(options);
}

function stateFromPermission(permission) {
  if (!fileSystemAccessAvailable() || !indexedDbAvailable()) {
    return { status: "unsupported", handle: null, message: "This browser cannot retain a workspace-folder authorization. Your workups still save in the encrypted local vault." };
  }
  if (permission === "granted") return { status: "ready", message: "Workspace mirror ready." };
  return { status: "needs-permission", message: "Reauthorize this workspace folder before mirroring changes." };
}

export async function getWorkupWorkspaceMirrorState() {
  if (!fileSystemAccessAvailable() || !indexedDbAvailable()) return stateFromPermission("denied");
  const handle = await savedDirectoryHandle();
  if (!handle) return { status: "unconfigured", handle: null, message: "Choose a workspace folder to mirror local workups." };
  const state = stateFromPermission(await permissionFor(handle));
  return { ...state, handle };
}

export async function authorizeWorkupWorkspaceMirror() {
  if (!fileSystemAccessAvailable() || !indexedDbAvailable()) return stateFromPermission("denied");
  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  const permission = await permissionFor(handle, true);
  if (permission !== "granted") throw new Error("Workspace-folder write permission was not granted.");
  await saveDirectoryHandle(handle);
  return { status: "ready", handle, message: "Workspace folder authorized." };
}

export async function disconnectWorkupWorkspaceMirror() {
  await deleteDirectoryHandle();
  return { status: "unconfigured", handle: null, message: "Workspace mirror disconnected. Local vault workups remain saved." };
}

export async function writeWorkupWorkspaceMirror(handle, plan) {
  const root = handle;
  if (!root?.getDirectoryHandle) throw new Error("The saved workspace folder is no longer available.");
  let directory = root;
  for (const segment of plan?.directory || []) directory = await directory.getDirectoryHandle(segment, { create: true });
  for (const file of plan?.files || []) {
    const fileHandle = await directory.getFileHandle(file.name, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(file.contents);
    } finally {
      await writable.close();
    }
  }
  return { written: plan?.files?.length || 0, workups: plan?.workups?.length || 0, path: (plan?.directory || []).join("/") };
}

// Automatic sync must never turn into a new browser permission prompt. It
// writes only after the user has already granted persistent access.
export async function mirrorWorkupOverridesToWorkspace(workupOverrides = {}, { requestPermission = false } = {}) {
  const state = await getWorkupWorkspaceMirrorState();
  if (!state.handle) return { ...state, written: 0, workups: 0 };
  const permission = await permissionFor(state.handle, requestPermission);
  if (permission !== "granted") return { ...stateFromPermission(permission), handle: state.handle, written: 0, workups: 0 };
  const result = await writeWorkupWorkspaceMirror(state.handle, workupWorkspaceMirrorPlan(workupOverrides));
  return { status: "ready", handle: state.handle, message: `Mirrored ${result.workups} local workups.`, ...result };
}
