import { base64UrlDecodeBytes, base64UrlEncodeBytes, randomBase64Url } from "./qr-codec.js";

export function randomCode() {
  const part = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${part()}-${part()}`;
}

export function encodePayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodePayload(payload) {
  const binary = atob(payload.trim());
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function normalizeTransferCode(value) {
  return String(value || "").trim().toUpperCase();
}

export function assertMatchingBundleCode(wrapperCode, payloadCode, mismatchMessage) {
  const wrapper = normalizeTransferCode(wrapperCode);
  const embedded = normalizeTransferCode(payloadCode);
  if (wrapper && embedded && wrapper !== embedded) {
    throw new Error(mismatchMessage || "Bundle code mismatch. Use the payload that matches the displayed code.");
  }
  return embedded || wrapper;
}

export async function phoneTransferCryptoKey(code, saltBytes, usages = ["encrypt"]) {
  const normalizedCode = normalizeTransferCode(code);
  if (!normalizedCode) throw new Error("Generate a phone handoff code before creating an encrypted local bundle.");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(normalizedCode),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations: 160000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages
  );
}

export async function decryptEncryptedPhonePayloadTransferText(wrapper = {}, code = "") {
  if (wrapper?.version !== "encrypted-local-phone-handoff-v1") return "";
  const normalizedCode = normalizeTransferCode(code);
  if (!normalizedCode) throw new Error("Enter the laptop handoff code to open this encrypted local bundle.");
  const salt = base64UrlDecodeBytes(wrapper.salt || "");
  const iv = base64UrlDecodeBytes(wrapper.iv || "");
  const ciphertext = base64UrlDecodeBytes(wrapper.ciphertext || "");
  const key = await phoneTransferCryptoKey(normalizedCode, salt, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

export function phoneHandoffMailboxLinkFromText(raw = "") {
  const text = String(raw || "").trim();
  const readLink = (value = "") => {
    if (!value) return null;
    const params = new URLSearchParams(value.replace(/^[#?]/, ""));
    const handoff = String(params.get("H") || "").trim();
    const [id, key] = handoff.split(".");
    if (!id || !key || handoff.split(".").length !== 2) return null;
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(id) || !/^[A-Za-z0-9_-]{32,64}$/.test(key)) return null;
    return { id, key };
  };
  try {
    const url = new URL(text, window.location.href);
    return readLink(url.hash) || readLink(url.search);
  } catch {
    return readLink(text);
  }
}

export async function importAesGcmMailboxKey(keyText, usages) {
  return crypto.subtle.importKey(
    "raw",
    base64UrlDecodeBytes(keyText),
    { name: "AES-GCM" },
    false,
    usages
  );
}

export async function encryptPhoneHandoffMailboxPayload(payload, keyByteLength = 32) {
  const key = randomBase64Url(keyByteLength);
  const iv = randomBase64Url(12);
  const cryptoKey = await importAesGcmMailboxKey(key, ["encrypt"]);
  const json = JSON.stringify(payload || {});
  const encoded = new TextEncoder().encode(json);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: base64UrlDecodeBytes(iv) },
    cryptoKey,
    encoded
  );
  return {
    key,
    iv,
    ciphertext: base64UrlEncodeBytes(new Uint8Array(ciphertext)),
    jsonLength: json.length
  };
}

export async function decryptPhoneHandoffMailboxPayload(record, keyText) {
  if (!record?.ciphertext || !record?.iv) throw new Error("This handoff link has expired. Generate a fresh QR code.");
  const cryptoKey = await importAesGcmMailboxKey(keyText, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlDecodeBytes(record.iv) },
    cryptoKey,
    base64UrlDecodeBytes(record.ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(plaintext) || "{}");
}
