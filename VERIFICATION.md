# Current verification

October 19, 2026: [experimental Gemini and efficient v3 builder report](VERIFICATION-gemini.md). It separates baseline, synthetic tests, actual local browser/workerd checks, an owner-reported successful live Gemini creation evaluation, a manual deployed test-Worker theme-edit/Apply/reload/export smoke test, and broader unrun comparisons. Historical results below are retained as historical evidence.

# Verification — Cloudflare redirect compatibility fix

## October 16, 2026: immediate AI_UNAVAILABLE diagnosis

The owner reported an HTTP 503 response with code AI_UNAVAILABLE in under a second. The provider adapter used redirect:'error'. Cloudflare workerd's Request redirect parser supports follow and manual, not error; this is a concrete compatibility defect consistent with the report. The previous Node-only provider mocks did not catch it. The original cloud exception/log was not available, so a successful deployed retry remains necessary to confirm end-to-end recovery.

Changes:

- Use redirect:'manual' for the server-side provider call and explicitly reject all 3xx responses with AI_REDIRECT_BLOCKED. Never follow Location, replay a request, or forward credentials to a redirect target.
- Preserve the real HTTP error classification if response cleanup fails.
- Report timeout/abort exceptions as AI_TIMEOUT (504); keep unexpected errors sanitized as AI_UNAVAILABLE without automatically calling them timeouts.
- Update the existing request assertion for manual mode. The config test now permits the owner's deliberate true/false enablement setting while checking that private keys are absent. Runtime checks still require credentials, Turnstile, and both limiters.
- Preserve the owner's wrangler.jsonc, secrets, public site key, runtime UI, rate limits, and model selection.

### Local evidence

- Reconstructed provider source and shared runtime files were checked against their current Git blob hashes before editing.
- The 22 new regression tests failed against the old adapter and passed after the change.
- 74/74 local tests passed: 52 existing core tests plus 22 regression tests. The complete repository suite is run separately by GitHub Actions; its result is recorded in that commit's run rather than inferred from this subset.
- The workerd restriction was **simulated**, not exercised in a running Cloudflare isolate. A separate test used a real local Node HTTP server and fetch to verify a 307 response is rejected and the redirect target receives zero requests.
- Tests cover both provider routes, 301/302/303/304/307/308, cleanup failures, and timeout classification. No real API keys, live provider calls, or model quota were used.
- No direct production request, Cloudflare log inspection, browser build, or deployment success is claimed by these tests.

Primary implementation reference: https://github.com/cloudflare/workerd/blob/025b6c71b9767b3ac7a772af3c3232943ba2e86a/src/workerd/api/http.h (Request::Redirect), and src/workerd/api/http.c++ (Request::tryParseRedirect).

---

# Historical verification — Native AI v0.2.1 / Groq integration

## Initial integration: October 16, 2026

- **150/150 Node automated tests passed:** the existing 74 checks plus 76 Groq/provider and acceptance-script checks. No test was skipped.
- Groq tests use synthetic Chat Completions responses, not actual model inference. They exercise the strict schema request, model/provider selection, missing-config rejection, Turnstile-to-provider flow, successful new design, edits preserving sample records, export compatibility, unsupported requests, malformed/truncated/refused responses, and rejection of destructive ID/type/choice changes.
- Quota, credential and upstream/network errors were injected. The tests assert no automatic retry, no provider fallback, sanitized errors, bounded response parsing, and a Retry-After hint for quota failures. Browser assets are checked for provider credential references and server-adapter imports.
- All JavaScript modules passed syntax checks; git diff whitespace checks passed. The local baseline tree matched the repository's published v0.2 tree before editing.
- The maintainer smoke script ran in dry mode and its missing-key guard was tested. It issues no request without explicit --live authorization and a privately supplied key.
- Coverage from synthetic tests: provider adapter 100% lines / 93.50% branches. This is test coverage, not evidence of model quality or security assurance.

**At the initial integration handoff, live Groq inference was not run: no GROQ_API_KEY was configured.** Cloudflare hosting, secrets, Turnstile and billing settings were not changed by that update. The checked-in configuration then left public AI disabled; the owner subsequently enabled it. Browser runtime and UI files were unchanged by the integration; the earlier browser checks below were not rerun and are historical evidence only.

The evidence/groq-tests.json records the initial integration test counts and SHA-256 of the local TAP report. CI repeats only offline tests. No live end-to-end build or efficiency improvement was established by those tests.

---

# Historical verification — Native AI v0.2

## Executed

- **74/74 Node automated tests passed.** Starter/model constraints, input data, migrations, export escaping, ZIP structure, provider schema, mocked gateway security/error paths.
- **25/25 restricted-environment DOM/packaging checks passed.** Studio rendering, plain-language starter, record creation/edit/delete, search, board grouping, rename/theme/optional field edits preserving data, unsupported-request refusal, mobile preview, 390px viewport overflow check, restoration through a memory storage adapter, export runtime with network calls disabled, ZIP CRC verification with an independent ZIP reader.
- JavaScript modules passed `node --check`.
- Desktop/mobile screenshots were visually inspected in the development session.

The earlier Intent Native v0.1 test counts are not reused as evidence for this implementation.

## Important test limitation

Managed Chromium returned ERR_BLOCKED_BY_ADMINISTRATOR for direct local HTTP navigation. The policy was not altered. tests/render_check.py instead injected locally available app assets into a blank page and used a clearly isolated test-only in-memory localStorage adapter. Exported runtime rendering was checked the same way with network calls unavailable.

These results are not proof of real browser localStorage durability, page-reload behavior, direct file:// opening, actual browser downloads, service-worker installation, or deployed HTTP end-to-end behavior. tests/browser.py contains direct-navigation checks for an unrestricted machine; that full suite did not run here.

## Not executed or not implemented at that handoff

Real model credentials/calls; actual Cloudflare Worker and Turnstile deployment; GitHub Pages activation; Safari/iOS/Android device tests; production identity and authorization; cross-device records; native APK/IPA generation; store publishing; hosted URLs for exported apps; independent security audit; fair efficiency benchmark against source-code generation.

Screenshots and sample exports are handoff artifacts. The committed evidence/browser-results.json records the restricted test method and checks; evidence/test-summary.json records the Node result and the hash of the full TAP log supplied in the downloadable archive. Fixtures are fictional, not user data.
