// Labeled person names ("Name: Stuhlmüller",
// "<strong>Last Name:</strong> X", "\"Given Name\": \"Y\"",
// "Participant: Ariadna", "Full Name: Alexandru-Claudiu Golding Allaham", "- **Name**: X").
// The existing PATIENT NAME captured patterns require 2-4 tokens in a single
// span, so single-token values after name labels are missed - and the gold
// spans on this sample are 97% single-token, so continuation tokens are
// emitted as separate spans (up to 3). Name suffixes (Jr/Sr/II/...) never
// continue, and obvious non-name values (Unknown, Male, ...) never start.
function addTrackCLabeledNameEntities(rawText, entities) {
  const labelRe = /(?:\*{1,2})?\b(?:Last[ _-]*Name|First[ _-]*Name|Given[ _-]*Names?|Second[ _-]*Given[ _-]*Name|Surname|Full[ _-]*Name|Middle[ _-]*Name|Student[ _-]*Name|Guardian[ _-]*Name|Participant(?:[ _-]*Last[ _-]*Name)?|Patient|Client|Employee|Member|Student|LN|Name|[A-Za-z]+[ _-]+Name)\b(?:\*{1,2})?\s*["']?\s*[:=]\s*(?:\*{1,2})?(?:\s*<[^>]*>)?\s*["']?/gi;
  const tokenRe = /(?!(?:Jr|Sr|II|III|IV|VI|MD|DO|PhD|Unknown|Male|Female|None)\b)([A-ZÀ-Þ][A-Za-zÀ-þ'’-]{1,40})\b/y;
  for (const lm of rawText.matchAll(labelRe)) {
    tokenRe.lastIndex = lm.index + lm[0].length;
    for (let n = 0; n < 4; n++) {
      const tm = tokenRe.exec(rawText);
      if (!tm) break;
      pushPatternEntity(entities, rawText, "PATIENT NAME", tm.index,
        tm.index + tm[1].length, "structured identifier", "labeled name");
      const ws = /(?:[ \t]+|[ \t]*,[ \t]*)/y;
      ws.lastIndex = tokenRe.lastIndex;
      const wsm = ws.exec(rawText);
      if (!wsm) break;
      tokenRe.lastIndex = ws.lastIndex;
    }
  }
  tokenRe.lastIndex = 0;
}

// Names wrapped in name-suggestive XML/HTML tags
// ("<firstname>Bisrat</firstname>", "<lastname>Sassé</lastname>",
// "<givenname1>Nifa</givenname1>"). The tag name itself says the content is
// a name; only the inner text is emitted. Tag
// names are restricted to name-field spellings so generic containers
// ("<td>", "<span>", "<li>") never fire.
function addTrackCTagWrappedNameEntities(rawText, entities) {
  // Name-field tag spellings: firstname/lastname/givenname/surname/... with
  // optional separators and numeric suffixes (givenname1, last_name_1),
  // plus bare first/last/given/name. Generic containers (span/td/strong)
  // are deliberately excluded.
  const nameTagName = /^(?:(?:first|last|given|sur|middle|full)[-_ ]?names?|(?:first|last|given|names?))(?:[_-]?\d+)?$/i;
  for (const match of rawText.matchAll(/<([A-Za-z][\w:.-]*)[^>]*>([^<>]{1,120}?)<\/\1\s*>/g)) {
    const tagName = match[1].replace(/^.*:/, "");
    if (!nameTagName.test(tagName)) continue;
    const inner = match[2];
    if (!/^\s*[A-ZÀ-Þ][A-Za-zÀ-þ'’-]{1,40}(?:[ \t]+[A-ZÀ-Þ][A-Za-zÀ-þ'’-]{1,40}){0,2}\s*$/.test(inner)) continue;
    const openEnd = match[0].indexOf(">") + 1;
    const innerStart = match.index + openEnd;
    // Emit each token as its own span: gold NAME spans are 97% single-token.
    for (const tm of inner.matchAll(/[A-ZÀ-Þ][A-Za-zÀ-þ'’-]{1,40}/g)) {
      const start = innerStart + tm.index;
      pushPatternEntity(entities, rawText, "PATIENT NAME", start, start + tm[0].length,
        "structured identifier", `tag-wrapped name <${match[1]}>`);
    }
  }
}

// Single Titlecase words in square brackets ("[Ariadna]",
// "[Hermien]", "[Dodë]"). Prose anonymization in synthetic exports brackets
// bare names; the existing bracketed-placeholder rule only fires on
// identity-concept content ("[Your Name]"), so these slip through. Digits
// and symbols are excluded to avoid citations ("[1]") and instructions
// ("[START ON 7/16/2026]"); the lowercase tail excludes all-caps markers
// ("[DRAFT]").
function addTrackCBracketedNameEntities(rawText, entities) {
  for (const match of rawText.matchAll(/\[([A-ZÀ-Þ][a-zà-þ'’-]{1,40})\]/g)) {
    pushPatternEntity(entities, rawText, "NAME", match.index + 1,
      match.index + 1 + match[1].length,
      "structured identifier", "bracketed name");
  }
}

// Labeled geographic codes/names ("\"State\": \"ENG\"",
// "\"Country\": \"GB\"", "City: Norwich", "<strong>State:</strong> ENG",
// "<State>ENG</State>", "<City>Norwich</City>"). State/country codes are
// 2-4 uppercase letters; cities are 1-2 Titlecase words. Labels are matched
// case-insensitively (the sample uses Country/country/COUNTRY) while values
// stay case-sensitive via a sticky second pass. Postcodes are deliberately
// excluded (outward-code/ID mechanism conflict, see rules-tuning/results.md).
function addTrackCLabeledLocationEntities(rawText, entities) {
  const codeLabelRe = /\b(?:State|Country)\b(?:\s*<[^>]*>)?\s*["']?\s*[:=]\s*(?:<[^>]*>)?\s*["']?/gi;
  const codeValueRe = /([A-Z]{2,4})\b/y;
  const cityLabelRe = /\bCity\b(?:\s*<[^>]*>)?\s*["']?\s*[:=]\s*(?:<[^>]*>)?\s*["']?/gi;
  const cityValueRe = /([A-ZÀ-Þ][A-Za-zÀ-þ'’-]{1,40}(?:[ \t]+[A-ZÀ-Þ][A-Za-zÀ-þ'’-]{1,40})?)\b/y;
  for (const lm of rawText.matchAll(codeLabelRe)) {
    codeValueRe.lastIndex = lm.index + lm[0].length;
    const vm = codeValueRe.exec(rawText);
    if (!vm) continue;
    pushPatternEntity(entities, rawText, "LOCATION", vm.index,
      vm.index + vm[1].length, "structured identifier", "labeled location");
  }
  for (const lm of rawText.matchAll(cityLabelRe)) {
    cityValueRe.lastIndex = lm.index + lm[0].length;
    const vm = cityValueRe.exec(rawText);
    if (!vm) continue;
    pushPatternEntity(entities, rawText, "LOCATION", vm.index,
      vm.index + vm[1].length, "structured identifier", "labeled location");
  }
  codeValueRe.lastIndex = 0;
  cityValueRe.lastIndex = 0;
  for (const match of rawText.matchAll(/<(State|Country|City)>([^<>]{1,60}?)<\/\1>/gi)) {
    const kind = match[1].toLowerCase();
    const value = match[2].trim();
    const ok = kind === "city"
      ? /^[A-ZÀ-Þ][A-Za-zÀ-þ'’-]{1,40}(?:[ \t]+[A-ZÀ-Þ][A-Za-zÀ-þ'’-]{1,40})?$/.test(value)
      : /^[A-Z]{2,4}$/.test(value);
    if (!ok) continue;
    const start = match.index + match[1].length + 2 + (match[2].length - match[2].trimStart().length);
    pushPatternEntity(entities, rawText, "LOCATION", start, start + value.length,
      "structured identifier", `tag-wrapped location <${match[1]}>`);
  }
}

// Labeled identifiers with space-tolerant values
// ("ID Card Number: \"GR99446RI\"", "social_number: \"30 15 05 51 P08 8\"",
// "Passport Number: \"526498334\""). The existing labeled-ID pattern
// disallows spaces in the value and lacks these labels, so spaced SSNs and
// card/passport/driver-license numbers are missed. The value class excludes
// lowercase letters so it cannot run on into following prose; the value must
// contain a digit and end at a structural boundary.
function addTrackCLabeledIdEntities(rawText, entities) {
  const idRe = new RegExp(String.raw`\b(?:Social[ _-]*(?:Security[ _-]*)?Number|SSN|ID[ _-]*Card(?:[ _-]*Number)?|Passport(?:[ _-]*Number)?|Driver(?:'s)?[ _-]*Licen[cs]e(?:[ _-]*Number)?|National[ _-]*ID|Identification[ _-]*Card(?:[ _-]*Number)?|Case[ _-]*ID|Registration[ _-]*ID)\b\s*["']?\s*[:=]\s*["']?((?=[A-Z0-9 ._-]*\d)[A-Z0-9][A-Z0-9 ._-]{2,30}?[A-Z0-9])["']?(?=\s*[,;}\]<\]\n\r]|$)`, "gi");
  addCapturedEntity(rawText, entities, "ID", idRe, "structured identifier", 1, "labeled id");
}

// JSON name keys: "last_name2": "Sicking", "givenname1": "Ossi",
// "Student_ID": "Daniel-Alexandru". The key must be name-suggestive (C2's
// name-tag test plus person-ID keys); the value must be a bare 1-3 token
// Titlecase name. Values are emitted token-by-token (names are tokenized).
function addTrackCJsonNameEntities(rawText, entities) {
  const keyRe = /^(?:(?:first|last|given|sur|middle|full)[-_ ]?names?|(?:first|last|given|names?)|(?:student|patient|member|client|employee|guardian|mentor|mentee|doctor|provider|therapist|nurse|physician|surgeon)[-_ ]?id|therapist|doctor|physician|nurse)(?:[_-]?\d+)?$/i;
  const denyRe = /^(?:Jr|Sr|II|III|IV|VI|MD|DO|PhD|Unknown|Male|Female|None)$/;
  for (const m of rawText.matchAll(/"([A-Za-z][\w.-]*)"\s*:\s*"([^"]{1,80})"/g)) {
    if (!keyRe.test(m[1])) continue;
    const val = m[2];
    if (!val || /^\s*$/.test(val)) continue;
    if (/\d/.test(val)) continue;
    const tokens = val.trim().split(/[ \t]+/);
    if (tokens.length === 0 || tokens.length > 3) continue;
    if (!tokens.every((t) => /^[A-ZÀ-Þ][A-Za-zÀ-þ'’-]{1,40}$/.test(t) && !denyRe.test(t))) continue;
    // Locate the value's opening quote: search forward from the key for ':' then '"'.
    const colonIdx = m[0].indexOf(':', m[1].length + 2);
    const quoteIdx = m[0].indexOf('"', colonIdx);
    const vStart = m.index + quoteIdx + 1;
    let pos = vStart;
    for (const tok of tokens) {
      const idx = val.indexOf(tok, pos - vStart);
      if (idx < 0) break;
      const s = vStart + idx;
      pushPatternEntity(entities, rawText, "PATIENT NAME", s, s + tok.length, "structured identifier", "json name key \"" + m[1] + "\"");
      pos = s + tok.length + 1;
    }
  }
}
