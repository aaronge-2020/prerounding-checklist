#!/usr/bin/env python3
"""Convert MedDeID English synthetic benchmark raw data to our benchmark harness format.

Reads:  raw/data/test.jsonl  (300 rows, HF stighellemans/meddeid-english-synthetic-benchmark)
Writes: notes.jsonl  (model-runner input: {id, text, source_text, locale, document_type})
        gold.json    (gold spans in OUR PHI schema: [{id, spans: [{begin,end,text,type,meddeid_label}]}])

Mapping: MedDeID label -> our canonical entity types (see LABEL_MAPPING.md).
Ambiguous MedDeID labels are split deterministically on source_slot:
  Age_Birthdate  -> DOB (patient.birth_date) | AGE (patient.age_*)
  Contactdetails -> EMAIL (patient.email) | PHONE (patient.phone)
  ID:Patient     -> MRN (patient.mrn) | ID (report_id / national_id)
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw" / "data" / "test.jsonl"


def map_type(label: str, source_slot: str) -> str:
    if label == "Age_Birthdate":
        return "DOB" if source_slot == "patient.birth_date" else "AGE"
    if label == "Contactdetails":
        return "EMAIL" if source_slot == "patient.email" else "PHONE"
    if label == "ID:Patient":
        return "MRN" if source_slot == "patient.mrn" else "ID"
    return {
        "Address_Location:Caregiver": "LOCATION",
        "Address_Location:Other": "LOCATION",
        "Address_Location:Patient": "ADDRESS",
        "Date": "DATE",
        "ID:Caregiver": "ID",
        "Name:Caregiver": "PROVIDER NAME",
        "Name:Other": "NAME",
        "Name:Patient": "PATIENT NAME",
        "Organization:Healthcare": "FACILITY",
        "Organization:Other": "ORGANIZATION",
        "Profession": "OCCUPATION",
    }[label]


def main() -> None:
    rows = [json.loads(line) for line in RAW.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(rows) == 300, f"expected 300 rows, got {len(rows)}"

    notes, gold = [], []
    n_spans = 0
    for r in rows:
        doc_id = r["document_id"]
        text = r["text"]
        meta = json.loads(r["metadata_json"])
        notes.append({
            "id": doc_id,
            "text": text,
            "source_text": text,  # alias: existing Playwright drivers read .source_text
            "locale": meta.get("lang"),
            "document_type": meta.get("document_type"),
        })
        spans = []
        for s in r["spans"]:
            # hard integrity check: offsets must slice exactly to the span text
            assert text[s["begin"]:s["end"]] == s["text"], (
                f"offset mismatch in {doc_id}: {s['span_id']}")
            spans.append({
                "begin": s["begin"],
                "end": s["end"],
                "text": s["text"],
                "type": map_type(s["label"], s["source_slot"]),
                "meddeid_label": s["label"],
            })
        spans.sort(key=lambda x: (x["begin"], x["end"]))
        gold.append({"id": doc_id, "spans": spans})
        n_spans += len(spans)

    assert n_spans == 1717, f"expected 1717 gold spans, got {n_spans}"
    assert len({n["id"] for n in notes}) == 300, "duplicate document ids"

    (HERE / "notes.jsonl").write_text(
        "".join(json.dumps(n, ensure_ascii=False) + "\n" for n in notes), encoding="utf-8")
    (HERE / "gold.json").write_text(
        json.dumps(gold, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote notes.jsonl ({len(notes)} notes) and gold.json ({n_spans} spans)")


if __name__ == "__main__":
    main()
