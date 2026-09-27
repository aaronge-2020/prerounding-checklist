// Registry of native clinical score calculators.
// Pure module: no DOM, no storage, no network.
//
// Each entry mirrors the corresponding MDCalc calculator one-to-one
// (same inputs, same point values, same formulas, same interpretations).
// The registry is the single source the MD Calc tab renders from.

import { bishopDefinition } from "./bishop.js";
import { apgarDefinition } from "./apgar.js";
import { vbacFlammDefinition } from "./vbac-flamm.js";
import { vbacMfmuDefinition } from "./vbac-mfmu.js";
import { dueDatesDefinition } from "./due-dates.js";
import { chadsvascDefinition } from "./chadsvasc.js";
import { hasbledDefinition } from "./hasbled.js";
import { heartDefinition } from "./heart.js";
import { timiDefinition } from "./timi.js";
import { graceDefinition } from "./grace.js";
import { wellsDvtDefinition } from "./wells-dvt.js";
import { wellsPeDefinition } from "./wells-pe.js";
import { percDefinition } from "./perc.js";
import { curb65Definition } from "./curb65.js";
import { lightsDefinition } from "./lights.js";
import { meldnaDefinition } from "./meldna.js";
import { childPughDefinition } from "./child-pugh.js";
import { fib4Definition } from "./fib4.js";
import { fenaDefinition } from "./fena.js";
import { crclDefinition } from "./crcl.js";
import { qsofaDefinition } from "./qsofa.js";
import { sofaDefinition } from "./sofa.js";
import { blatchfordDefinition } from "./blatchford.js";
import { anionGapDefinition } from "./anion-gap.js";
import { correctedCalciumDefinition } from "./corrected-calcium.js";

export const CLINICAL_SCORES = Object.freeze([
  bishopDefinition,
  apgarDefinition,
  vbacFlammDefinition,
  vbacMfmuDefinition,
  dueDatesDefinition,
  chadsvascDefinition,
  hasbledDefinition,
  heartDefinition,
  timiDefinition,
  graceDefinition,
  wellsDvtDefinition,
  wellsPeDefinition,
  percDefinition,
  curb65Definition,
  lightsDefinition,
  meldnaDefinition,
  childPughDefinition,
  fib4Definition,
  fenaDefinition,
  crclDefinition,
  qsofaDefinition,
  sofaDefinition,
  blatchfordDefinition,
  anionGapDefinition,
  correctedCalciumDefinition
]);

const byId = new Map(CLINICAL_SCORES.map((definition) => [definition.id, definition]));

export function getScoreDefinition(scoreId) {
  return byId.get(scoreId) || null;
}

export function listScoreDefinitions() {
  return [...CLINICAL_SCORES];
}
