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
} from "../../vendor/ai-sdk/ai-sdk-bundle.mjs?v=20260929-agent-v1";
import { AGENT_MAX_STEPS } from "./agent-tools.js?v=20260929-agent-tools-v1";
import { AGENT_SYSTEM_PROMPT } from "./agent-prompts.js?v=20260929-agent-v1";

export const AGENT_RUNNER_TAG = "20260929-agent-runner-v1";

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
 *
 * @returns {Promise<{ text, steps, toolCalls, deterministicFindings, usage, finishReason }>}
 */
export async function runAgent({
  apiKey,
  model,
  messages,
  tools,
  fetchImpl,
  onStep,
  abortSignal
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
  let stepNumber = 0;

  // The SDK calls onStep for each step; we record tool calls and harvest
  // deterministic payloads from tool results as they arrive.
  const result = await generateText({
    model: openai(model),
    system: AGENT_SYSTEM_PROMPT,
    messages: messages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
      content: String(m.content || "")
    })),
    tools,
    stopWhen: stepCountIs(AGENT_MAX_STEPS),
    abortSignal,
    onStepFinish: ({ toolCalls: stepToolCalls, toolResults }) => {
      stepNumber += 1;
      for (const call of stepToolCalls || []) {
        toolCalls.push({
          step: stepNumber,
          toolName: String(call.toolName || ""),
          input: call.input ?? null
        });
      }
      // Harvest deterministic payloads: each tool's execute() returns
      // { text, deterministic }. The SDK wraps it; unwrap carefully.
      for (const tr of toolResults || []) {
        try {
          const output = tr?.output;
          // SDK v6 wraps tool output as { type: 'json', value } or raw.
          const value = output && typeof output === "object" && "value" in output
            ? output.value
            : output;
          const det = value && typeof value === "object" ? value.deterministic : null;
          if (det && typeof det === "object") {
            deterministicFindings.push({
              step: stepNumber,
              toolName: String(tr.toolName || ""),
              ...det
            });
          }
        } catch {
          // A malformed tool result must not break the run.
        }
      }
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
