import { createEmptyVaultState, migrateVaultState } from "./vault.js";

export const VAULT_DATA_KEY = "prerounding.local.encryptedVault.v1";
const KDF_ITERATIONS = 210000;

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecode(value = "") {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function vaultCryptoKey(passphrase, salt, usages) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: KDF_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages
  );
}

export async function encryptVaultPayload(vaultState, passphrase) {
  if (!String(passphrase || "").trim()) throw new Error("Enter a vault passphrase before saving.");
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await vaultCryptoKey(passphrase, salt, ["encrypt"]);
  const plaintext = new TextEncoder().encode(JSON.stringify(migrateVaultState(vaultState)));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  return {
    schema: "prerounding_encrypted_vault_v1",
    kdf: "PBKDF2-SHA256",
    iterations: KDF_ITERATIONS,
    salt: base64UrlEncode(salt),
    iv: base64UrlEncode(iv),
    ciphertext: base64UrlEncode(ciphertext),
    updatedAt: new Date().toISOString()
  };
}

export async function decryptVaultPayload(record, passphrase) {
  if (!record || record.schema !== "prerounding_encrypted_vault_v1") throw new Error("This is not a local encrypted prerounding vault.");
  if (!String(passphrase || "").trim()) throw new Error("Enter the vault passphrase.");
  const salt = base64UrlDecode(record.salt);
  const iv = base64UrlDecode(record.iv);
  const ciphertext = base64UrlDecode(record.ciphertext);
  const key = await vaultCryptoKey(passphrase, salt, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return migrateVaultState(JSON.parse(new TextDecoder().decode(plaintext)));
}

export function readEncryptedVaultRecord(storage = localStorage) {
  const raw = storage.getItem(VAULT_DATA_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function writeEncryptedVaultRecord(record, storage = localStorage) {
  storage.setItem(VAULT_DATA_KEY, JSON.stringify(record));
  return record;
}

export function deleteEncryptedVaultRecord(storage = localStorage) {
  storage.removeItem(VAULT_DATA_KEY);
}

export async function saveEncryptedVault(vaultState, passphrase, storage = localStorage) {
  const record = await encryptVaultPayload(vaultState, passphrase);
  writeEncryptedVaultRecord(record, storage);
  return record;
}

export async function loadOrCreateVault(passphrase, storage = localStorage) {
  const record = readEncryptedVaultRecord(storage);
  if (!record) {
    const vault = createEmptyVaultState();
    await saveEncryptedVault(vault, passphrase, storage);
    return vault;
  }
  return decryptVaultPayload(record, passphrase);
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
