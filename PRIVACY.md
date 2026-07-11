# Privacy Notes

This app is a local PHI risk-reduction tool, not a legal de-identification certification service.

## Local-First Behavior

- Pasted text is processed in the browser.
- Raw chart text is never saved to the encrypted vault.
- Saved patient labels, de-identified admission packets, hospital-day packets, checklist answers, and optional pasted OpenEvidence output remain encrypted in browser-local storage.
- The app has no account system, telemetry, analytics, or routine network API calls.
- Text leaves the browser only when the user deliberately copies, exports, downloads, or pastes it into another system.

## De-Identification

- Structured redaction is available locally.
- Advanced model inference runs locally in a browser worker after its asset pack is available beside the static app.
- The public static build includes baseline local model assets. Larger optional packs must be installed by the operator for a self-hosted copy; the app does not fetch them at runtime.
- A selected advanced model that cannot load fails closed. Select Structured only to intentionally use the fallback redactor.
- Review residual warnings before saving or sharing any text.

## User Responsibilities

- Review every generated prompt for possible identifiers before use outside the browser.
- Use only institution-approved external tools for clinical information.
- Use managed devices and approved browsers for real patient workflows.
- Export encrypted vault data only when moving between authorized devices.
- Clear local browser data or reset the vault before reassigning a device.

## Limits

The scrubber can miss unusual names, rare locations, institution-specific identifiers, and narrative clues. It can also over-redact clinically useful text. Manual review remains required.
