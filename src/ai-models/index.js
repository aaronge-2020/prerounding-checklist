// Registry of native client-side AI/ML clinical models.
// Pure module: no DOM, no storage, no network.
//
// Each entry ports a peer-reviewed, publicly available clinical AI/ML model
// into plain JavaScript that runs entirely on this device. Unlike
// src/clinical-scores/ (MDCalc calculators), these definitions carry paper
// and code/weights links, a validation note, and optional license/disclaimer
// fields instead of MDCalc references. Ordering follows the ranked
// shortlist from the literature review.

import { qrisk3Definition } from "./qrisk3.js";
import { isaric4cDefinition } from "./isaric4c.js";
import { autoscoreMortalityDefinition } from "./autoscore-mortality.js";
import { recodeDefinition } from "./recode.js";
import { periopXgboostDefinition } from "./periop-xgboost.js";
import { easpSepsisDefinition } from "./easp-sepsis.js";
import { covidgramDefinition } from "./covidgram.js";

export const AI_MODELS = Object.freeze([
  qrisk3Definition,
  isaric4cDefinition,
  autoscoreMortalityDefinition,
  recodeDefinition,
  periopXgboostDefinition,
  easpSepsisDefinition,
  covidgramDefinition
]);

const byId = new Map(AI_MODELS.map((definition) => [definition.id, definition]));

export function getAiModelDefinition(modelId) {
  return byId.get(modelId) || null;
}

export function listAiModelDefinitions() {
  return [...AI_MODELS];
}
