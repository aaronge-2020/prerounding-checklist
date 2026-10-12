import js from "@eslint/js";

const readonlyGlobals = Object.fromEntries([
  "AbortController",
  "Blob",
  "Buffer",
  "CSS",
  "CustomEvent",
  "Event",
  "File",
  "FormData",
  "Headers",
  "Map",
  "MutationObserver",
  "Promise",
  "Request",
  "Response",
  "Set",
  "TextDecoder",
  "TextEncoder",
  "URL",
  "URLSearchParams",
  "Uint8Array",
  "WebAssembly",
  "atob",
  "btoa",
  "clearInterval",
  "clearTimeout",
  "console",
  "crypto",
  "document",
  "fetch",
  "indexedDB",
  "localStorage",
  "navigator",
  "process",
  "queueMicrotask",
  "requestAnimationFrame",
  "setInterval",
  "setTimeout",
  "window"
].map((name) => [name, "readonly"]));

export default [
  {
    ignores: [
      "coverage/**",
      "tests/tmp-*.mjs", // ad hoc local reproduction artifacts
      "docs/benchmarks/**", // archived external benchmark harnesses
      "src/vendor/**", // generated third-party bundles
      "data/clinical-guard-export.js",
      "medical-knowledge-db.js",
      "models/**",
      "node_modules/**",
      "python-deid/**",
      "reports/**",
      "vendor/**",
      "_pipeline_audit.mjs"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: readonlyGlobals
    },
    rules: {
      "no-cond-assign": "off",
      "no-control-regex": "off",
      "no-dupe-keys": "off",
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-regex-spaces": "off",
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression[body.type='BlockStatement'][body.body.length=0]",
          message: "Do not silently swallow promise rejections with .catch(() => {}). Report, rethrow, or document the fallback."
        }
      ],
      "no-undef": "off",
      "no-useless-escape": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  }
];
