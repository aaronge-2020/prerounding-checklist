import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Run the actual vendored method against reference-counted objects and a tiny
// evicting cache. Mirrors the ownership regression covered by apache/tvm#20501.
const source = await readFile(new URL("../vendor/web-llm/index.js", import.meta.url), "utf8");
const start = source.indexOf("makeShapeTuple(shape) {");
assert.ok(start > 0);
const method = source.slice(start, source.indexOf("\n\t\t        /**", start));
const references = new Map();
let next = 1;
class TVMObject {
  constructor(handle) { this.handle = handle; }
  getHandle() { if (!this.handle || !references.get(this.handle)) throw new Error("already been disposed"); return this.handle; }
  dispose() { if (this.handle) { references.set(this.handle, references.get(this.handle) - 1); this.handle = 0; } }
}
const makeShapeTuple = vm.runInNewContext(`({${method}}).makeShapeTuple`, { TVMObject, CacheState: { computeShapeKey: JSON.stringify }, Scalar: class {} });
const scope = [], cache = new Map();
const runtime = {
  ctx: { makeShapeTuple() { const handle = next++; references.set(handle, 1); const tuple = new TVMObject(handle); scope.push(tuple); return tuple; } },
  lib: { exports: { TVMFFIObjectIncRef(handle) { references.set(handle, references.get(handle) + 1); return 0; } }, checkCall: value => assert.equal(value, 0) },
  detachFromCurrentScope(tuple) { scope.splice(scope.indexOf(tuple), 1); },
  attachToCurrentScope(tuple) { if (this.rejectAttach) throw new Error("scope unavailable"); scope.push(tuple); return tuple; },
  cacheState: { shapeCache: { get(key, create) { if (cache.has(key)) return cache.get(key); if (cache.size === 2) { const oldest = cache.keys().next().value; cache.get(oldest).dispose(); cache.delete(oldest); } const value = create(); cache.set(key, value); return value; } } }
};
const released = makeShapeTuple.call(runtime, [1]); released.dispose();
const held = makeShapeTuple.call(runtime, [1]);
const handle = held.getHandle();
makeShapeTuple.call(runtime, [2]); makeShapeTuple.call(runtime, [3]);
assert.equal(held.getHandle(), handle, "eviction releases only the cache reference");
runtime.rejectAttach = true;
assert.throws(() => makeShapeTuple.call(runtime, [4]), /scope unavailable/);
assert.equal(references.get(next - 1), 1, "failed scope attachment releases the caller reference");
for (const tuple of scope) tuple.dispose();
for (const tuple of cache.values()) tuple.dispose();
assert.ok([...references.values()].every(count => count === 0), "scope and cache teardown release all references");
console.log("Vendored TVM: caller ownership survives cache eviction and disposal; failed attachment and teardown release references.");
