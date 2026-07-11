# Workup system contract

`prerounding_workup_v1` keeps the field name `system`, but its value is a stable **system ID**, never a display label or free-text category. This is the single source of truth for individual workups, portable libraries, the manual editor, and AI formatting.

## Allowed IDs

| ID | Display label |
| --- | --- |
| `general` | General |
| `constitutional` | Constitutional |
| `eyes` | Eyes |
| `ent` | Ears, nose, mouth, and throat |
| `cardiovascular` | Cardiovascular |
| `respiratory` | Respiratory |
| `gastrointestinal` | Gastrointestinal |
| `genitourinary` | Genitourinary |
| `musculoskeletal` | Musculoskeletal |
| `skin` | Skin and soft tissue |
| `neurologic` | Neurologic |
| `psychiatric` | Psychiatric |
| `endocrine` | Endocrine and metabolic |
| `hematologic` | Hematologic / lymphatic / immunologic |
| `infectious` | Infectious disease and exposures |
| `medication` | Medication and substance use |
| `functional` | Functional and social |
| `reproductive` | Reproductive |

## Authoring rules

- Each item must have exactly one listed ID. Use the item’s primary bedside domain when more than one could apply.
- The editor presents the display labels but saves the IDs.
- OpenEvidence drafts contain question text only. The formatter and structured API schema assign and accept only the listed IDs.
- Importing a workup or library with a label, synonym, combined category, or any other free-text value fails validation. There is deliberately no automatic repair or legacy inference path.
- The source of truth remains one workup JSON file per condition in `workups/admission/`; the portable library is generated from those files.
