"""
Hospital clinical text de-identification pipeline.
Hybrid approach combining Microsoft Presidio (regex + spaCy + transformer)
with clinical-domain post-processing guards.

Usage:
    python deid_pipeline.py < input.txt > output.json
    python deid_pipeline.py --text "Patient John Doe..." --json
    python deid_pipeline.py --file note.txt --output redacted.txt
"""

import argparse
import json
import re
import sys
from typing import Optional

# ---------------------------------------------------------------------------
# Clinical guard lists — terms that should NEVER be redacted
# These prevent the NER model from flagging medical terminology as PHI.
# ---------------------------------------------------------------------------

CLINICAL_GUARD_PHRASES = {
    "diabetic ketoacidosis", "autoimmune hypothyroidism", "autoimmune thyroiditis",
    "diabetes mellitus", "type 1 diabetes mellitus", "type 2 diabetes mellitus",
    "diabetes insipidus", "gestational diabetes", "acute kidney injury",
    "chronic kidney disease", "congestive heart failure", "atrial fibrillation",
    "coronary artery disease", "myocardial infarction", "deep vein thrombosis",
    "pulmonary embolism", "hypertension", "hyperlipidemia", "hypothyroidism",
    "hyperthyroidism", "graves disease", "hashimoto thyroiditis",
    "diabetic neuropathy", "diabetic retinopathy", "diabetic nephropathy",
    "chest pain", "shortness of breath", "abdominal pain", "lower extremity edema",
    "history of present illness", "past medical history", "surgical history",
    "family history", "social history", "review of systems", "physical exam",
    "assessment and plan", "hospital course", "interval history",
    "discharge summary", "admission note", "progress note", "consult note",
    "endocrinology consult", "cardiology consult", "neurology consult",
    "nephrology consult", "pulmonology consult", "gastroenterology consult",
    "infectious disease consult", "infectious disease",
    "lab results", "laboratory results", "vital signs", "vital sign",
    "results review", "medication administration record",
    "code status", "full code", "dnr", "dni",
    "clear liquid diet", "sick-day education", "sick day management",
    "poor sick-day management", "discharge planning", "sick-day protocols",
    "anion gap", "beta-hydroxybutyrate", "beta hydroxybutyrate",
    "free t4", "blood pressure", "heart rate", "respiratory rate",
    "oxygen saturation", "temperature", "blood glucose",
    "basic metabolic panel", "complete blood count",
    "campus health pharmacy", "health pharmacy",
}

CLINICAL_GUARD_WORDS = {
    "abdomen", "abdominal", "absolute", "acetaminophen", "acute", "admission",
    "albumin", "alkaline", "allergies", "anion", "antibiotic", "anticoagulation",
    "arterial", "assessment", "autoimmune", "basophils", "beta", "bicarbonate",
    "bilirubin", "blood", "bowel", "bun", "calcium", "cardiac", "cardiology",
    "cardiovascular", "chest", "chloride", "chronic", "clinical", "consult",
    "creatinine", "culture", "daily", "deficiency", "diabetes", "diabetic",
    "diagnosis", "diet", "discharge", "disease", "disorder", "edema", "education",
    "emergency", "endocrine", "endocrinology", "eosinophils", "exam",
    "examination", "failure", "glucose", "heart", "hematocrit", "hemoglobin",
    "hepatic", "history", "hospital", "hospitalist", "hydroxybutyrate",
    "hypertension", "hyperthyroidism", "hypothyroidism", "illness", "imaging",
    "infection", "infusion", "injury", "inpatient", "insulin", "intake",
    "ketoacidosis", "ketones", "kidney", "lab", "laboratory", "labs",
    "levothyroxine", "lispro", "liver", "lymphocytes", "magnesium",
    "management", "medical", "medication", "medications", "medicine", "mellitus",
    "metabolic", "microbiology", "monitor", "monocytes", "morphology",
    "murmur", "nausea", "nephrology", "neurological", "neurology",
    "neutrophils", "note", "ondansetron", "output", "oxygen", "pain",
    "pathology", "patient", "pharmacy", "phosphatase", "phosphate",
    "phosphorus", "physical", "physician", "plan", "platelet", "platelets",
    "potassium", "present", "procedure", "progress", "protocol", "pulmonary",
    "pulmonology", "radiology", "rate", "renal", "report", "respiratory",
    "results", "review", "rhythm", "room", "saturation", "sodium",
    "subcutaneous", "surgery", "surgical", "symptoms", "syndrome",
    "tachycardia", "temperature", "therapy", "thyroid", "thyroiditis",
    "tissue", "total", "treatment", "troponin", "tsh", "type",
    "urinary", "urine", "urology", "vascular", "ventricular", "vital",
    "vitals", "warfarin", "wbc",
    # Common clinical abbreviations that get mistaken for locations/names
    "sc", "iv", "po", "prn", "qhs", "tid", "bid", "qid", "qam", "qpm",
    "ac", "pc", "hs", "im", "sq", "sl", "npo", "pr", "ng", "neb",
    "subq", "ivpb", "ivf",
}

MEDICATION_NAMES = {
    "acetaminophen", "amlodipine", "aspirin", "atorvastatin", "azithromycin",
    "cefazolin", "cefepime", "ceftriaxone", "duloxetine", "enoxaparin",
    "escitalopram", "furosemide", "gabapentin", "glargine", "heparin",
    "hydromorphone", "insulin", "insulin glargine", "insulin lispro",
    "insulin regular", "levothyroxine", "lisinopril", "losartan",
    "metformin", "metoprolol", "ondansetron", "oxycodone", "pantoprazole",
    "pregabalin", "senna", "tamsulosin", "tramadol", "trazodone",
    "vancomycin", "warfarin",
}

MEDICATION_SALTS = {
    "acetate", "bromide", "calcium", "chloride", "citrate", "extended",
    "fumarate", "hcl", "hydrochloride", "injection", "lactate", "magnesium",
    "oral", "potassium", "sodium", "succinate", "sulfate", "tartrate",
    "tablet", "topical",
}

MEDICATION_CLASS_PATTERN = re.compile(
    r'(?:^cef|cillin$|cycline$|floxacin$|mycin$|azole$|avir$|pril$|'
    r'sartan$|olol$|dipine$|statin$|parin$|prazole$|tidine$|zepam$|'
    r'zolam$|azepam$|azide$|semide$|thiazide$|gliflozin$|gliptin$|'
    r'tide$|caine$|sone$|mab$|nib$)',
    re.IGNORECASE,
)


def is_medication_word(word: str) -> bool:
    """Check if a word is a medication name or belongs to a medication class."""
    return (word.lower() in MEDICATION_NAMES or
            bool(MEDICATION_CLASS_PATTERN.search(word)))


def is_clinical_phrase(text: str) -> bool:
    """Check if text is a known clinical term that should not be redacted."""
    normalized = text.strip().lower()
    if normalized in CLINICAL_GUARD_PHRASES:
        return True
    words = normalized.split()
    if len(words) <= 1:
        word = normalized.rstrip(".,;:")
        return word in CLINICAL_GUARD_WORDS
    # Multi-word: check if all words are clinical and at least one is medical
    all_clinical = all(
        w.rstrip(".,;:") in CLINICAL_GUARD_WORDS
        for w in words
    )
    if all_clinical:
        return True
    # Check if it looks like a medication phrase
    if 2 <= len(words) <= 4:
        med_words = [w for w in words if is_medication_word(
            w.rstrip(".,;:"))]
        if med_words:
            return all(
                is_medication_word(w.rstrip(".,;:")) or
                w.rstrip(".,;:") in MEDICATION_SALTS or
                w.rstrip(".,;:") in CLINICAL_GUARD_WORDS
                for w in words
            )
    return False


NAME_ENTITY_TYPES = {"PERSON", "PATIENT", "DOCTOR", "HCW", "PROVIDER"}

# ---------------------------------------------------------------------------
# Custom Presidio recognizers for hospital-specific PHI
# ---------------------------------------------------------------------------

from presidio_analyzer import Pattern, PatternRecognizer

# MRN patterns
MRN_PATTERNS = [
    Pattern("MRN labeled", r"(?i)(?:MRN|Medical\s+Record)\s*[:#]?\s*((?=[A-Z0-9./_-]*\d)[A-Z0-9][A-Z0-9./_-]{2,})", 0.95),
]

# CSN / Encounter ID patterns
CSN_PATTERNS = [
    Pattern("CSN labeled", r"(?i)(?:CSN|FIN|HAR|Encounter)\s*[:#]?\s*((?=[A-Z0-9./_-]*\d)[A-Z0-9][A-Z0-9./_-]{2,})", 0.95),
]

# Phone number patterns
PHONE_PATTERNS = [
    Pattern("Phone parens", r'(?:Phone|Fax|Tel|Mobile)\s*[:#]\s*((?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})', 0.95),
    Pattern("Bare phone", r'(?:(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})(?![-\d])', 0.6),
]

# Room/Bed/Unit patterns
ROOM_PATTERNS = [
    Pattern("Room labeled", r"(?i)(?:Room|Rm|Bed|Unit)\s*[:#]\s*([A-Z0-9][A-Z0-9 \t-]{0,20}?)(?=\s+(?:Unit|Phone|Email|Address|Primary|Preferred)\s*[:#]|[.,;\n]|$)", 0.9),
]

# DOB patterns
DOB_PATTERNS = [
    Pattern("DOB labeled", r"(?i)(?:DOB|D\.O\.B\.|Date\s+of\s+birth|Birth\s+date)\s*[:#]\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})", 0.95),
]

# Patient name header pattern
PATIENT_NAME_PATTERNS = [
    Pattern("Patient name header", r"(?im)^\s*(?:Patient(?:\s+Name)?|Pt(?:\s+Name)?|Name)\s*[:#]\s*([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3})\s*$", 0.95),
]

# Provider name patterns (Dr. ...)
PROVIDER_PATTERNS = [
    Pattern("Provider labeled", r"(?i)(?:Attending|Referring|Provider|Doctor|Physician|Consultant|PCP|Fellow|Resident)\s*[:#]\s*((?:Dr[.\s])?\s*[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2})", 0.95),
    Pattern("Bare Dr name", r"\b(?:Dr|Doctor)\.?\s+[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2}\b", 0.85),
]

# Contact/emergency contact patterns
CONTACT_PATTERNS = [
    Pattern("Contact labeled", r"(?i)(?:Emergency\s+contact|Mother|Father|Spouse|Daughter|Son|Guardian|Caregiver)\s*[:#]\s*([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3})", 0.95),
]

# Date patterns
DATE_PATTERNS = [
    Pattern("ISO date", r'\b\d{4}-\d{1,2}-\d{1,2}\b', 0.9),
    Pattern("Slash date", r'\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])(?:[/-](?:\d{2}|\d{4}))?\b', 0.85),
    Pattern("Named month date", r'\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:,?\s+\d{4})?\b', 0.85),
]

# Address patterns
ADDRESS_PATTERNS = [
    Pattern("Street address", r'\b\d{1,6}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4}\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl)\b', 0.85),
]

# Facility patterns - stop at newline, comma, or Unit/Room/Phone boundary
FACILITY_PATTERNS = [
    Pattern("Facility labeled", r"(?i)(?:Facility|Campus|Hospital|Clinic|Site)\s*[:#]\s*([^\n\r,]{2,80}?)(?=\s+(?:Unit|Floor|Ward|Pod|Bay|Room|Rm|Bed|Phone|Email|Address|Primary|Preferred)\s*[:#]|[,\n\r]|$)", 0.85),
    Pattern("Clinic pharmacy", r"(?i)([A-Z][A-Za-z&.'-]+(?:\s+[A-Z][A-Za-z&.'-]+){0,5}\s+(?:Hospital|Clinic|Pharmacy|Medical Center|Health System|Healthcare|Medical Group))", 0.75),
]

# Email patterns
EMAIL_PATTERNS = [
    Pattern("Email", r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b', 0.95),
]


def create_custom_recognizers():
    """Create all custom Presidio recognizers for clinical PHI."""
    return [
        PatternRecognizer(
            supported_entity="PATIENT",
            patterns=PATIENT_NAME_PATTERNS,
            context=["Patient", "Name", "Pt"],
        ),
        PatternRecognizer(
            supported_entity="MRN",
            patterns=MRN_PATTERNS,
            context=["MRN", "Medical Record", "record number"],
        ),
        PatternRecognizer(
            supported_entity="CSN",
            patterns=CSN_PATTERNS,
            context=["CSN", "Encounter", "FIN", "HAR"],
        ),
        PatternRecognizer(
            supported_entity="PHONE",
            patterns=PHONE_PATTERNS,
            context=["Phone", "Fax", "Tel", "Mobile", "Call"],
        ),
        PatternRecognizer(
            supported_entity="ROOM",
            patterns=ROOM_PATTERNS,
            context=["Room", "Bed", "Unit", "Ward", "Location"],
        ),
        PatternRecognizer(
            supported_entity="DOB",
            patterns=DOB_PATTERNS,
            context=["DOB", "Date of Birth", "Birth"],
        ),
        PatternRecognizer(
            supported_entity="PROVIDER",
            patterns=PROVIDER_PATTERNS,
            context=["Attending", "Referring", "Provider", "Doctor"],
        ),
        PatternRecognizer(
            supported_entity="CONTACT",
            patterns=CONTACT_PATTERNS,
            context=["Emergency contact", "Mother", "Father", "Daughter",
                     "Son", "Guardian"],
        ),
        PatternRecognizer(
            supported_entity="EMAIL",
            patterns=EMAIL_PATTERNS,
            context=["Email", "E-mail"],
        ),
        PatternRecognizer(
            supported_entity="ADDRESS",
            patterns=ADDRESS_PATTERNS,
            context=["Address", "Location"],
        ),
        PatternRecognizer(
            supported_entity="FACILITY",
            patterns=FACILITY_PATTERNS,
            context=["Facility", "Campus", "Hospital", "Clinic"],
        ),
    ]


# ---------------------------------------------------------------------------
# Post-processing: remove false positives (clinical terms flagged as names)
# ---------------------------------------------------------------------------

def _is_date_like_false_positive(span: str, line: str,
                                 text: str, start: int) -> bool:
    """Check if a detected entity is likely a lab result, not a date."""
    span_lower = span.strip().lower()
    # Age expressions
    if re.search(r'(?:year|years?\s*old|y\.?o\.?)\s*$', span, re.IGNORECASE):
        return True
    if re.match(r'^\d{1,3}[- ]year[- ]old$', span_lower):
        return True
    # Time durations like "2 days", "3 weeks", "4 months"
    if re.match(r'^\d{1,3}\s*(?:day|week|month|year)s?\s*$', span_lower):
        return True
    # Medication schedule words like "nightly", "daily", "weekly"
    if span_lower in {"nightly", "daily", "weekly", "monthly", "hourly"}:
        return True
    # Lab values that look like dates
    if re.match(r'^\d{1,2}/\d{1,2}$', span):
        line_lower = line.lower()
        if any(kw in line_lower for kw in [
            "creatinine", "glucose", "sodium", "potassium", "xr", "x-ray",
            "views", "strength", "motor", "reflex", "pain", "score",
            "grade", "views right", "views left",
        ]):
            return True
    # Standalone years in clinical context
    if re.match(r'^\d{4}$', span):
        return True
    return False


def filter_clinical_false_positives(
    text: str,
    entities: list,
) -> list:
    """Remove entities that are clinical terms misclassified as PHI."""
    filtered = []
    for entity in entities:
        start = entity.get("start", 0)
        end = entity.get("end", 0)
        entity_type = entity.get("entity_type", "")
        span = text[start:end].strip()
        line = _get_line_at(text, start)

        # Check clinical guard phrase
        if is_clinical_phrase(span):
            continue

        # DATE entity checks
        if entity_type == "DATE_TIME":
            if _is_date_like_false_positive(span, line, text, start):
                continue

        # Check if it's just a single clinical word
        if entity_type in NAME_ENTITY_TYPES:
            if _is_single_clinical_word(span, line):
                continue

        # Check if context clearly indicates clinical label row
        if entity_type in NAME_ENTITY_TYPES:
            if _is_clinical_result_row(line, span, start, text):
                continue

        filtered.append(entity)
    return filtered


def _is_single_clinical_word(span: str, line: str) -> bool:
    """Check if a detected name is actually a standalone clinical word."""
    word = span.strip().lower()
    if word in {"insulin", "glargine", "lispro", "levothyroxine",
                "acetaminophen", "ondansetron", "warfarin",
                "metformin", "heparin", "vancomycin"}:
        return True
    if MEDICATION_CLASS_PATTERN.search(word):
        return True
    return False


def _is_clinical_result_row(line: str, span: str,
                            start: int, text: str) -> bool:
    """Check if the span is part of a clinical result/lab label row."""
    line_lower = line.lower()
    span_lower = span.lower()

    # In a lab result line like "TSH: 2.4  ref 0.4-4.5"
    if re.match(r'^[A-Z][A-Za-z\s/-]+:\s', line) and not re.match(
        r'(?i)(?:patient|name|provider|attending|referring|doctor|'
        r'emergency contact|room|phone|email|address|mrn|csn|dob|'
        r'facility|unit|bed)\s*[:#]',
        line,
    ):
        return True

    # Assessment/Plan numbered items
    if re.match(r'^\d+\.\s', line.strip()) and span_lower in {
        "diabetic ketoacidosis", "autoimmune hypothyroidism",
        "acute kidney injury", "type 1 diabetes mellitus",
        "type 2 diabetes mellitus",
    }:
        return True

    # Check if the line is a clinical label:value pair
    label_match = re.match(
        r'^([A-Z][A-Za-z\s/-]+(?:\([^)]*\))?)\s*:\s*(.{1,80})$',
        line,
    )
    if label_match:
        label = label_match.group(1).strip().lower()
        # Skip if label is a known PHI header
        if label in {"patient", "patient name", "name", "dob",
                     "date of birth", "mrn", "medical record",
                     "phone", "email", "address", "provider",
                     "attending", "referring", "emergency contact"}:
            return False
        return True

    return False


def _get_line_at(text: str, pos: int) -> str:
    """Get the full line containing the given position."""
    line_start = text.rfind("\n", 0, max(0, pos)) + 1
    line_end = text.find("\n", pos)
    if line_end == -1:
        line_end = len(text)
    return text[line_start:line_end]


# ---------------------------------------------------------------------------
# Anonymizer configuration: consistent placeholders
# ---------------------------------------------------------------------------

def _placeholder_for(entity_type: str) -> str:
    """Map Presidio entity types to HIPAA-style PHI bracket labels."""
    mapping = {
        "PERSON": "NAME",
        "PATIENT": "PATIENT NAME",
        "PROVIDER": "PROVIDER NAME",
        "DOCTOR": "PROVIDER NAME",
        "HCW": "PROVIDER NAME",
        "CONTACT": "CONTACT NAME",
        "PHONE_NUMBER": "PHONE",
        "PHONE": "PHONE",
        "EMAIL_ADDRESS": "EMAIL",
        "EMAIL": "EMAIL",
        "DATE_TIME": "DATE",
        "DATE": "DATE",
        "DOB": "DOB",
        "MRN": "MRN",
        "CSN": "ENCOUNTER ID",
        "MEDICAL_RECORD_NUMBER": "MRN",
        "ROOM": "ROOM",
        "GPE": "LOCATION",
        "LOCATION": "LOCATION",
        "STREET_ADDRESS": "ADDRESS",
        "ADDRESS": "ADDRESS",
        "ORG": "ORGANIZATION",
        "FACILITY": "FACILITY",
        "ORGANIZATION": "ORGANIZATION",
        "HOSPITAL": "FACILITY",
        "URL": "URL",
        "IP_ADDRESS": "IP",
        "SSN": "ID",
        "US_SSN": "ID",
        "CREDIT_CARD": "ID",
        "AGE": "AGE",
    }
    return mapping.get(entity_type, entity_type.replace("_", " "))


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def deidentify(
    text: str,
    use_transformer: bool = True,
    transformer_model: str = "StanfordAIMI/stanford-deidentifier-base",
) -> dict:
    """
    De-identify clinical text using Presidio + custom recognizers.

    Returns dict with keys:
        text: de-identified text
        entities: list of detected PHI entities
        summary: count of each entity type found
    """
    from presidio_analyzer import AnalyzerEngine, RecognizerRegistry

    # --- Build analyzer ---
    registry = RecognizerRegistry()

    # Add built-in recognizers (phone, email, SSN, credit card, etc.)
    from presidio_analyzer.predefined_recognizers import (
        PhoneRecognizer, EmailRecognizer, UsSsnRecognizer,
        CreditCardRecognizer, UrlRecognizer, IpRecognizer,
        MedicalLicenseRecognizer,
    )
    for rec in [
        PhoneRecognizer(), EmailRecognizer(), UsSsnRecognizer(),
        CreditCardRecognizer(), UrlRecognizer(), IpRecognizer(),
    ]:
        registry.add_recognizer(rec)

    # Add custom clinical recognizers
    for rec in create_custom_recognizers():
        registry.add_recognizer(rec)

    # Add spaCy NER for PERSON, DATE, ORG, GPE detection in narrative text
    try:
        import spacy
        nlp = spacy.load("en_core_web_lg")
        from presidio_analyzer.predefined_recognizers import SpacyRecognizer
        registry.add_recognizer(
            SpacyRecognizer(
                supported_entities=["PERSON", "DATE_TIME", "GPE", "ORG", "FACILITY", "LOCATION"],
            ),
        )
    except Exception as e:
        print(f"spaCy NER not available: {e}", file=sys.stderr)

    analyzer = AnalyzerEngine(registry=registry)

    # --- Analyze ---
    results = analyzer.analyze(text=text, language="en")

    # Convert to simplified entity format
    entities = []
    for res in results:
        entities.append({
            "start": res.start,
            "end": res.end,
            "entity_type": res.entity_type,
            "score": res.score,
            "text": text[res.start:res.end],
        })

    # --- Post-process: filter clinical false positives ---
    entities = filter_clinical_false_positives(text, entities)

    # --- Sort and merge overlapping entities ---
    entities.sort(key=lambda e: (e["start"], -e["end"]))
    merged = []
    for entity in entities:
        if merged and entity["start"] < merged[-1]["end"]:
            # Keep the one with higher score
            if entity["score"] > merged[-1]["score"]:
                merged[-1] = entity
        else:
            merged.append(entity)
    entities = merged

    # --- Anonymize ---
    output = []
    cursor = 0
    for entity in entities:
        output.append(text[cursor:entity["start"]])
        placeholder = _placeholder_for(entity["entity_type"])
        output.append(f"[{placeholder}]")
        cursor = entity["end"]
    output.append(text[cursor:])

    redacted_text = "".join(output)

    # --- Summary ---
    summary = {}
    for entity in entities:
        etype = _placeholder_for(entity["entity_type"])
        summary[etype] = summary.get(etype, 0) + 1

    return {
        "text": redacted_text,
        "entities": [
            {
                "start": e["start"],
                "end": e["end"],
                "type": _placeholder_for(e["entity_type"]),
                "text": e["text"],
                "score": e["score"],
            }
            for e in entities
        ],
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="De-identify clinical text using Presidio + Stanford deidentifier",
    )
    parser.add_argument(
        "--text", "-t", type=str, default=None,
        help="Text to de-identify (otherwise reads from stdin or --file)",
    )
    parser.add_argument(
        "--file", "-f", type=str, default=None,
        help="Input file path",
    )
    parser.add_argument(
        "--output", "-o", type=str, default=None,
        help="Output file path (defaults to stdout for text, or prints JSON)",
    )
    parser.add_argument(
        "--json", "-j", action="store_true",
        help="Output full JSON with entities and summary",
    )
    parser.add_argument(
        "--text-only", action="store_true",
        help="Output only the de-identified text",
    )
    parser.add_argument(
        "--no-transformer", action="store_true",
        help="Disable transformer model (use spaCy only)",
    )
    parser.add_argument(
        "--model", type=str,
        default="StanfordAIMI/stanford-deidentifier-base",
        help="Transformer model ID on HuggingFace",
    )

    args = parser.parse_args()

    # Read input
    if args.text:
        text = args.text
    elif args.file:
        with open(args.file, "r", encoding="utf-8") as f:
            text = f.read()
    else:
        text = sys.stdin.read()

    if not text.strip():
        print("Error: No input text provided.", file=sys.stderr)
        sys.exit(1)

    # De-identify
    result = deidentify(
        text,
        use_transformer=not args.no_transformer,
        transformer_model=args.model,
    )

    # Output
    if args.text_only:
        output = result["text"]
    elif args.json:
        output = json.dumps(result, indent=2, ensure_ascii=False)
    else:
        output = result["text"]

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output + "\n")
        print(f"Written to {args.output}")
    else:
        print(output)


if __name__ == "__main__":
    main()
