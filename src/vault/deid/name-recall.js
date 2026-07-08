/**
 * Dictionary-driven person-name recall for de-identification.
 *
 * The NER-model and regex layers in deid.js only catch names that are well
 * formatted ("First Last", capitalized, near a label). This layer catches the
 * rest — lowercase relatives ("her daughter maria gonzalez"), ALL-CAPS chart
 * headers ("SMITH, JOHN R"), comma-reversed names, and names of contacts with
 * no honorific — by looking every token up in real name dictionaries
 * (US Census surnames + SSA given names) and scoring the surrounding context.
 *
 * Every candidate gets an additive evidence score; only candidates that clear
 * the threshold are emitted. Tokens that double as English words, clinical
 * vocabulary, or clinical eponyms (Foley, Glasgow, Whipple...) are marked
 * ambiguous in the dictionary and contribute no base score, so they are only
 * redacted with explicit name context ("Ms. Foley"), never as bare clinical
 * usage ("Foley catheter").
 */

import { givenNames, surnames, ambiguousNameTokens } from "./name-dictionary.js";

const EMIT_THRESHOLD = 4;

const relationshipWords = new Set([
  "daughter", "son", "mother", "father", "mom", "dad", "wife", "husband",
  "spouse", "partner", "sister", "brother", "aunt", "uncle", "grandmother",
  "grandma", "grandfather", "grandpa", "granddaughter", "grandson", "niece",
  "nephew", "cousin", "friend", "neighbor", "girlfriend", "boyfriend",
  "fiance", "fiancee", "caregiver", "guardian", "sitter", "roommate",
  "kin", "proxy", "poa", "stepmother", "stepfather", "stepdaughter",
  "stepson", "godmother", "godfather", "granddad", "grandkid", "grandchild"
]);

const providerRoleWords = new Set([
  "dr", "doctor", "md", "do", "np", "pa", "rn", "lpn", "cna", "nurse",
  "physician", "provider", "attending", "resident", "intern", "fellow",
  "consultant", "surgeon", "therapist", "pharmacist", "dietitian",
  "chaplain", "midwife", "pcp", "hospitalist", "anesthesiologist"
]);

const credentialWords = new Set([
  "md", "do", "np", "pa", "pa-c", "rn", "lpn", "crna", "pharmd", "phd",
  "msw", "lcsw", "aprn", "fnp", "dnp", "rd", "rrt", "emt"
]);

const honorificWords = new Set(["mr", "mrs", "ms", "miss", "mx", "dr", "doctor", "prof", "professor"]);

const patientRefWords = new Set(["patient", "pt"]);

// Words that, immediately after a name-like token, mean the token is a
// clinical eponym or device rather than a person ("Foley catheter",
// "Glasgow Coma Scale", "Wells score", "Whipple procedure").
const eponymCompanionWords = new Set([
  "catheter", "cath", "drain", "tube", "sump", "score", "scores", "scale",
  "sign", "signs", "test", "tests", "testing", "maneuver", "procedure",
  "protocol", "criteria", "classification", "class", "stage", "staging",
  "grade", "grading", "syndrome", "disease", "fracture", "repair", "pouch",
  "anastomosis", "position", "solution", "bodies", "cells", "node", "nodes",
  "mass", "ulcer", "hernia", "triad", "reflex", "murmur", "contracture",
  "tear", "lesion", "palsy", "phenomenon", "effect", "method", "technique",
  "formula", "equation", "index", "dressing", "collar", "splint", "boot",
  "brace", "coma", "airway", "bath", "stockings", "traction", "tract"
]);

const personVerbAfterPattern = /^(?:was|is|has|had|states?|stated|reports?|reported|denies?|denied|presents?|presented|arrived|came|called|said|says|endorses?|complains?|complained|tolerated|remains?|remained|underwent|feels?|felt|lives?|works?|visited|verbalized|agrees?|agreed|refused|requests?|requested|declines?|declined|ambulated|voiced|notes?|noted)$/i;

const communicationVerbWords = new Set([
  "with", "spoke", "called", "updated", "contacted", "notified", "met",
  "talked", "paged", "informed", "per", "discussed"
]);

const nameFieldLabelPattern = /(?:name|contact|contacts|kin|poa|guardian|caregiver|mother|father|spouse|daughter|son|proxy|informant|witness|visitor|signed|prepared|dictated|entered|verified|read|interpreted|performed|completed|cosigned)\s*(?:\([^)]*\))?\s*(?:by)?\s*[:#=-]\s*$/i;

function tokenizeWords(text) {
  const tokens = [];
  const regex = /[A-Za-z][A-Za-z'’-]*/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const raw = match[0];
    let norm = raw.toLowerCase().replace(/(?:'|’)s$/, "").replace(/(?:'|’)$/, "");
    const possessive = norm !== raw.toLowerCase();
    tokens.push({
      raw,
      norm,
      start: match.index,
      end: match.index + raw.length,
      possessive,
      isInitial: raw.length === 1 && /^[A-Z]$/.test(raw),
      cap: /^[A-Z]/.test(raw) && /[a-z]/.test(raw),
      allCaps: raw.length > 1 && raw === raw.toUpperCase()
    });
  }
  return tokens;
}

// Pronouns and role words double as rare Census surnames ("Her", "Neighbor",
// "Nurse", "Friend" all appear in the surname list). They are context, never
// name-group members — otherwise "neighbor Bob" groups as "Neighbor Bob" and
// the real name is scored away.
const pronounWords = new Set([
  "i", "me", "my", "mine", "he", "she", "him", "her", "his", "hers",
  "they", "them", "their", "theirs", "it", "its", "we", "us", "our",
  "ours", "you", "your", "yours", "this", "that", "these", "those"
]);

function isContextOnlyToken(norm) {
  return pronounWords.has(norm) ||
    relationshipWords.has(norm) ||
    providerRoleWords.has(norm) ||
    honorificWords.has(norm) ||
    patientRefWords.has(norm) ||
    communicationVerbWords.has(norm);
}

function classifyToken(token, isClinicalToken) {
  const norm = token.norm;
  const given = givenNames.has(norm);
  const sur = surnames.has(norm);
  const clinical = Boolean(isClinicalToken && isClinicalToken(norm));
  const ambiguous = ambiguousNameTokens.has(norm) || clinical;
  return {
    given,
    sur,
    clinical,
    ambiguous,
    strongName: (given || sur) && !ambiguous,
    nameish: (given || sur || token.isInitial) && !isContextOnlyToken(norm)
  };
}

function separatorBetween(text, left, right) {
  return text.slice(left.end, right.start);
}

function isJoinableSeparator(separator, afterInitial) {
  if (/^[ \t]{1,3}$/.test(separator)) {
    return true;
  }
  if (/^,[ \t]{0,3}$/.test(separator)) {
    return true;
  }
  if (afterInitial && /^\.[ \t]{0,3}$/.test(separator)) {
    return true;
  }
  return false;
}

function lineBoundsAt(text, index) {
  const start = text.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
  const endIndex = text.indexOf("\n", index);
  return { start, end: endIndex === -1 ? text.length : endIndex };
}

/**
 * Collect dictionary-based person-name candidates.
 *
 * options:
 *   isClinicalToken(norm)       -> bool  (clinical guard vocabulary lookup)
 *   zoneTypeForSpan(start, end) -> "lab" | "vitals" | "meds" | "imaging" | "narrative"
 *
 * Returns [{ start, end, label, score, strongContext, context }]
 */
export function collectDictionaryNameCandidates(rawText, options = {}) {
  const text = String(rawText || "");
  if (!text) {
    return [];
  }
  const isClinicalToken = options.isClinicalToken || null;
  const zoneTypeForSpan = options.zoneTypeForSpan || null;
  const tokens = tokenizeWords(text);
  const classes = tokens.map((token) => classifyToken(token, isClinicalToken));
  const candidates = [];

  let index = 0;
  while (index < tokens.length) {
    if (!classes[index].nameish) {
      index += 1;
      continue;
    }
    // A bare initial can only start a group when a dictionary token follows it.
    if (tokens[index].isInitial && !classes[index].given && !classes[index].sur) {
      const next = index + 1;
      const separator = next < tokens.length ? separatorBetween(text, tokens[index], tokens[next]) : "";
      if (!(next < tokens.length && (classes[next].given || classes[next].sur) && isJoinableSeparator(separator, true))) {
        index += 1;
        continue;
      }
    }

    // Build the longest joinable run of nameish tokens (max 4).
    const group = [index];
    let commaJoin = false;
    while (group.length < 4) {
      const lastIndex = group[group.length - 1];
      const nextIndex = lastIndex + 1;
      if (nextIndex >= tokens.length || !classes[nextIndex].nameish) {
        break;
      }
      const separator = separatorBetween(text, tokens[lastIndex], tokens[nextIndex]);
      if (!isJoinableSeparator(separator, tokens[lastIndex].isInitial)) {
        break;
      }
      if (/,/.test(separator)) {
        // Only allow one comma join, and only for "Surname, Given" shape.
        if (commaJoin || !(classes[lastIndex].sur || tokens[lastIndex].allCaps) || !classes[nextIndex].given) {
          break;
        }
        commaJoin = true;
      }
      group.push(nextIndex);
    }

    // A group must contain at least one dictionary token (not only initials).
    const dictMembers = group.filter((i) => classes[i].given || classes[i].sur);
    if (!dictMembers.length) {
      index = group[group.length - 1] + 1;
      continue;
    }

    const first = tokens[group[0]];
    const last = tokens[group[group.length - 1]];
    const spanStartToken = group[0];
    const line = lineBoundsAt(text, first.start);
    const prefixInLine = text.slice(line.start, first.start);
    const afterText = text.slice(last.end, Math.min(text.length, last.end + 60));

    // Neighboring word tokens (same line only for before-context).
    const beforeTokens = [];
    for (let b = spanStartToken - 1; b >= 0 && beforeTokens.length < 4; b -= 1) {
      if (tokens[b].end < line.start) {
        break;
      }
      beforeTokens.push(tokens[b]);
    }
    const afterTokenIndex = group[group.length - 1] + 1;
    const nextToken = afterTokenIndex < tokens.length ? tokens[afterTokenIndex] : null;
    const nextTokenSameLine = nextToken && nextToken.start <= line.end ? nextToken : null;

    // ── Context signals ──
    const honorificBefore = beforeTokens.length &&
      honorificWords.has(beforeTokens[0].norm) &&
      /^[.\s]{0,3}$/.test(separatorBetween(text, beforeTokens[0], first));
    const relationshipBefore = beforeTokens.slice(0, 2).some((token) => relationshipWords.has(token.norm));
    const relationshipAfter = /^\s*\(\s*(?:[a-z]+\s+)?[a-z]+\s*\)/i.test(afterText) &&
      relationshipWords.has((afterText.match(/\(\s*(?:[a-z]+\s+)?([a-z]+)\s*\)/i) || [])[1]?.toLowerCase() || "");
    const providerBefore = beforeTokens.some((token) => providerRoleWords.has(token.norm)) ||
      /(?:seen by|signed by|cosigned by|staffed with|read by|verified by|performed by|interpreted by|dictated by)\s*$/i.test(prefixInLine);
    const credentialAfter = /^\s*[,]?\s*(?:MD|DO|NP|PA-?C?|RN|LPN|CRNA|PharmD|PhD|MSW|LCSW|APRN|FNP|DNP|RD|RRT|EMT)\b/.test(afterText) &&
      (afterText.trim().startsWith(",") || credentialWords.has((afterText.trim().split(/\s+/)[0] || "").toLowerCase()));
    const fieldLabelBefore = nameFieldLabelPattern.test(prefixInLine);
    const patientBefore = beforeTokens.some((token) => patientRefWords.has(token.norm));
    const communicationBefore = beforeTokens.slice(0, 2).some((token) => communicationVerbWords.has(token.norm)) &&
      beforeTokens.some((token) => communicationVerbWords.has(token.norm) && token.norm !== "with");
    const personVerbAfter = nextTokenSameLine ? personVerbAfterPattern.test(nextTokenSameLine.raw) : false;
    const agePatternAfter = /^\s*(?:is|was)?\s*,?\s*(?:an?\s+)?\d{1,3}\s*[- ]?(?:y\.?o\.?|yo|year)/i.test(afterText);
    const eponymCompanionAfter = nextTokenSameLine ? eponymCompanionWords.has(nextTokenSameLine.norm) : false;
    const possessive = tokens[group[group.length - 1]].possessive || first.possessive;

    const hasStrongContext = Boolean(
      honorificBefore || relationshipBefore || relationshipAfter || providerBefore ||
      credentialAfter || fieldLabelBefore || communicationBefore || agePatternAfter
    );

    // ── Score ──
    let score = 0;
    let strongTokens = 0;
    let clinicalTokens = 0;
    let capitalizedTokens = 0;
    let allCapsTokens = 0;
    group.forEach((i) => {
      if (classes[i].strongName) {
        score += 2;
        strongTokens += 1;
      }
      if (classes[i].clinical) {
        clinicalTokens += 1;
      }
      if (tokens[i].cap || tokens[i].isInitial) {
        capitalizedTokens += 1;
      }
      if (tokens[i].allCaps) {
        allCapsTokens += 1;
      }
    });

    const givenFirst = classes[group[0]].given;
    const surLast = classes[group[group.length - 1]].sur;
    const fullNameShape = group.length >= 2 && ((givenFirst && surLast) || commaJoin);
    if (fullNameShape) {
      score += 2;
    }
    if (commaJoin && allCapsTokens >= 1) {
      score += 2;
    }
    if (capitalizedTokens === group.length && group.length >= 1 && !allCapsTokens) {
      score += 1;
    }
    if (honorificBefore) score += 4;
    if (relationshipBefore || relationshipAfter) score += 4;
    if (fieldLabelBefore) score += 4;
    if (providerBefore || credentialAfter) score += 4;
    if (communicationBefore) score += 3;
    if (personVerbAfter) score += 2;
    if (agePatternAfter) score += 2;
    if (possessive) score += 1;

    if (clinicalTokens && !honorificBefore && !fieldLabelBefore) {
      score -= 4 * clinicalTokens;
    }
    if (eponymCompanionAfter && !honorificBefore && !relationshipBefore && !fieldLabelBefore) {
      score -= 5;
    }
    if (!hasStrongContext && capitalizedTokens < group.length && !allCapsTokens) {
      // Lowercase or mixed casing without any explicit name context.
      score -= 2;
    }
    if (!hasStrongContext && group.length === 1 && !possessive && !personVerbAfter) {
      // A bare single dictionary token in prose is weak evidence on its own.
      score -= 2;
    }

    let zoneType = "narrative";
    if (zoneTypeForSpan) {
      zoneType = zoneTypeForSpan(first.start, last.end) || "narrative";
      if (zoneType !== "narrative" && !hasStrongContext) {
        score -= 3;
      }
    }

    if (score >= EMIT_THRESHOLD) {
      let label = "NAME";
      if (providerBefore || credentialAfter || honorificBefore && (beforeTokens[0]?.norm === "dr" || beforeTokens[0]?.norm === "doctor")) {
        label = "PROVIDER NAME";
      } else if (relationshipBefore || relationshipAfter) {
        label = "CONTACT NAME";
      } else if (patientBefore || agePatternAfter || /patient name|pt name/i.test(prefixInLine)) {
        label = "PATIENT NAME";
      }

      let start = first.start;
      if (honorificBefore) {
        start = beforeTokens[0].start;
      }
      let end = last.end;
      if (text[end] === "." && last.isInitial) {
        end += 1;
      }

      candidates.push({
        start,
        end,
        label,
        score,
        strongContext: hasStrongContext,
        context: [
          honorificBefore && "honorific",
          relationshipBefore && "relationship word",
          relationshipAfter && "relationship tag",
          fieldLabelBefore && "field label",
          providerBefore && "provider role",
          credentialAfter && "credential",
          communicationBefore && "communication verb",
          personVerbAfter && "person verb",
          agePatternAfter && "age pattern",
          fullNameShape && "full-name shape",
          `dictionary x${strongTokens}`
        ].filter(Boolean).join(", ")
      });
    }

    index = group[group.length - 1] + 1;
  }

  return candidates;
}
