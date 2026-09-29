// Agent-mode loop for the pre-rounding app, built on the Vercel AI SDK.
//
// runAgent() executes one agentic turn: it sends the (already de-identified
// and student-approved) messages to the model with the five clinical tools,
// lets the model call tools for up to AGENT_MAX_STEPS steps, then returns
// the final text PLUS the deterministic findings captured from tool results.
//
// SAFETY CONTRACT (read before touching):
// - This module never de-identifies anything. Callers MUST pass only
//   content that already passed the HIPAA review gate. The `messages`
//   argument is the approved transmit input verbatim.
// - Tool executions are local (RxNorm/DDInter/DailyMed/calculators). Only
//   the LLM's messages go to OpenAI.
// - fetchImpl should be the app's gated fetch so offline mode fails closed.
// - Every tool result's `deterministic` payload is captured into
//   `deterministicFindings` in call order. The UI pins these as assertion
//   chips; the model's prose is advisory and cannot override them.

import {
  generateText,
  stepCountIs,
  createOpenAI
} from "../vendor/ai-sdk/ai-sdk-bundle.mjs?v=20260929-agent-v1";
import { AGENT_MAX_STEPS } from "./agent-tools.js?v=20260929-agent-tools-v2";
import { AGENT_SYSTEM_PROMPT } from "./agent-prompts.js?v=20260929-agent-v1";

export const AGENT_RUNNER_TAG = "20260929-agent-runner-v2";

/**
 * Normalize one SDK tool-result entry into an audit record.
 *
 * Pure and unit-tested: each local tool's execute() returns
 * { text, deterministic }; the SDK wraps it as { type: 'json', value } or
 * passes it through raw. Provider tools (e.g. web search) return no local
 * payload, so their records keep text/deterministic null. A malformed
 * entry yields a record with nulls — it must never break the run.
 *
 * @returns {{ step, toolName, input, text, deterministic }}
 */
export function toToolRecord(tr, call, stepNumber) {
  const toolName = String(tr?.toolName || call?.toolName || "");
  const input = call?.input ?? null;
  let text = null;
  let deterministic = null;
  try {
    const output = tr?.output;
    // SDK v6 wraps tool output as { type: 'json', value } or raw.
    const value = output && typeof output === "object" && "value" in output
      ? output.value
      : output;
    if (value && typeof value === "object") {
      if (typeof value.text === "string") text = value.text;
      if (value.deterministic && typeof value.deterministic === "object") deterministic = value.deterministic;
    } else if (typeof value === "string") {
      text = value;
    }
  } catch {
    // A malformed tool result must not break the run.
  }
  return { step: stepNumber, toolName, input, text, deterministic };
}

/**
 * Run one agentic turn.
 *
 * @param {object} opts
 * @param {string} opts.apiKey - student's OpenAI key (already validated)
 * @param {string} opts.model - OpenAI model id (from preferences)
 * @param {Array}  opts.messages - approved de-identified messages
 *   ([{role, content}]; the review gate's transmit input)
 * @param {object} opts.tools - the five tools from createAgentTools()
 * @param {Function} opts.fetchImpl - fetch (gated for offline mode)
 * @param {Function} [opts.onStep] - called after each step with
 *   { stepNumber, toolCalls: [{ toolName, input }] }
 * @param {AbortSignal} [opts.abortSignal]
 * @param {string} [opts.systemPrompt] - optional system-prompt override
 *   (defaults to AGENT_SYSTEM_PROMPT). Lets other surfaces (e.g. AI Chat)
 *   reuse the loop with their own reviewed prompt.
 * @param {boolean} [opts.webSearch] - when true, the OpenAI web_search
 *   provider tool is merged into the tool set alongside the local tools.
 *
 * @returns {Promise<{ text, steps, toolCalls, toolResults, deterministicFindings, usage, finishReason }>}
 *   toolResults: per tool call, in order —
 *   [{ step, toolName, input, text, deterministic }]. `text`/`deterministic`
 *   are null for provider tools (e.g. web search) that return no local
 *   payload.
 */
export async function runAgent({
  apiKey,
  model,
  messages,
  tools,
  fetchImpl,
  onStep,
  abortSignal,
  systemPrompt,
  webSearch
} = {}) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("Save an OpenAI API key in Settings before using Agent mode.");
  if (!Array.isArray(messages) || !messages.length) {
    throw new Error("Agent mode needs approved de-identified messages — nothing to send.");
  }
  if (!tools || typeof tools !== "object") {
    throw new Error("Agent mode tools are not available.");
  }

  const openai = createOpenAI({
    apiKey: key,
    // Route through the app's network gate so offline mode fails closed
    // instead of hanging or leaking around the gate.
    fetch: typeof fetchImpl === "function" ? fetchImpl : undefined
  });

  const deterministicFindings = [];
  const toolCalls = [];
  const toolResults = [];
  let stepNumber = 0;

  // The SDK calls onStep for each step; we record tool calls and harvest
  // deterministic payloads from tool results as they arrive.
  //
  // systemPrompt lets callers (e.g. AI Chat) reuse this loop with their own
  // already-reviewed prompt instead of the Agent-mode default.
  const effectiveSystemPrompt =
    typeof systemPrompt === "string" && systemPrompt.trim()
      ? systemPrompt
      : AGENT_SYSTEM_PROMPT;
  // Optional OpenAI web_search provider tool, merged with the local tools.
  // Kept off unless the caller asks: local tools never touch the network.
  const effectiveTools = webSearch
    ? { ...tools, web_search: openai.tools.webSearch({}) }
    : tools;
  const result = await generateText({
    model: openai(model),
    system: effectiveSystemPrompt,
    messages: messages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
      content: String(m.content || "")
    })),
    tools: effectiveTools,
    stopWhen: stepCountIs(AGENT_MAX_STEPS),
    abortSignal,
    onStepFinish: ({ toolCalls: stepToolCalls, toolResults: stepToolResults }) => {
      stepNumber += 1;
      for (const call of stepToolCalls || []) {
        toolCalls.push({
          step: stepNumber,
          toolName: String(call.toolName || ""),
          input: call.input ?? null
        });
      }
      // Harvest one audit record per tool result; deterministic payloads
      // are pinned separately for UIs that render them as assertions.
      const callsByName = stepToolCalls || [];
      (stepToolResults || []).forEach((tr, index) => {
        const record = toToolRecord(tr, callsByName[index] || {}, stepNumber);
        toolResults.push(record);
        if (record.deterministic) {
          deterministicFindings.push({
            step: record.step,
            toolName: record.toolName,
            ...record.deterministic
          });
        }
      });
      if (typeof onStep === "function") {
        try {
          onStep({
            stepNumber,
            toolCalls: toolCalls.filter((c) => c.step === stepNumber)
          });
        } catch {
          // UI callback failures must not break the run.
        }
      }
    }
  });

  return {
    text: String(result.text || ""),
    steps: stepNumber,
    toolCalls,
    toolResults,
    deterministicFindings,
    usage: result.usage
      ? {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
          totalTokens: result.usage.totalTokens ?? 0
        }
      : null,
    finishReason: String(result.finishReason || "")
  };
}
