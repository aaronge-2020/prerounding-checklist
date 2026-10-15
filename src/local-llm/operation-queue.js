// One engine owns its tokenizer, GPU state and decoding matcher. Mutating
// commands must finish before another command can reset or replace that state.
export function createLocalOperationQueue() {
  let tail = Promise.resolve();
  return operation => {
    const result = tail.then(operation);
    // Preserve rejection on the returned result; recover only the scheduling tail.
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}
