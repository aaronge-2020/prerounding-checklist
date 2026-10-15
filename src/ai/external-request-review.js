// Pure final-payload review. Nothing here detects PHI: the caller supplies
// the verified local clinical de-identifier. Review state is session-only.
export const AI_ENDPOINTS = Object.freeze([
  "https://api.openai.com/v1/responses",
  "https://openrouter.ai/api/alpha/decisions"
]);

export function externalRequestFields(body) {
  const fields = [];
  const add = (path, value) => {
    if (typeof value === "string" && value.trim()) fields.push({ path, text: value });
  };
  add(["instructions"], body.instructions);
  add(["state"], body.state);
  if (typeof body.input === "string") add(["input"], body.input);
  else for (const [i, item] of (body.input || []).entries()) {
    if (!item || ![undefined, "message", "function_call", "function_call_output", "reasoning"].includes(item.type) || item.encrypted_content) {
      throw new Error("This input cannot be inspected as plain text. Nothing was sent.");
    }
    for (const key of ["content", "arguments", "output", "summary"]) {
      if (typeof item[key] === "string") add(["input", i, key], item[key]);
      else if (Array.isArray(item[key])) for (const [j, block] of item[key].entries()) {
        if (!["input_text", "output_text", "text", "summary_text"].includes(block.type)) {
          throw new Error("Only text inputs are supported by external privacy review.");
        }
        add(["input", i, key, j, "text"], block.text);
      }
    }
  }
  for (const [id, question] of Object.entries(body.questions || {})) {
    add(["questions", id, "instructions"], question.instructions);
    for (const [option, text] of Object.entries(question.criteria || {})) add(["questions", id, "criteria", option], text);
  }
  return fields;
}

export function validateExternalRequest(endpoint, body, { literatureOnly = false } = {}) {
  if (!AI_ENDPOINTS.includes(endpoint)) throw new Error("This external AI destination is not supported.");
  if (!body || typeof body !== "object" || !body.model) throw new Error("The AI request is incomplete.");
  const supported = new Set(["model", "input", "instructions", "state", "questions", "store", "background", "previous_response_id", "conversation", "text", "temperature", "tools", "tool_choice", "parallel_tool_calls", "include", "reasoning", "max_output_tokens", "top_p"]);
  if (Object.keys(body).some(key => !supported.has(key))) throw new Error("This request contains fields that cannot be reviewed. Nothing was sent.");
  if (body.background || body.previous_response_id || body.conversation) throw new Error("External AI must use a self-contained foreground request.");
  const webTools = (body.tools || []).filter(tool => /^web_search/.test(tool.type));
  if (webTools.length && !literatureOnly) throw new Error("Patient-context requests cannot enable web search. Use a separate literature question.");
  if (literatureOnly && (endpoint !== AI_ENDPOINTS[0] || typeof body.input !== "string" || body.instructions || body.state || body.questions || (body.tools || []).some(tool => tool.type !== "web_search"))) {
    throw new Error("Literature search accepts only a standalone question, without chart context or history.");
  }
  if (literatureOnly && (!body.input.trim() || body.input.length > 2000 || webTools.length !== 1)) throw new Error("Evidence search needs one focused question under 2000 characters and one web search tool.");
  externalRequestFields(body);
}

export function createExternalRequestReview(endpoint, body, options = {}) {
  validateExternalRequest(endpoint, body, options);
  let revision = 0;
  let reviewed = null;
  let reviewedRevision = -1;
  let draft = JSON.parse(JSON.stringify(body));
  // API application-state storage is disabled; this does not assert ZDR.
  if (endpoint === AI_ENDPOINTS[0]) draft.store = false;
  if (options.literatureOnly) {
    draft.tool_choice = "required";
    draft.include = ["web_search_call.action.sources"];
  }
  const paths = externalRequestFields(draft).map(field => field.path);
  const fields = () => paths.map(path => ({ path, text: path.reduce((value, key) => value[key], draft) }));
  function edit(path, text) {
    const field = fields().find(item => JSON.stringify(item.path) === JSON.stringify(path));
    if (!field) throw new Error("Unknown request field.");
    let owner = draft;
    for (const key of path.slice(0, -1)) owner = owner[key];
    owner[path.at(-1)] = String(text);
    revision++;
    reviewed = null;
  }
  async function scan(deidentify) {
    reviewed = null;
    const started = revision;
    const candidate = JSON.parse(JSON.stringify(draft));
    const warnings = [];
    const changedPaths = [];
    const warningPaths = [];
    for (const field of externalRequestFields(candidate)) {
      const result = await deidentify(field.text);
      if (!result || typeof result.text !== "string" || !result.modelId || result.modelChunkFailures) throw new Error("Local de-identification failed. Nothing was sent.");
      if (result.text !== field.text) changedPaths.push(field.path);
      if (result.residualWarnings?.length) warningPaths.push(field.path);
      let owner = candidate;
      for (const key of field.path.slice(0, -1)) owner = owner[key];
      owner[field.path.at(-1)] = result.text;
      for (const warning of result.residualWarnings || []) warnings.push(String(warning?.message || "Residual privacy warning: inspect this request carefully."));
    }
    if (revision !== started) throw new Error("The request changed during scanning. Review it again.");
    validateExternalRequest(endpoint, candidate, options);
    draft = candidate;
    reviewed = JSON.stringify(candidate);
    reviewedRevision = revision;
    return { body: JSON.parse(reviewed), warnings, changedPaths, warningPaths };
  }
  function approve({ reviewedContent = false, permittedProvider = false, reviewedSearchQuestion = false } = {}) {
    if (!reviewed || revision !== reviewedRevision || !reviewedContent || !permittedProvider || (options.literatureOnly && !reviewedSearchQuestion)) {
      throw new Error("Scan and review the exact request and confirm this provider is permitted before sending.");
    }
    const snapshot = reviewed;
    reviewed = null; // Single-use approval. No payload can be appended later.
    return snapshot;
  }
  return { fields, edit, scan, approve };
}

// Presentation groups use explicit request structure, never inferred clinical
// categories. Every field remains editable and is scanned in the full payload.
export function externalReviewGroups(body, fields, { literatureOnly = false } = {}) {
  const latestUser = Array.isArray(body.input) ? body.input.findLastIndex(item => item.role === "user") : -1;
  const groups = new Map();
  for (const field of fields) {
    const root = field.path[0];
    const item = root === "input" && Array.isArray(body.input) ? body.input[field.path[1]] : null;
    const primary = root === "state" || (root === "input" && (typeof body.input === "string" || (item?.role === "user" && field.path[1] === latestUser)));
    const key = primary ? "request" : root === "instructions" || item?.role === "system" || item?.role === "developer" ? "instructions" : root === "questions" ? "ranking" : item?.role === "user" || item?.role === "assistant" ? "history" : "tools";
    const titles = { request: literatureOnly ? "Search question" : "Question and patient context", instructions: "Instructions and preferences", ranking: "Diagnosis ranking options", history: "Earlier conversation", tools: "Tool inputs and results" };
    if (!groups.has(key)) groups.set(key, { key, title: titles[key], primary, fields: [] });
    const label = item?.role === "assistant" ? "AI reply" : item?.role === "user" ? "Your message" : root === "questions" ? (field.path.includes("criteria") ? "Candidate diagnosis" : "Ranking instructions") : root === "state" ? "Patient context" : titles[key];
    groups.get(key).fields.push({ ...field, label });
  }
  return [...groups.values()].sort((a, b) => Number(b.primary) - Number(a.primary));
}
