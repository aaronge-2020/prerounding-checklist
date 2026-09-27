/**
 * Minimal pure-JS XGBoost inference.
 *
 * Walks the "learner" JSON format written by Booster.save_model("model.json")
 * (the format the vendored EASP and perioperative models were converted to).
 * Supports gbtree boosters with numeric splits, missing-value routing through
 * each node's default child, and the common objectives:
 *   binary:logistic -> sigmoid(margin); reg:squarederror -> margin.
 * Categorical splits are rejected loudly (none of the vendored models use them).
 *
 * Semantics verified against native xgboost predictions:
 *   - the stored base_score for binary:logistic is a probability; the initial
 *     margin is logit(base_score) (checked with a trained tiny model at
 *     base_score=0.7, plus the vendored models);
 *   - each tree contributes its leaf value (base_weights[leaf]) directly;
 *     the learning rate is already baked into the stored leaf values by
 *     modern xgboost, and the vendored EASP weights were rescaled at build
 *     time for the same reason (see weights/easp-sepsis-models.js header).
 *
 * No dependencies, no DOM, no storage, no network. Pure arithmetic.
 */

/** base_score sometimes ships as a bracketed string ("[2.2682887E-1]"); tolerate it. */
function parseBaseScore(raw) {
  if (raw === undefined || raw === null) return 0.5;
  const n = parseFloat(String(raw).replace(/[\[\]]/g, ""));
  return Number.isFinite(n) ? n : 0.5;
}

function logit(p) {
  const c = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
  return Math.log(c / (1 - c));
}

function sigmoid(x) {
  if (x >= 0) {
    const e = Math.exp(-x);
    return 1 / (1 + e);
  }
  const e = Math.exp(x);
  return e / (1 + e);
}

function evalTree(tree, getValue) {
  const left = tree.left_children;
  const right = tree.right_children;
  const splitIdx = tree.split_indices;
  const splitCond = tree.split_conditions;
  const splitType = tree.split_type;
  const defLeft = tree.default_left;
  const weights = tree.base_weights;
  let i = 0;
  for (;;) {
    if (left[i] === -1) return weights[i]; // leaf
    if (splitType && splitType[i] !== 0) {
      throw new Error("predictXgboost: categorical splits are not supported");
    }
    const v = getValue(splitIdx[i]);
    if (v === undefined || v === null || Number.isNaN(v)) {
      i = defLeft[i] === 1 ? left[i] : right[i]; // missing child
    } else {
      // Native XGBoost stores features and split thresholds as float32 and
      // compares in float32. Rounding both sides to float32 reproduces the
      // native branch decision exactly, including thresholds that sit on a
      // float32 rounding boundary (e.g. periop XGB-INS-A bmi == 19.5918369).
      i = Math.fround(v) < Math.fround(splitCond[i]) ? left[i] : right[i];
    }
  }
}

/**
 * Predict with a parsed XGBoost learner JSON.
 * @param {object} modelJson - parsed JSON; either the whole file ({learner,…})
 *   or the learner object itself.
 * @param {object|number[]} features - {featureName: value} keyed by
 *   learner.feature_names, or a positional array (used when the model was
 *   trained without feature names, e.g. the EASP ensemble).
 * @returns {number} probability for binary:logistic, else the raw margin.
 */
function predictXgboost(modelJson, features) {
  const learner = modelJson.learner || modelJson;
  const params = learner.learner_model_param || {};
  const names = learner.feature_names || [];
  const getValue = Array.isArray(features)
    ? (i) => features[i]
    : (i) => features[names[i] === undefined ? "f" + i : names[i]];
  const trees = learner.gradient_booster.model.trees;
  const objective =
    (learner.objective && learner.objective.name) || params.objective || "";
  let margin;
  if (objective === "binary:logistic") {
    margin = logit(parseBaseScore(params.base_score));
  } else if (objective === "reg:squarederror") {
    margin = parseBaseScore(params.base_score);
  } else {
    throw new Error("predictXgboost: unsupported objective " + JSON.stringify(objective));
  }
  for (const tree of trees) margin += evalTree(tree, getValue);
  if (objective === "binary:logistic") return sigmoid(margin);
  return margin;
}

export { predictXgboost };
export const _xgboostInternals = { parseBaseScore, logit, sigmoid, evalTree };
