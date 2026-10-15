# Local runtime patches

Base runtime: WebLLM 0.2.85. Keep the existing licenses.

2026-10-15: backport the caller-owned shape tuple reference from merged
[apache/tvm#20501](https://github.com/apache/tvm/pull/20501).
`makeShapeTuple` increments the native reference and attaches a separate wrapper
to the caller's scope. LRU eviction therefore releases the cache's reference
without invalidating a live caller. Failed scope attachment releases the new
reference. This addresses the defect described in
[mlc-ai/web-llm#844](https://github.com/mlc-ai/web-llm/issues/844).

`tests/test-webllm-shape-ownership.js` exercises the vendored method's ownership,
eviction and teardown behavior. Actual model load/self-tests must additionally
verify the pinned model libraries expose `TVMFFIObjectIncRef`.
The runtime identity and worker import revision include this patch. Do not
remove it on a vendor refresh until the replacement includes the upstream fix.
