// Pure Microsoft Decision-1 differential scoring: request assembly, response
// parsing, and ranking. No DOM, no storage, no fetch — the UI edge
// (see src/ui/decision-client.js) owns the network call.
//
// Privacy: the caller must supply ONLY de-identified text. This module never
// sees raw chart data; it formats whatever context strings it is given.
//
// Decision-1 runs on OpenRouter's Decisions API (not the chat-completions
// endpoint): one `choice` question carries the candidate diagnoses and the
// response carries a calibrated probability per candidate.

export const DECISION1_OPENROUTER_MODEL = "microsoft/microsoft-decision-1";
export const DECISION1_DECISIONS_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
export const DECISION1_QUESTION_ID = "differential";
export const DECISION1_MIN_CANDIDATES = 2;

function clean(value, limit = 2000) {
  return String(value || "").trim().slice(0, limit);
}

function candidateDescription({ diagnosis, cluesFor, cluesAgainst } = {}) {
  const parts = [`Diagnosis: ${clean(diagnosis, 300)}`];
  const forText = clean(cluesFor, 600);
  const againstText = clean(cluesAgainst, 600);
  if (forText) parts.push(`Clues for: ${forText}`);
  if (againstText) parts.push(`Clues against: ${againstText}`);
  return parts.join(" ");
}

// Assemble the Decisions-API request body that ranks one problem's
// differential. `differentials` is an array of { id, diagnosis, cluesFor,
// cluesAgainst } with plain-string fields. Returns { endpoint, body,
// questionId, optionIds, differentialIds } where optionIds[i] is the
// Decisions-API option id for differentials[i].
export function buildDifferentialScoringRequest({ problem, contextText, differentials } = {}) {
  const candidates = (Array.isArray(differentials) ? differentials : [])
    .map((d) => ({
      id: clean(d?.id, 120),
      diagnosis: clean(d?.diagnosis, 300),
      cluesFor: clean(d?.cluesFor, 800),
      cluesAgainst: clean(d?.cluesAgainst, 800)
    }))
    .filter((d) => d.id && d.diagnosis);
  if (candidates.length < DECISION1_MIN_CANDIDATES) {
    throw new Error(
      `Differential ranking needs at least ${DECISION1_MIN_CANDIDATES} candidate diagnoses; only ${candidates.length} found.`
    );
  }
  const optionIds = candidates.map((_, index) => `dx${index}`);
  const criteria = {};
  for (let index = 0; index < candidates.length; index++) {
    criteria[optionIds[index]] = candidateDescription(candidates[index]);
  }
  const problemName = clean(problem, 300) || "(problem not named)";
  const state = [
    `Clinical problem: ${problemName}`,
    clean(contextText, 6000) || "(no additional patient context provided)"
  ].join("\n");
  return {
    endpoint: DECISION1_DECISIONS_ENDPOINT,
    questionId: DECISION1_QUESTION_ID,
    optionIds,
    differentialIds: candidates.map((d) => d.id),
    body: {
      model: DECISION1_OPENROUTER_MODEL,
      state,
      questions: {
        [DECISION1_QUESTION_ID]: {
          type: "choice",
          instructions:
            "You are ranking candidate diagnoses for ONE clinical problem. " +
            "Given the de-identified clinical context, which diagnosis is most likely to be the correct one? " +
            "Score every candidate honestly, including unlikely but can't-miss diagnoses — " +
            "a low probability is more useful than leaving a candidate out.",
          criteria
        }
      }
    }
  };
}

function isProbability(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

// Validate one Decisions-API response and return the ranked differential:
// { choice, confidence, ranked: [{ optionId, probability }] } sorted
// highest-probability first. Throws on any shape violation — a malformed
// score must never render as a quiet wrong number.
export function parseDifferentialScoringResponse(json, { questionId, optionIds } = {}) {
  const qid = clean(questionId, 100) || DECISION1_QUESTION_ID;
  const expected = Array.isArray(optionIds) ? optionIds.filter(Boolean) : [];
  if (!expected.length) throw new Error("Differential ranking needs the option ids that were sent.");
  const answers = json && typeof json === "object" ? json.answers : null;
  const answer = answers && typeof answers === "object" ? answers[qid] : null;
  if (!answer || typeof answer !== "object") {
    throw new Error("The Decisions API reply did not contain the differential answer.");
  }
  if (answer.type !== "choice") {
    throw new Error(`The Decisions API reply had answer type "${clean(answer.type, 40)}", expected "choice".`);
  }
  const probabilities = answer.probabilities;
  if (!probabilities || typeof probabilities !== "object") {
    throw new Error("The Decisions API reply did not include per-diagnosis probabilities.");
  }
  const ranked = expected.map((optionId) => {
    const probability = probabilities[optionId];
    if (!isProbability(probability)) {
      throw new Error(`The Decisions API reply had no valid probability for candidate "${optionId}".`);
    }
    return { optionId, probability };
  });
  ranked.sort((a, b) => b.probability - a.probability);
  const choice = clean(answer.choice, 120);
  const confidence = isProbability(answer.confidence) ? answer.confidence : null;
  return { choice, confidence, ranked };
}

// "0.723" -> "72%". Probabilities are shown as returned; they are not
// renormalized, so a set that sums below 100% renders exactly as scored.
export function formatProbability(probability) {
  if (!isProbability(probability)) return "—";
  return `${Math.round(probability * 100)}%`;
}
