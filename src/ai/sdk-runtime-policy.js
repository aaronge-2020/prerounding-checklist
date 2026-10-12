// Zod supports an interpreter path. Select it before evaluating the SDK so
// schema initialization never attempts Function/eval under our strict CSP.
globalThis.__zod_globalConfig = { ...globalThis.__zod_globalConfig, jitless: true };
