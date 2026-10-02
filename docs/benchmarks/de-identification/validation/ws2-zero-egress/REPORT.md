# Zero-Egress Validation Report

## What was tested

The browser-local de-identification workflow of the pre-rounding checklist application, reconstructed from the remote `main` branch as deployed on 2026-09-29 (434 files, including the Stanford clinical de-identifier model restored from its 14 verified chunks totaling 109,651,017 bytes).

All note text used in testing was synthetic, invented for this validation. No real patient data was involved.

## How it was tested

Three separate browser sessions ran against a local server serving the reconstructed application:

1. **Cold session**: Fresh browser profile. Page load, vault unlock, Stanford model initialization, and de-identification of five synthetic clinical notes. No send step.
2. **Warm session**: Same browser profile reloaded. Page load and de-identification of one synthetic note. No send step.
3. **Send-path session**: Separate fresh profile. One synthetic note de-identified, reviewed through the application's review interface, then sent using the application's real transmit builder (`buildTransmitPayload`) and real OpenAI client (`requestOpenAiChat`) with the dummy key `sk-test-dummy`.

Every HTTP request in each session was captured, including method, URL, host, headers (with authorization redacted), and body.

## What was found

### Cold and warm sessions: no remote requests

| Session | Total requests | To local server | To remote hosts | POST requests |
|---------|---------------|-----------------|-----------------|---------------|
| Cold    | 301           | 299             | 0               | 0             |
| Warm    | 268           | 266             | 0               | 0             |

The remaining requests in each session were a `data:` URL (an inline SVG icon) and a `blob:` URL (a locally created object URL from a buffered model chunk). Neither leaves the browser.

No synthetic note text appeared in any request URL or body to a remote host in either session. The warm session made fewer requests than the cold session (268 vs 301), consistent with the model files being served from the browser cache on repeat load.

The 25 `HEAD` requests in each session are the application's background model-pack availability probes. They carry no note content.

### Send-path session: one authorized request, no original identifiers

The send-path session made exactly one `POST` request containing note-derived text:

- **URL**: `https://api.openai.com/v1/responses`
- **Body size**: 982 characters of JSON
- **Original synthetic identifiers in body**: 0 of 27 enumerated
- **Redacted markers in body**: present (`[PATIENT NAME]`, `[DOB]`, `[MRN]`, `[REDACTED]`)

The request also included the fixed system instruction and the application's standard metadata. A CORS preflight `OPTIONS` request preceded the POST, as browsers require; it carried no body. The dummy key was rejected by the network (the test environment blocks the connection), so no content reached OpenAI's servers.

## Model recall gap observed

The Stanford model did not redact the synthetic phone number `555-0142` in the test note, and the review interface did not flag it as a residual identifier. The number was redacted manually before the send-path assertion, simulating what a user reading the output would do. This gap concerns the model's recall, not network egress: the unredacted number never left the browser except in the manually cleaned send-path test.

## Claim

Across one fresh-profile session and one repeated-profile session against the identified 2026-09-29 remote-main Pages artifact — covering page load, local Stanford model initialization, synthetic-note de-identification, and review without send — no synthetic note text appeared in any captured HTTP request body to a remote host. In the separately authorized send-path test, the only remote request containing note-derived text was `POST https://api.openai.com/v1/responses`; its JSON body contained the reviewed redacted note text together with fixed request instructions and metadata, and none of the enumerated original synthetic identifiers.

## Limitations

- **Test-environment fetch wrapper**: Headless Chromium deadlocks when the application fetches large model chunks in parallel (it holds six connections open with unread bodies). A wrapper installed before page load buffers chunk responses as Blobs so the page can proceed. This changes response buffering only; request URLs, request counts, and bytes transferred are unchanged. A real user's browser does not need this workaround.
- **API-driven de-identification in cold/warm**: The cold and warm sessions drove de-identification through the application's `deidentifyText` API directly rather than clicking through the full review UI, because the UI flow was too slow for repeated measurement in this environment. The network traffic measured — page load, model chunk fetches, and the absence of any egress during inference — is the same traffic the UI flow generates. The send-path session did use the real review UI.
- **Manual redaction of one missed identifier**: The model missed one synthetic phone number and the review UI did not flag it (see above). It was redacted by hand before the send-path body assertion. The assertion therefore verifies the wire format of a reviewed payload, not the model's recall.
- **Dummy credentials, blocked connection**: The send-path test used `sk-test-dummy` and the request never completed (connection blocked in this environment). The captured request body is what the application attempted to send.
- **Scope**: This validates network egress for the tested artifact, model, and synthetic notes. It does not validate the model's redaction recall, the application's behavior with real clinical text, or any other model option.
