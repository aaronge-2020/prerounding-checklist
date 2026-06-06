# Security And HIPAA Posture

This project is a local-first clinical workflow aid. It is designed to reduce PHI exposure, but the codebase and GitHub Pages deployment do not by themselves make a covered entity or business associate HIPAA compliant.

## Current App Safeguards

- No app backend receives pasted chart text, saved census data, patient workspaces, or generated prompts.
- No analytics, telemetry, tracking pixels, ad scripts, or third-party font loads are included.
- The default de-identification mode is structured-only and does not download model assets.
- The optional enhanced de-identification model is explicit opt-in and may download third-party code/model assets before running locally in the browser.
- Saved census workspaces use browser-local IndexedDB encryption with a local passcode.
- Prompt copy actions run a PHI safety check before copying text intended for an external clinical AI tool.
- A Content Security Policy meta tag blocks object/embed content, forms, frames, and unexpected default resource loads.

## HIPAA Boundaries

HIPAA compliance depends on the full operating environment, not only app code. Before using this with real patients, the deploying organization should document:

- HIPAA Security Rule risk analysis and risk management for the deployed workflow.
- Which users may access the app and on which managed devices.
- Whether any external tool receiving pasted text is approved for the intended use.
- Business Associate Agreement status for vendors that create, receive, maintain, or transmit PHI on behalf of the organization.
- Audit, incident response, breach notification, retention, backup, and device loss procedures.
- Training and policy language that tells users not to paste PHI into unapproved external tools.

Official HHS references:

- HIPAA Security Rule: https://www.hhs.gov/hipaa/for-professionals/security/index.html
- Security risk analysis guidance: https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-risk-analysis/index.html
- De-identification guidance: https://www.hhs.gov/hipaa/for-professionals/special-topics/de-identification/index.html
- Business associate guidance: https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/business-associates/index.html
- Cloud computing guidance: https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/
- Tracking technology guidance: https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/hipaa-online-tracking/index.html
- Breach notification: https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html

## Deployment Headers

The app includes a CSP meta tag for static hosting. Prefer server headers when possible because headers are stronger and can set directives not reliably enforced by meta tags.

Recommended deployment headers:

```text
Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'none'; frame-ancestors 'none'; frame-src 'none'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; worker-src 'self' blob:; connect-src 'self' https://cdn.jsdelivr.net https://huggingface.co https://*.huggingface.co https://*.hf.co https://cdn-lfs.huggingface.co https://cas-bridge.xethub.hf.co https://*.xethub.hf.co; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; manifest-src 'self' blob:; media-src 'none'
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
```

If the enhanced model is not approved, remove the third-party model/CDN entries from `script-src` and `connect-src`, and leave structured-only de-identification enabled.

## Reporting Issues

Do not include patient identifiers or raw chart text in bug reports, issues, commits, screenshots, or test fixtures. Use synthetic examples only.
