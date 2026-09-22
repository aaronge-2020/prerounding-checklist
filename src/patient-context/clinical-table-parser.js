function compactLine(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normalizeHeaderToken(value) {
  return compactLine(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const TABLE_SCHEMAS = Object.freeze([
  Object.freeze({
    type: "labs",
    headers: Object.freeze(["Result", "Value", "Ref Range"]),
    headerAliases: Object.freeze([
      Object.freeze(["result", "test", "component", "test name", "lab test", "analyte"]),
      Object.freeze(["value", "result value"]),
      Object.freeze(["ref range", "reference range", "range", "units", "reference interval", "ref interval"])
    ]),
    isHeader(tokens) {
      if (tokens.length < 2 || tokens.length > 3) return false;
      return this.headerAliases[0].includes(tokens[0])
        && this.headerAliases[1].includes(tokens[1])
        && (tokens.length === 2 || this.headerAliases[2].includes(tokens[2]));
    }
  }),
  Object.freeze({
    type: "lda",
    headers: Object.freeze(["Name", "Placement date", "Placement time", "Site", "Days"]),
    headerAliases: Object.freeze([
      Object.freeze(["name", "line drain airway", "device"]),
      Object.freeze(["placement date", "date placed", "date"]),
      Object.freeze(["placement time", "time placed", "time"]),
      Object.freeze(["site", "location"]),
      Object.freeze(["days", "dwell days", "days placed"])
    ]),
    isHeader(tokens) {
      if (tokens.length !== 5) return false;
      return tokens.every((token, idx) => this.headerAliases[idx].includes(token));
    }
  }),
  Object.freeze({
    type: "vitals_stats",
    headers: Object.freeze(["Vital Sign", "MIN", "AVG", "MAX"]),
    headerAliases: Object.freeze([
      Object.freeze(["vital sign", "vital", "vitals"]),
      Object.freeze(["min", "minimum"]),
      Object.freeze(["avg", "average", "mean"]),
      Object.freeze(["max", "maximum"])
    ]),
    isHeader(tokens) {
      if (tokens.length !== 4) return false;
      return tokens.every((token, idx) => this.headerAliases[idx].includes(token));
    }
  }),
  Object.freeze({
    type: "facility_meds",
    headers: Object.freeze(["Medication", "Route", "Frequency"]),
    headerAliases: Object.freeze([
      Object.freeze(["medication", "drug", "order"]),
      Object.freeze(["route"]),
      Object.freeze(["frequency", "freq"])
    ]),
    isHeader(tokens) {
      if (tokens.length !== 3) return false;
      return tokens.every((token, idx) => this.headerAliases[idx].includes(token));
    }
  })
]);

const KNOWN_STOP_HEADINGS = Object.freeze([
  "vital signs", "vitals", "encounter vitals stats", "encounter vitals",
  "patient lines drains airways status", "lines drains airways status",
  "active active ldas", "active ldas", "active hospital problems",
  "assessment and plan", "assessment", "plan", "physical exam",
  "medications", "allergies", "labs", "imaging"
]);

function isKnownStopLine(line) {
  const norm = normalizeHeaderToken(line);
  if (!norm) return false;
  return KNOWN_STOP_HEADINGS.some((stop) => norm === stop || norm.startsWith(stop));
}

function isKnownPanelHeader(rawLines, index) {
  const line = compactLine(rawLines[index]);
  if (!line) return false;
  if (/^(?:collection time|collected|timeline|date\/time|specimen)\s*:/i.test(line)) return true;
  let ahead = index + 1;
  while (ahead < rawLines.length && !compactLine(rawLines[ahead])) ahead += 1;
  if (ahead < rawLines.length) {
    const nextText = compactLine(rawLines[ahead]);
    if (/^(?:collection time|collected|timeline|date\/time|specimen)\s*:/i.test(nextText)) {
      return true;
    }
    const nextToken = normalizeHeaderToken(nextText);
    if (["result", "test", "component"].includes(nextToken)) {
      let ahead2 = ahead + 1;
      while (ahead2 < rawLines.length && !compactLine(rawLines[ahead2])) ahead2 += 1;
      if (ahead2 < rawLines.length && ["value", "result value"].includes(normalizeHeaderToken(compactLine(rawLines[ahead2])))) {
        return true;
      }
    }
  }
  return false;
}

function renderMarkdownTable(headers, rows) {
  const headerRow = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const dataRows = rows.map((row) => `| ${headers.map((_, i) => (row[i] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`);
  return [headerRow, separator, ...dataRows].join("\n");
}

export function transformClinicalTablesInText(text) {
  const rawLines = String(text || "").split("\n");
  const outputLines = [];
  const detectedTables = [];
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i];
    const trimmed = compactLine(line);

    if (!trimmed) {
      outputLines.push("");
      i += 1;
      continue;
    }

    let matchedSchema = null;
    let headerLength = 0;

    // Single-line tab or pipe delimited header
    const rawTrimmed = line.trim();
    if (rawTrimmed.includes("\t") || (rawTrimmed.includes("|") && rawTrimmed.startsWith("|"))) {
      const tokens = (rawTrimmed.includes("\t") ? rawTrimmed.split("\t") : rawTrimmed.split("|"))
        .map(normalizeHeaderToken)
        .filter(Boolean);
      matchedSchema = TABLE_SCHEMAS.find((s) => s.isHeader(tokens));
      if (matchedSchema) headerLength = 1;
    }

    // Vertical lines header
    if (!matchedSchema) {
      for (const schema of TABLE_SCHEMAS) {
        const candidateTokens = [];
        let lookahead = 0;
        while (i + lookahead < rawLines.length && candidateTokens.length < schema.headers.length) {
          const aheadTrimmed = compactLine(rawLines[i + lookahead]);
          if (aheadTrimmed) {
            candidateTokens.push(normalizeHeaderToken(aheadTrimmed));
          }
          lookahead += 1;
        }
        if (schema.isHeader(candidateTokens)) {
          matchedSchema = schema;
          headerLength = lookahead;
          break;
        }
      }
    }

    if (!matchedSchema) {
      outputLines.push(line);
      i += 1;
      continue;
    }

    i += headerLength;
    const rows = [];
    const colCount = matchedSchema.headers.length;

    while (i < rawLines.length) {
      while (i < rawLines.length && !compactLine(rawLines[i])) {
        i += 1;
      }
      if (i >= rawLines.length) break;

      const nextLine = compactLine(rawLines[i]);
      if (isKnownStopLine(nextLine) || isKnownPanelHeader(rawLines, i)) {
        break;
      }

      // Tab delimited row
      if (rawLines[i].includes("\t")) {
        const cells = rawLines[i].split("\t").map(compactLine);
        while (cells.length > colCount && !cells[0]) cells.shift();
        while (cells.length < colCount) cells.push("");
        rows.push(cells);
        i += 1;
        continue;
      }

      // Check if another table header is starting
      let nextIsHeader = false;
      for (const schema of TABLE_SCHEMAS) {
        const candidateTokens = [];
        let lookahead = 0;
        while (i + lookahead < rawLines.length && candidateTokens.length < schema.headers.length) {
          const aheadTrimmed = compactLine(rawLines[i + lookahead]);
          if (aheadTrimmed) candidateTokens.push(normalizeHeaderToken(aheadTrimmed));
          lookahead += 1;
        }
        if (schema.isHeader(candidateTokens)) {
          nextIsHeader = true;
          break;
        }
      }
      if (nextIsHeader) break;

      // Vertical row consumption
      const rowCells = [];
      let rowLookahead = 0;

      while (i + rowLookahead < rawLines.length && rowCells.length < colCount) {
        const aheadLine = compactLine(rawLines[i + rowLookahead]);
        if (aheadLine) {
          if (rowCells.length === 0 && (isKnownStopLine(aheadLine) || isKnownPanelHeader(rawLines, i + rowLookahead))) {
            break;
          }
          rowCells.push(aheadLine);
        } else if (rowCells.length >= 2 && matchedSchema.type === "labs") {
          // Check if Ref Range was omitted (e.g. IMG WORKSTATION ID)
          let peek = rowLookahead + 1;
          while (i + peek < rawLines.length && !compactLine(rawLines[i + peek])) peek += 1;
          if (i + peek < rawLines.length && (isKnownStopLine(compactLine(rawLines[i + peek])) || isKnownPanelHeader(rawLines, i + peek))) {
            rowLookahead += 1;
            break;
          }
        }
        rowLookahead += 1;
      }

      if (rowCells.length >= 2) {
        while (rowCells.length < colCount) rowCells.push("");
        rows.push(rowCells);
        i += rowLookahead;
      } else {
        break;
      }
    }

    if (rows.length > 0) {
      detectedTables.push({ type: matchedSchema.type, headers: matchedSchema.headers, rowCount: rows.length });
      outputLines.push(renderMarkdownTable(matchedSchema.headers, rows));
    }
  }

  return { text: outputLines.join("\n"), detectedTables };
}
