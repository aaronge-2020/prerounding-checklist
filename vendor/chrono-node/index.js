// Trimmed English-only entry point for chrono-node v2.10.0
// (https://github.com/wanasit/chrono), MIT licensed - see LICENSE.txt.
// The upstream package's top-level index.js pulls in every locale (~2.2MB);
// this app only ever de-identifies English-language clinical notes, so this
// file re-exports just the "en" locale the same way upstream's locales/en
// index does, keeping the vendored copy to the core parser plus English.
export * from "./locales/en/index.js";
