// TRACK-C2 C8 (candidate): numbered/underscored name labels in plain-label form.
// Covers what C1/C2/C7 miss: "given_name1:", "LN1:", "Last Name 1:",
// "GivenName2:" — label variants with digit suffixes or underscores, outside
// JSON quotes and XML tags. Values are 1-4 Titlecase tokens, same as C1.
function addTrackC8NumberedNameEntities(rawText, entities) {
  const labelRe = /\b(?:given_?names?\d+|last_?names?\d+|first_?names?\d+|middle_?names?\d+|surname\d+|ln\d+|(?:Last|First|Given|Middle)[ _-]+Names?[ _-]*\d+)\b\s*["']?\s*[:=]\s*(?:\*{1,2})?(?:\s*<[^>]*>)?\s*["']?/gi;
  const tokenRe = /(?!(?:Jr|Sr|II|III|IV|VI|MD|DO|PhD|Unknown|Male|Female|None)\b)([A-ZÀ-Þ][A-Za-zÀ-þ'’-]{1,40})\b/y;
  for (const lm of rawText.matchAll(labelRe)) {
    // Skip JSON-quoted keys already handled by C7 ("given_name1": "X") to avoid
    // double work; harmless if both fire (same spans).
    tokenRe.lastIndex = lm.index + lm[0].length;
    for (let n = 0; n < 4; n++) {
      const tm = tokenRe.exec(rawText);
      if (!tm) break;
      pushPatternEntity(entities, rawText, "PATIENT NAME", tm.index,
        tm.index + tm[1].length, "structured identifier", "numbered labeled name");
      const ws = /(?:[ \t]+|[ \t]*,[ \t]*)/y;
      ws.lastIndex = tokenRe.lastIndex;
      const wsm = ws.exec(rawText);
      if (!wsm) break;
      tokenRe.lastIndex = ws.lastIndex;
    }
  }
  tokenRe.lastIndex = 0;
}
