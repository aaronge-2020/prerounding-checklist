import {
  init as initQrZstd,
  createCCtx as createQrZstdCCtx,
  createDCtx as createQrZstdDCtx,
  freeCCtx as freeQrZstdCCtx,
  freeDCtx as freeQrZstdDCtx,
  compressUsingDict as zstdCompressUsingDict,
  decompressUsingDict as zstdDecompressUsingDict
} from "./vendor/zstd-wasm/index.web.js";
import {
  QR_DEFAULT_REGISTRY_HASH,
  QR_ZSTD_DICTIONARY_BASE64,
  QR_ZSTD_DICTIONARY_BYTES,
  QR_ZSTD_DICTIONARY_HASH,
  QR_ZSTD_DICTIONARY_ID
} from "./vendor/qr-zstd-dictionary.js";

export function base64UrlEncodeBytes(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecodeBytes(value = "") {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function base64UrlEncodeText(text = "") {
  return base64UrlEncodeBytes(new TextEncoder().encode(String(text || "")));
}

export function base64UrlDecodeText(value = "") {
  return new TextDecoder().decode(base64UrlDecodeBytes(value));
}

const BASE42_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$*-./:";
const BASE42_LOOKUP = new Map(BASE42_ALPHABET.split("").map((char, index) => [char, index]));
const LEGACY_BASE45_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const LEGACY_BASE45_LOOKUP = new Map(LEGACY_BASE45_ALPHABET.split("").map((char, index) => [char, index]));

export function baseQrEncodeBytes(bytes = new Uint8Array()) {
  let output = "";
  for (let index = 0; index < bytes.length; index += 2) {
    if (index + 1 < bytes.length) {
      let value = bytes[index] * 256 + bytes[index + 1];
      const first = value % 42;
      value = Math.floor(value / 42);
      const second = value % 42;
      const third = Math.floor(value / 42);
      output += BASE42_ALPHABET[first] + BASE42_ALPHABET[second] + BASE42_ALPHABET[third];
    } else {
      const value = bytes[index];
      output += BASE42_ALPHABET[value % 42] + BASE42_ALPHABET[Math.floor(value / 42)];
    }
  }
  return output;
}

function decodeBaseQrBytesWithAlphabet(value = "", alphabetLookup = BASE42_LOOKUP, base = 42) {
  const text = String(value || "");
  if (text.length % 3 === 1) throw new Error("Invalid compact QR payload.");
  const bytes = [];
  for (let index = 0; index < text.length; index += 3) {
    const first = alphabetLookup.get(text[index]);
    const second = alphabetLookup.get(text[index + 1]);
    if (first === undefined || second === undefined) throw new Error("Invalid compact QR payload.");
    if (index + 2 < text.length) {
      const third = alphabetLookup.get(text[index + 2]);
      if (third === undefined) throw new Error("Invalid compact QR payload.");
      const decoded = first + second * base + third * base * base;
      if (decoded > 0xffff) throw new Error("Invalid compact QR payload.");
      bytes.push(Math.floor(decoded / 256), decoded % 256);
    } else {
      const decoded = first + second * base;
      if (decoded > 0xff) throw new Error("Invalid compact QR payload.");
      bytes.push(decoded);
    }
  }
  return new Uint8Array(bytes);
}

export function baseQrDecodeBytes(value = "") {
  try {
    return decodeBaseQrBytesWithAlphabet(value, BASE42_LOOKUP, 42);
  } catch (error) {
    try {
      return decodeBaseQrBytesWithAlphabet(value, LEGACY_BASE45_LOOKUP, 45);
    } catch {
      throw error;
    }
  }
}

export function base45EncodeBytes(bytes = new Uint8Array()) {
  let output = "";
  for (let index = 0; index < bytes.length; index += 2) {
    if (index + 1 < bytes.length) {
      let value = bytes[index] * 256 + bytes[index + 1];
      const first = value % 45;
      value = Math.floor(value / 45);
      const second = value % 45;
      const third = Math.floor(value / 45);
      output += LEGACY_BASE45_ALPHABET[first] + LEGACY_BASE45_ALPHABET[second] + LEGACY_BASE45_ALPHABET[third];
    } else {
      const value = bytes[index];
      output += LEGACY_BASE45_ALPHABET[value % 45] + LEGACY_BASE45_ALPHABET[Math.floor(value / 45)];
    }
  }
  return output;
}

export function base45DecodeBytes(value = "") {
  return decodeBaseQrBytesWithAlphabet(value, LEGACY_BASE45_LOOKUP, 45);
}

export async function gzipTextToBytes(text = "") {
  if (typeof CompressionStream !== "function") return "";
  const compressed = new Blob([String(text || "")], { type: "text/plain" })
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const buffer = await new Response(compressed).arrayBuffer();
  return new Uint8Array(buffer);
}

export async function gzipTextToBase64Url(text = "") {
  const bytes = await gzipTextToBytes(text);
  return bytes ? base64UrlEncodeBytes(bytes) : "";
}

export async function gunzipBytesToText(bytes) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("This browser cannot open compressed QR checklist links. Use Copy for phone instead.");
  }
  const inflated = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(inflated).text();
}

export async function gunzipBase64UrlToText(value = "") {
  return gunzipBytesToText(base64UrlDecodeBytes(value));
}

function concatBytes(parts = []) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function cborHeader(major, value) {
  const head = major << 5;
  if (value < 24) return Uint8Array.of(head | value);
  if (value <= 0xff) return Uint8Array.of(head | 24, value);
  if (value <= 0xffff) return Uint8Array.of(head | 25, value >> 8, value & 0xff);
  if (value <= 0xffffffff) return Uint8Array.of(head | 26, (value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
  throw new Error("Compact QR payload contains an unsupported integer.");
}

function cborEncode(value) {
  if (value === null || value === undefined) return Uint8Array.of(0xf6);
  if (value === false) return Uint8Array.of(0xf4);
  if (value === true) return Uint8Array.of(0xf5);
  if (value instanceof Uint8Array) return concatBytes([cborHeader(2, value.length), value]);
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new Error("Compact QR payload contains a non-integer number.");
    return value >= 0 ? cborHeader(0, value) : cborHeader(1, -1 - value);
  }
  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);
    return concatBytes([cborHeader(3, bytes.length), bytes]);
  }
  if (Array.isArray(value)) {
    return concatBytes([cborHeader(4, value.length), ...value.map((entry) => cborEncode(entry))]);
  }
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return concatBytes([
      cborHeader(5, entries.length),
      ...entries.flatMap(([key, entry]) => [cborEncode(key), cborEncode(entry)])
    ]);
  }
  throw new Error("Compact QR payload contains an unsupported value.");
}

function cborReadLength(bytes, offset, additional) {
  if (additional < 24) return { value: additional, offset };
  if (additional === 24) return { value: bytes[offset], offset: offset + 1 };
  if (additional === 25) return { value: (bytes[offset] << 8) | bytes[offset + 1], offset: offset + 2 };
  if (additional === 26) {
    return {
      value: ((bytes[offset] * 0x1000000) + ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])) >>> 0,
      offset: offset + 4
    };
  }
  throw new Error("Compact QR payload uses unsupported CBOR length.");
}

function cborDecode(bytes = new Uint8Array()) {
  const decodeAt = (offset) => {
    const first = bytes[offset++];
    const major = first >> 5;
    const additional = first & 31;
    if (major === 7) {
      if (additional === 20) return { value: false, offset };
      if (additional === 21) return { value: true, offset };
      if (additional === 22) return { value: null, offset };
      throw new Error("Compact QR payload contains unsupported simple value.");
    }
    const length = cborReadLength(bytes, offset, additional);
    offset = length.offset;
    if (major === 0) return { value: length.value, offset };
    if (major === 1) return { value: -1 - length.value, offset };
    if (major === 2) {
      const value = bytes.slice(offset, offset + length.value);
      return { value, offset: offset + length.value };
    }
    if (major === 3) {
      const value = new TextDecoder().decode(bytes.slice(offset, offset + length.value));
      return { value, offset: offset + length.value };
    }
    if (major === 4) {
      const value = [];
      for (let index = 0; index < length.value; index += 1) {
        const decoded = decodeAt(offset);
        value.push(decoded.value);
        offset = decoded.offset;
      }
      return { value, offset };
    }
    if (major === 5) {
      const value = {};
      for (let index = 0; index < length.value; index += 1) {
        const keyDecoded = decodeAt(offset);
        const valueDecoded = decodeAt(keyDecoded.offset);
        value[String(keyDecoded.value)] = valueDecoded.value;
        offset = valueDecoded.offset;
      }
      return { value, offset };
    }
    throw new Error("Compact QR payload contains unsupported CBOR type.");
  };
  const decoded = decodeAt(0);
  if (decoded.offset !== bytes.length) throw new Error("Compact QR payload has trailing bytes.");
  return decoded.value;
}

const QR_ZSTD_COMPRESSION_LEVEL = 10;
const QR_ZSTD_CODEC_KEY = "Z";
const QR_ZSTD_CODEC_FORMAT = "zstd-dict";
let qrZstdCodecPromise = null;
let qrZstdCodecHandles = null;

function bytesEqual(first = new Uint8Array(), second = new Uint8Array()) {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false;
  }
  return true;
}

function compactBytesFingerprint64(bytes = new Uint8Array()) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of bytes || []) {
    hash ^= BigInt(byte || 0);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

async function qrZstdCodec() {
  if (!qrZstdCodecPromise) {
    qrZstdCodecPromise = (async () => {
      const dictionary = base64UrlDecodeBytes(QR_ZSTD_DICTIONARY_BASE64);
      const dictionaryHash = compactBytesFingerprint64(dictionary);
      if (dictionary.length !== QR_ZSTD_DICTIONARY_BYTES || dictionaryHash !== QR_ZSTD_DICTIONARY_HASH) {
        throw new Error("Local QR zstd dictionary hash mismatch. Rebuild the app bundle before using QR sync.");
      }
      await initQrZstd();
      qrZstdCodecHandles = {
        dictionary,
        dictionaryHash,
        cctx: createQrZstdCCtx(),
        dctx: createQrZstdDCtx()
      };
      return qrZstdCodecHandles;
    })();
  }
  return qrZstdCodecPromise;
}

window.addEventListener("pagehide", () => {
  try {
    if (qrZstdCodecHandles?.cctx) freeQrZstdCCtx(qrZstdCodecHandles.cctx);
    if (qrZstdCodecHandles?.dctx) freeQrZstdDCtx(qrZstdCodecHandles.dctx);
  } catch {
    // Context cleanup is best-effort on page teardown.
  }
  qrZstdCodecHandles = null;
  qrZstdCodecPromise = null;
});

async function transformBytesWithCompressionStream(bytes = new Uint8Array(), format = "deflate", StreamClass = null) {
  const ActiveStreamClass = StreamClass || CompressionStream;
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new ActiveStreamClass(format));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function compressBytesWithFormat(bytes = new Uint8Array(), format = "deflate") {
  if (typeof CompressionStream !== "function") return null;
  return transformBytesWithCompressionStream(bytes, format, CompressionStream);
}

async function decompressBytesWithFormat(bytes = new Uint8Array(), format = "deflate") {
  if (typeof DecompressionStream !== "function") {
    throw new Error("This browser cannot open compressed QR checklist links. Use Copy for phone instead.");
  }
  return transformBytesWithCompressionStream(bytes, format, DecompressionStream);
}

function qrPayloadPrefix(kind = "workup") {
  return `${kind === "return" ? "A" : "W"}2${QR_ZSTD_CODEC_KEY}:`;
}

function qrPayloadTokenInfo(token = "") {
  const match = String(token || "").trim().match(/^([WA])2Z:/);
  if (!match) return null;
  return {
    kind: match[1] === "A" ? "return" : "workup",
    codec: { key: QR_ZSTD_CODEC_KEY, format: QR_ZSTD_CODEC_FORMAT, label: "zstd dictionary" },
    prefix: match[0],
    data: String(token || "").trim().slice(match[0].length)
  };
}

export async function optimizedCborQrToken(value, { kind = "workup" } = {}) {
  const cborBytes = cborEncode(value);
  const jsonLength = JSON.stringify(value).length;
  const codec = await qrZstdCodec();
  const compressed = zstdCompressUsingDict(codec.cctx, cborBytes, codec.dictionary, QR_ZSTD_COMPRESSION_LEVEL);
  const restored = zstdDecompressUsingDict(codec.dctx, compressed, codec.dictionary, {
    defaultHeapSize: Math.max(1024 * 1024, cborBytes.length * 4)
  });
  if (!bytesEqual(cborBytes, restored)) {
    throw new Error("Local QR zstd dictionary round-trip failed. Rebuild the QR dictionary before syncing.");
  }
  const token = `${qrPayloadPrefix(kind)}${baseQrEncodeBytes(compressed)}`;
  return {
    token,
    compressed: true,
    binary: true,
    codec: QR_ZSTD_CODEC_KEY,
    codecFormat: QR_ZSTD_CODEC_FORMAT,
    dictionaryHash: codec.dictionaryHash,
    dictionaryId: QR_ZSTD_DICTIONARY_ID,
    registryHash: QR_DEFAULT_REGISTRY_HASH,
    rawCborBytes: cborBytes.length,
    compressedBytes: compressed.length,
    tokenLength: token.length,
    jsonLength,
    candidates: [{
      codec: QR_ZSTD_CODEC_KEY,
      format: QR_ZSTD_CODEC_FORMAT,
      supported: true,
      roundTrip: true,
      chosen: true,
      compressedBytes: compressed.length,
      tokenLength: token.length,
      dictionaryHash: codec.dictionaryHash
    }]
  };
}

export async function decodeOptimizedCborQrToken(token = "", expectedKind = "workup") {
  const info = qrPayloadTokenInfo(token);
  if (!info || (expectedKind && info.kind !== expectedKind)) return null;
  const codec = await qrZstdCodec();
  return cborDecode(zstdDecompressUsingDict(codec.dctx, baseQrDecodeBytes(info.data), codec.dictionary, {
    defaultHeapSize: 1024 * 1024
  }));
}

async function deflateBytes(bytes = new Uint8Array()) {
  return compressBytesWithFormat(bytes, "deflate");
}

async function inflateBytes(bytes = new Uint8Array(), format = "deflate") {
  return decompressBytesWithFormat(bytes, format);
}

export async function deflateCborValue(value) {
  return deflateBytes(cborEncode(value));
}

export async function inflateCborValue(bytes = new Uint8Array(), format = "deflate") {
  return cborDecode(await inflateBytes(bytes, format));
}

export function currentPhoneQrBaseUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url;
}

export function randomBase64Url(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncodeBytes(bytes);
}
