// Preserve explicit clinical field context during model inference. Do not
// whitelist particular words, suppress detections, or guess changed boundaries.
export async function deidentifyLabeledField(rawText, label, deidentify, options) {
  const prefix = `${label}:\n`;
  const result = rawText.trim() ? await deidentify(prefix + rawText, options) : { text: prefix, residualWarnings: [] };
  if (!String(result.text).startsWith(prefix)) throw new Error(`The de-identifier changed the ${label} heading. Nothing was saved; review the source and retry.`);
  return { text: result.text.slice(prefix.length), residualWarnings: result.residualWarnings || result.flags || [] };
}
