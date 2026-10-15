import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createLocalOperationQueue } from "../src/local-llm/operation-queue.js?v=20261015-stable-draft-runtime";

const queued = createLocalOperationQueue();
await assert.rejects(queued(() => Promise.reject(new Error("expected"))), /expected/);
assert.equal(await queued(() => 7), 7, "a failed command does not poison later commands");

// Exercise the actual worker dispatcher with controlled engine operations.
// A reset/model replacement arriving during streaming must not dispose its state.
const events = [], replies = [];
let offline = false, finishChat, enteredChat;
const started = new Promise(resolve => { enteredChat = resolve; });
const blocked = new Promise(resolve => { finishChat = resolve; });
const engine = {
  chat: { completions: { create: async () => (async function* () {
    events.push("chat-start"); enteredChat();
    yield { choices: [{ delta: { content: "synthetic" } }] };
    await blocked;
    events.push("chat-end");
    yield { choices: [{ finish_reason: "stop" }] };
  })() } },
  resetChat: async () => { events.push("reset"); },
  unload: async () => { events.push("unload"); }
};
const self = { postMessage: message => replies.push(message) };
const source = (await readFile(new URL("../src/local-llm/worker.js", import.meta.url), "utf8")).replace(/^import .*;\r?$/gm, "");
vm.runInNewContext(source, { self, createLocalOperationQueue, setWorkerOfflineMode: value => { offline = value; }, CreateMLCEngine: async key => { events.push(`init:${key}`); return engine; }, prebuiltAppConfig: {}, LOCAL_LLM_MODELS: [], hasModelInCache: async () => true, countLoadedModelTokens: () => [1] });
const send = data => self.onmessage({ data });
const untilReply = async id => { for (let i = 0; i < 100 && !replies.some(reply => reply.id === id); i++) await new Promise(resolve => setImmediate(resolve)); assert.ok(replies.some(reply => reply.id === id), `worker replied to ${id}`); };
send({ id: 1, type: "init", modelId: "first" });
await untilReply(1);
send({ id: 2, type: "chat", messages: [], maxTokens: 10 });
await started;
send({ id: 3, type: "reset" });
send({ id: 4, type: "init", modelId: "second", offlineMode: false });
send({ type: "offlineMode", offline: true });
send({ id: 5, type: "tokenize", texts: ["synthetic"] });
assert.equal(offline, true, "offline restrictions apply while generation is blocked");
assert.deepEqual(events, ["init:first", "chat-start"]);
finishChat();
await untilReply(5);
assert.deepEqual(events, ["init:first", "chat-start", "chat-end", "reset", "unload", "init:second"]);
assert.equal(offline, true, "queued init cannot overwrite the newer offline restriction");
assert.ok(replies.some(reply => reply.id === 2 && reply.type === "done"));
assert.deepEqual(Array.from(replies.find(reply => reply.id === 5).counts), [1]);
console.log("Local worker: streaming, reset, replacement and tokenization serialize; offline restrictions remain immediate.");
