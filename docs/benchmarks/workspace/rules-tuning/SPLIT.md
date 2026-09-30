# Dev / holdout split (documented 2026-09-29)

- `data/sample.jsonl` row order is identical to `data/sample_manifest.json` `ids` order (verified: `manifest["ids"] == [r["id"] for r in rows]`).
- **Dev set**: first 700 rows in file order (manifest ids[0:700]) — all rule tuning runs here.
- **Holdout set**: remaining 300 rows (manifest ids[700:1000]) — touched only for the final reporting run.
- Rationale: manifest order is the dataset's own sampling order (seed 42, random), so a prefix split is a valid random split, not a biased slice.
