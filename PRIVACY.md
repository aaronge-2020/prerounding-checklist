# Privacy Notes

This app is built for local review before prompts are copied elsewhere. It should be treated as a PHI risk-reduction tool, not a legal de-identification certification service.

## Local-First Defaults

- Pasted chart text is processed in the browser and is not saved into the vault.
- Structured-only de-identification is the default and does not download model assets.
- Single-patient mode does not create a saved census vault.
- Census mode stores encrypted de-identified case workspaces in this browser's IndexedDB using the local passcode.
- Raw chart text, admission intake text, patient names, MRNs, room numbers, and obvious roster identifiers are dropped before vault storage.
- OpenEvidence paste-back review stores reviewed summaries in browser storage only after a PHI safety check. The raw pasted answer is not persisted.

## Data That Can Leave The Browser

- Text leaves the browser only when a user intentionally copies and pastes it into another site.
- Encrypted context and census exports leave the browser only when a user intentionally downloads or shares those files.
- If enhanced model de-identification is enabled, the browser may download third-party code/model assets. Chart text is still intended to be processed locally, but the asset requests expose ordinary network metadata such as IP address and user agent to those providers.
- External clinical AI tools, including OpenEvidence, are separate systems with their own privacy, security, and contracting requirements.

## User Responsibilities

- Review every copied prompt for possible PHI before using it outside the app.
- Do not paste PHI into an external clinical AI tool unless the workflow is approved by your institution.
- Use managed devices and approved browsers when handling real patient information.
- Export only encrypted files when moving context between devices.
- Delete local browser data or reset the vault when a device is reassigned, lost, or no longer authorized.

## De-Identification Limits

The scrubber can miss identifiers, especially unusual names, rare locations, free-text narrative clues, and institution-specific IDs. It can also over-redact clinically useful terms. Manual review remains required.
