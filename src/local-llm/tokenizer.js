// Explicit adapter for the bundled WebLLM 0.2.85 runtime. This is an internal
// runtime boundary, tested with actual models; upgrades must revalidate it.
// Tokenizing never mutates the model conversation or sends text to a network.
export function countLoadedModelTokens(engine, modelId, texts) {
  const tokenizer = engine?.loadedModelIdToPipeline?.get(modelId)?.tokenizer;
  if (!tokenizer || typeof tokenizer.encode !== "function") throw new Error("The loaded browser runtime does not expose the expected local tokenizer. Reload a compatible runtime before drafting.");
  if (!Array.isArray(texts) || texts.some(text => typeof text !== "string")) throw new Error("Tokenizer inputs must be text.");
  return texts.map(text => tokenizer.encode(text).length);
}
