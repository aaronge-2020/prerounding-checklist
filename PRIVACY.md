# Privacy Notes

This app is a local PHI risk-reduction tool, not a legal de-identification certification service.

## Local-First Behavior

- Pasted text is processed in the browser.
- Raw chart text is never saved to the encrypted vault.
- Saved patient labels, de-identified admission packets, hospital-day packets, checklist answers, and optional pasted OpenEvidence output remain encrypted in browser-local storage.
- The app has no account system, telemetry, analytics, cloud synchronization, or hosted patient-record store.
- By default, patient text is not sent over the network. The only patient-text exception is the explicit BYOK workup-formatting action: after the user checks the de-identification confirmation, the app sends only the pasted workup draft directly to OpenAI's API using the user's saved key.
- The API key is stored only inside the AES-GCM encrypted vault record in browser-local storage. It is never shown again after saving, but it must be present in browser memory while an explicitly requested conversion runs.
- Text leaves the browser only when the user deliberately copies, exports, downloads, pastes it into another system, or explicitly starts the confirmed BYOK conversion.

## De-Identification

- Structured redaction is available locally.
- Advanced model inference runs locally in a browser worker after its asset pack is available on the device.
- The public static build includes baseline local model assets. On the user's explicit **Download and install** action, optional model weights are fetched from a revision-pinned publisher URL, stored locally in the browser, and self-tested before use. That download contains no patient text.
- Optional large model packs use the browser's private filesystem where supported; GLiNER uses same-origin Cache Storage for its local tokenizer route. Imported folders can also be linked through browser-local file handles. Model files are not patient records and are never written into the encrypted patient vault.
- After installation, the model runtime rejects external model requests and reads only the bundled or browser-local asset pack during inference.
- A selected advanced model that cannot load fails closed. Select Structured only to intentionally use the fallback redactor.
- Review residual warnings before saving or sharing any text.
- Detection combines local regex rules with, when selected, a locally-run clinical NER model (OpenMed SuperClinical PII).
  Together they target most [HIPAA Safe Harbor identifier categories](https://www.dhcs.ca.gov/data-statistics/data-resources/list-of-hipaa-identifiers/):
  names, dates and ages 90+, phone/fax/email, SSNs, MRNs, health plan and account numbers, license/certificate numbers,
  addresses, URLs/IP addresses, device identifiers, biometric identifiers, and other structured IDs.
- It does not process images or photographs — this tool only ever handles pasted text — and has no dedicated detector
  for vehicle identifiers or license plates. Like any regex/NER-based system, it can miss unusual phrasing it wasn't
  trained or written to expect.

## User Responsibilities

- Review every generated prompt for possible identifiers before use outside the browser.
- Before using BYOK formatting, confirm that the pasted workup draft is de-identified and that sending it to the selected external service is permitted by institutional policy.
- Use only institution-approved external tools for clinical information.
- Use managed devices and approved browsers for real patient workflows.
- Export encrypted vault data only when moving between authorized devices.
- Clear local browser data or reset the vault before reassigning a device.

## Limits

The scrubber can miss unusual names, rare locations, institution-specific identifiers, and narrative clues. It can also over-redact clinically useful text. Manual review remains required.
