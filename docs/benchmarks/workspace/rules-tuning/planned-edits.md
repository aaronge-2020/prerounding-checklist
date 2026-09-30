# Planned edits (apply one at a time, after the previous run scores)

## P2 — "00"-prefixed international dialing (insert after the P1 intl rule)

```js
    // "00"-prefixed international dialing ("0091 44 034 6283",
    // "0031-01-494 3486") - the ITU international call prefix, as general
    // as the "+" form above. The lookbehind keeps this from matching the
    // tail of a longer digit run such as a year ("2009").
    { label: "PHONE", regex: /(?<![\d])00\d(?:[-.\s]?\d){5,13}(?![\d])/g, skip: isValidInternationalPhone },
```

## P3 — trunk-"0" national numbers (insert after P2)

Helper (add near isValidInternationalPhone):

```js
// A leading-zero national number is only plausible as a phone number with
// telephone-length digit counts (7-15). Date-shaped digit runs ("01/02/03")
// are excluded: they share the leading zero but not the length.
function isTrunkPhoneFalsePositive(rawText, start, end) {
  const span = rawText.slice(start, end);
  const digits = span.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return true;
  return /^0?\d(?:[/-]\d{1,2}){2}$/.test(span) && digits.length <= 8;
}
```

Pattern:

```js
    // Trunk-prefixed national numbers ("0134 599 154.0432", "08.59.79-66 48",
    // "03-0460-0180") - a leading 0 plus 2-4 separated digit groups is the
    // general non-NANP national shape. Date-shaped runs are excluded by the
    // guard above.
    { label: "PHONE", regex: /(?<![\d])0\d(?:[-.\s]?\d{1,6}){2,4}(?![\d])/g, skip: isTrunkPhoneFalsePositive },
```

## P4 — identifier-markup disqualification (edit the US 10-digit rule)

Old:
```js
    { label: "PHONE", regex: /(?:\+?1[-.\s]?)?\(?\b\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
```
New: add `skip: isPhoneDisqualifiedByIdentifierMarkup`.

Helper:

```js
// A digit string explicitly marked as a non-phone identifier is not a phone
// number, even when its grouping is phone-shaped: the markup or label says
// what the number is ("<socialnumber>738 958 6793</socialnumber>",
// 'Social Security Number: "435 124 5380"'). Only identifier markup
// disqualifies - a <tel>/<phone> element or no markup at all leaves the
// match alone.
function isPhoneDisqualifiedByIdentifierMarkup(rawText, start, end) {
  const before = rawText.slice(Math.max(0, start - 48), start);
  const after = rawText.slice(end, Math.min(rawText.length, end + 16));
  const openTag = before.match(/<([A-Za-z][\w-]*)[^>]*>\s*["']?$/);
  if (openTag) {
    const tagName = openTag[1];
    if (!/^(?:tel|phone|fax|mobile|cell|telephone)$/i.test(tagName) &&
        new RegExp(`^["']?\\s*</${tagName}\\s*>`, "i").test(after)) {
      return true;
    }
    return false;
  }
  return /(?:social[\s_-]*security|ssn|id[\s_-]*card|passport|driver'?s?[\s_-]*licen[cs]e|national[\s_-]*id|tax[\s_-]*id)\s*(?:number|no|num|#)?\s*[:#]?\s*["']?$/i.test(before);
}
```

## D1 — ISO-8601 without timezone + month/year dates

Old ISO-T pattern:
```js
    { label: "DATE", regex: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})\b/g },
```
New: make the offset optional:
```js
    // ISO-8601 timestamps without an explicit offset ("2020-06-04T00:00:00"):
    // the offset is optional in ISO 8601. This runs before the free-text
    // TIME patterns so a timestamp keeps its DATE label instead of
    // contributing a clock-time sub-span.
    { label: "DATE", regex: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?\b/g },
```

Month/year (add near the DATE patterns):
```js
    // Month/year dates ("June/62", "September/64") - month name with a 2- or
    // 4-digit year, slash-separated (card-expiry style).
    { label: "DATE", regex: /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\/\d{2,4}\b/gi },
```

## B1 — tolerant DOB labels + extended dateValue

Extend the shared `dateValue` (line ~1293):
- prepend ISO-T alternative: `\d{4}-\d{1,2}-\d{1,2}T\d{1,2}:\d{2}(?::\d{2})?|`
- add ordinal suffix: `\d{1,2}(?:st|nd|rd|th)?` in the month-name branch.

New tolerant pattern (after the existing inline DOB pattern):
```js
    // DOB with separators/quotes/HTML in the label ("date_of_birth":
    // "June 13th, 1956", "<strong>Date of Birth:</strong>
    // 1954-07-02T00:00:00") - same meaning as "DOB: <date>", only the
    // punctuation differs.
    { label: "DOB", regex: new RegExp(String.raw`\b(?:DOB|D\.O\.B\.|Date[_\s]+of[_\s]+birth|Birth[_\s]+date)(?:\s*<[^>]*>)?\s*["']?\s*[:=]\s*(?:<[^>]*>)?\s*["']?(${dateValue})`, "gi") },
```

## A1 — secondary address units

```js
    // Secondary address units ("Suite 800", "Apt 4B", "Lodge 313",
    // "Villa 303") - a dwelling/unit designator plus number. Title-case
    // anchored so lowercase prose cannot trigger it.
    { label: "ADDRESS", regex: /\b(?:Suite|Ste|Apt|Apartment|Unit|Floor|Fl|Lodge|Villa|Duplex|Ranch|Bungalow|Basement|Office|Chalet|Pod|PB|RV)\.?\s+\d+[A-Z]?\b/g },
```
