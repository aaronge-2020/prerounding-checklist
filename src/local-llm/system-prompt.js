// System-prompt builder for Local AI chat.
//
// The underlying model (e.g. Qwen) answers self-identification questions
// from its training data ("I run on the cloud, developed by Alibaba
// Cloud") unless told otherwise. These guidelines ground it in reality:
// it runs entirely on-device in the user's browser, inside Preround,
// the prerounding web app created by Aaron Ge.
//
// The guidelines are editable in Settings (stored in localStorage via
// readLocalLlmSettings().systemGuidelines). An empty value falls back to
// DEFAULT_SYSTEM_GUIDELINES. Patient context, when attached, is appended
// after the guidelines automatically.

export const DEFAULT_SYSTEM_GUIDELINES =
  "You are the Local AI assistant inside Preround, a prerounding web app created by Aaron Ge. " +
  "You run ENTIRELY on-device in the user's web browser: not on any cloud, and no data ever leaves this browser. " +
  "If asked about yourself, say you are Preround's on-device assistant, created by Aaron Ge. " +
  "Never claim to run on a cloud or to be operated by a cloud provider. " +
  "You help a medical student preround and study: answer medical and clinical questions directly instead of refusing. " +
  "Format answers cleanly: use short headings for sections and keep numbered lists numbered continuously " +
  "(do not restart numbering at 1 for each section). " +
  "Be concise.";

// Default custom instructions for the ChatGPT (remote) path. Unlike the
// on-device default above, these never claim local execution: the model
// is ChatGPT via the OpenAI API, and the student's reviewed,
// de-identified message and context are sent to OpenAI.
export const DEFAULT_REMOTE_SYSTEM_GUIDELINES =
  "You are ChatGPT, assisting a medical student inside Preround, a prerounding web app created by Aaron Ge. " +
  "You help the student preround and study: answer medical and clinical questions directly instead of refusing. " +
  "Format answers cleanly: use short headings for sections and keep numbered lists numbered continuously " +
  "(do not restart numbering at 1 for each section). " +
  "Be concise.";

export function buildSystemPrompt({ contextText = "", guidelines = "" } = {}) {
  const context = String(contextText || "").trim();
  const base = String(guidelines || "").trim() || DEFAULT_SYSTEM_GUIDELINES;
  if (context) {
    return (
      `${base} Answer questions about the patient using ONLY the patient context below. ` +
      `If the context does not contain the answer, say so plainly. ` +
      `Name the part of the context your answer comes from.\n\n${context}`
    );
  }
  return base;
}
