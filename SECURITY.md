# Security Posture

This project is a browser-local clinical workflow aid. It reduces exposure of patient data but does not independently make a covered entity, deployment, or user workflow compliant with HIPAA or any other regulation.

## Implemented Safeguards

- AES-GCM encrypted browser-local vault storage derived from a user-provided passphrase.
- No account system, remote database, API, telemetry, trackers, or third-party font loads.
- Raw pasted chart text is not written to the vault.
- User-directed copy and download handoff bundles stay local and are encrypted before transfer.
- Advanced de-identification runs inside a browser worker and fails closed when its selected local model is unavailable.
- A restrictive static CSP limits the app to same-origin code, workers, assets, and fetches.

## Operational Boundary

Deployers remain responsible for device management, access control, risk analysis, approved external-tool use, incident response, retention, and staff training. Do not paste identifiers into unapproved systems.

Useful official references:

- [HHS HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/index.html)
- [HHS risk analysis guidance](https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-risk-analysis/index.html)
- [HHS de-identification guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/de-identification/index.html)
