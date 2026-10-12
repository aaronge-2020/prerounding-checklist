// One pure request builder shared by the inspector and transport.
export function buildStructuredRequest({ model, input, instructions, temperature, schemaName, schema, tools } = {}) {
  const body = { model, input, store: false, text: { format: { type: "json_schema", name: schemaName, strict: true, schema } } };
  if (instructions !== undefined) body.instructions = String(instructions);
  if (temperature !== undefined && temperature !== "" && temperature !== null) {
    const value = Number(temperature);
    if (!Number.isFinite(value) || value < 0 || value > 2) throw new Error("Temperature must be between 0 and 2, or blank for the model default.");
    body.temperature = value;
  }
  if (Array.isArray(tools) && tools.length) body.tools = tools;
  return body;
}
