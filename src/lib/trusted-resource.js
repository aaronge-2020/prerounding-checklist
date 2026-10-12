let policy;
export function trustedWorkerUrl(value) {
  const url = new URL(String(value), import.meta.url);
  const roots = ['../../service-worker.js', '../patient-context/deid-worker.js?v=20261012-safety', '../local-llm/worker.js?v=20261012-safety', '../rag/rag-worker.js', '../scribe-parakeet/parakeet-worker.js'].map(path => new URL(path, import.meta.url));
  if (!roots.some(root => root.origin === url.origin && root.pathname === url.pathname)) throw new Error('Unapproved worker resource.');
  if (!globalThis.trustedTypes) return url.href;
  policy ||= globalThis.trustedTypes.createPolicy('prerounding-resources', { createScriptURL: input => {
    const candidate = new URL(input);
    if (!roots.some(root => root.origin === candidate.origin && root.pathname === candidate.pathname)) throw new Error('Unapproved worker resource.');
    return candidate.href;
  } });
  return policy.createScriptURL(url.href);
}
