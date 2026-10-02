#!/usr/bin/env python3
"""Stream 2 (2026-09-30/10-01): explicit schema remap of our predictions into
the Technetium-I sample gold schema.

Gold schema as realized in tc_sample_gold.json (8 types; the sampler splits
DATE -> DOB/DATE in birth-date context, see sample_technetium.py):
    NAME, ID, DATE, DOB, AGE, PHONE, EMAIL, LOCATION

Our pipeline's 15 PHI types (11 observed in this 1,500-note sample):
    PATIENT NAME, PROVIDER NAME, NAME, FACILITY, ORGANIZATION, DOB, MRN,
    ADDRESS, LOCATION, DATE, ID, PHONE, EMAIL, AGE, OCCUPATION

Mapping: predictions -> gold schema (standard direction; gold is the external
reference and is not touched). One-line justifications in TYPE_MAP comments.
Unobserved-in-sample types are still mapped explicitly for completeness.
Writes out/tc_stanford_remapped.json (same {id, entities} JSON as out/tc_stanford.json).
Seed N/A (deterministic remap). Date: 2026-10-01.
"""
import json
from pathlib import Path

ROOT = Path("/home/hatch/workspace/deid-benchmark/technetium-asq")

# our type -> gold type, with justification
TYPE_MAP = {
    # person names: Technetium collapses patient/provider/other names into NAME
    "PATIENT NAME": "NAME",
    "PROVIDER NAME": "NAME",
    "NAME": "NAME",                       # identity; not observed in sample
    # places: Technetium's only place bucket is LOCATION
    "FACILITY": "LOCATION",               # hospital/clinic is a place (not observed)
    "ADDRESS": "LOCATION",                # coarse address -> LOCATION bucket
    "LOCATION": "LOCATION",               # identity (not observed)
    # ORGANIZATION: no faithful Technetium target. Least-bad choice is LOCATION
    # (same rationale as the ASQ-PHI groups, where FACILITY/ORGANIZATION map to
    # GEOGRAPHIC_LOCATION): org names are proper-noun named entities; mapping to
    # NAME would corrupt person-name precision. Only 1 ORGANIZATION prediction
    # exists in the whole sample (a "DETAILS" FP on a template placeholder), so
    # the choice is numerically immaterial but is made explicit here.
    "ORGANIZATION": "LOCATION",
    # identifiers: Technetium collapses all IDs into ID
    "MRN": "ID",
    "ID": "ID",
    # dates: gold keeps DOB separate (sampler-derived). Identity preserves the
    # existing exact matches. NOT DOB->DATE: that would manufacture 1,500
    # misses for no reason and contradict the sampler's documented design.
    "DOB": "DOB",
    "DATE": "DATE",
    # direct identities
    "PHONE": "PHONE",
    "EMAIL": "EMAIL",
    "AGE": "AGE",
    # OCCUPATION: no faithful Technetium target ("teacher" is neither a NAME nor
    # a LOCATION; Technetium's advertised PROFESSION type is absent from the
    # test split). Explicitly DROPPED from exact-span scoring here. Count in
    # this sample: 0, so the drop affects nothing; label-agnostic char recall
    # still covers any such span for the privacy-oriented metric.
    "OCCUPATION": None,
}

DROPPED = []
out = []
for line in open(ROOT / "checkpoints" / "tc_stanford.jsonl"):
    r = json.loads(line)
    ents = []
    for e in r["entities"]:
        t = e["type"]
        assert t in TYPE_MAP, f"unmapped pipeline type: {t!r}"
        nt = TYPE_MAP[t]
        if nt is None:
            DROPPED.append((r["id"], e["begin"], e["end"], t))
            continue
        ents.append({"begin": e["begin"], "end": e["end"],
                     "text": e["text"], "type": nt})
    out.append({"id": r["id"], "entities": ents})

json.dump(out, open(ROOT / "out" / "tc_stanford_remapped.json", "w"))
print(f"wrote out/tc_stanford_remapped.json: {len(out)} notes")
print(f"dropped (OCCUPATION->None): {len(DROPPED)}")
unused = [k for k in TYPE_MAP if k not in
          {e['type'] for r in (json.loads(l) for l in open(ROOT/'checkpoints'/'tc_stanford.jsonl')) for e in r['entities']}]
print("map entries with no predictions in sample:", unused)
