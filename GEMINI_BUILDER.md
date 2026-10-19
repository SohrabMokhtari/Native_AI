# Experimental v3 Gemini builder

Verified October 19, 2026. Starting repository commit: `16ee5cac4df3dab8b57fa5aac59f9988ad0b6ad3` (also `origin/main` after fetch). Development branch: `feat/gemini-efficient-builder`.

## Provider contract and privacy

Google currently documents stable `gemini-3.8-flash`, function calling, a 1,048,576 input / 65,536 output token model limit, and low/medium/high thinking; minimal thinking is unsupported. The pricing page lists a standard free tier. This says nothing about this owner's access or remaining quota. Check the **specific project and model** in Google AI Studio's active rate limits and billing screens. Limits are project scoped; adding keys does not add quota. There is no evidence that this project's Gemini allowance exceeds Groq's.

The experimental adapter uses `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent`, an `x-goog-api-key` header, native function declarations with `parametersJsonSchema`, `ANY` function mode, low thinking and `maxOutputTokens`. It does not use the Interactions API. Tool results use `functionResponse.name` and the returned call ID when supplied. The complete original model content, including opaque thought signatures and part metadata, is retained unchanged for continuation inside one bounded server session. It is never decoded, logged, returned to the browser, persisted, or shared across builds. Unexpected output, multiple calls, refusal, truncation and malformed responses fail explicitly before tools execute. Parallel mutation is unsupported.

For Google's unpaid services, prompts/responses may be used to improve products and reviewed by humans. Do not send confidential or sensitive information. Regional and account exceptions apply; for example the EEA, Switzerland and UK receive the paid-service data treatment specified in Google's terms. Paid-service prompts/responses are not used for product improvement under those terms, though limited safety/abuse processing remains. An API key or model name does not identify the project's legal/data tier. `store:false` requests logging behavior; it does not override Google's terms or establish zero retention. The owner must review applicability before offering this to visitors. The current terms also restrict consumer/under-18 use and require Paid Services for API clients offered in the EEA, Switzerland or UK; review these conditions before public rollout. The studio displays a Gemini-specific notice. Prompts, design constants, requested design context and up to eight conversation messages are sent; saved records and runtime snapshots are excluded. Literal design state and fictional test fixtures are design context and may be inspected.

## Isolation and configuration

Production `wrangler.jsonc`, enablement flags, Turnstile, hostname/action verification, rate limits and legacy builder configuration are unchanged. No billing or secrets are activated by this branch.

| Setting | Resolution |
| --- | --- |
| v3 provider | `V3_AI_PROVIDER`, otherwise existing `AI_PROVIDER` |
| v3 model with Groq | `V3_AI_MODEL`, otherwise `AI_MODEL`, otherwise `openai/gpt-oss-120b` |
| v3 model with Gemini | `V3_AI_MODEL`, otherwise `gemini-3.8-flash`; never inherits legacy `AI_MODEL` |
| Groq models | Existing `openai/gpt-oss-120b` and `openai/gpt-oss-20b` allowlist |
| Gemini models | Only verified `gemini-3.8-flash` |
| secret | Selected provider's own server secret; no fallback |
| public flags | Both `PUBLIC_AI_ENABLED=true` and `COMPOSABLE_AI_ENABLED=true`, plus all existing abuse controls |

Explicit blank/unknown selections fail closed. Missing Gemini credentials produce `AI_NOT_CONFIGURED`; the v1 Groq route remains configured independently. `/api/v3/config` returns only mode, public site key, provider, model, maximum calls, completion budget and deadline. Config means presence of settings, not successful provider connectivity.

## Construction and limits

The canonical complete program stays in the local construction session and is independently validated after edits. Models receive an index of stable IDs, types, page/node locations and complete metadata/design. `inspect_structure` retrieves exact items plus transitive collection/state/function/action/navigation dependencies. It accepts 1–8 targets and rejects responses above 24,000 bytes rather than truncating semantics; narrower node IDs can be requested. Literal data is not interpreted as references. Existing whole-item replacements must be based on inspected exact items, as directed in the tool instructions. This is a model workflow instruction, not a completeness proof.

`submit_app({payload,message,revision})` explicitly means a complete submission, automatic validation/preflight/supplied tests, and finalization if all checks pass. It removes the acknowledgement-only `finish_build` turn. Staged `edit_app`/`test_app`/`finish_build` remain supported. Every returned result is still a **draft** requiring browser Apply/Discard. The browser checks populated-data compatibility and its current revision. Undo, records, runtime state, exports and the runtime itself are unchanged. Passing supplied tests cannot prove user-intent correctness; hosted finalization requires at least one supplied behavior test. Preflight still reports a warning for untested imports/examples; parsing and expression checks alone cannot finalize a hosted submission.

Structural rejection does not change the draft. A structurally valid draft whose behavior checks fail remains private for bounded repair at its updated revision. Feedback supplies concise errors, affected edit targets, failed test names and page/scenario IDs. Automatic successful feedback omits unchanged program structures. No automatic retry occurs for quota, credentials, HTTP/network/timeout errors; no alternate provider is contacted. Unknown local tools can only receive repair feedback, never execute network/code operations.

Safe existing build defaults remain: 3 calls (operator may choose 2), 8,192 aggregate completion tokens, at most 4,096 per call, 220,000 aggregate serialized request bytes, 55 seconds per build, at most 30 seconds per provider call and 262,144 response bytes. The gateway body remains bounded to 190,000 bytes. These are application limits, separate from provider quotas and runtime capabilities. Gemini's larger model window does not raise them.

Usage records include calls, elapsed milliseconds, request bytes, repairs and each turn's provider-reported input/output/thinking/cache/total counts. Unknown counts are `null`. Output estimates are separately labeled byte/3 estimates, not tokenizer counts. Complete completion counts are used directly. When the thinking breakdown is missing, consistent reported total minus prompt tokens provides a conservative completion upper bound: Google's documented total includes prompt, tool-use prompt, thinking and candidates, so this subtraction retains all thinking and may also retain extra tool-use input. This does not infer that thinking was zero. Missing or inconsistent usable counts still spend the full allocated allowance. Each turn labels the charge basis; the separate byte estimate may conservatively increase the charge. Groq completion includes reasoning; Gemini candidates and thought counts are separate. Cached tokens are an input subset. Never add thinking/cache again to provider total counts. The service cannot report exact remaining project quota or guarantee a monetary cap on a billable project.

Failed maintainer evaluations include the bounded local tool trace and build charge details, including the rejected tool and validation message. A failed local check also retains `trace[].draftChecks`, even if a subsequent repair request fails at the provider. Test failures identify their phase, index path and kernel error; view-preflight failures identify the node, page and scenario. Actual/expected assertion values are excluded, along with raw tool arguments, provider prose, credentials and opaque continuation metadata. This helps distinguish construction/validation failures from quota, time or completion-budget exhaustion.

Schema repair feedback names the exact object path and missing/unexpected properties, with required/allowed keys taken from the strict runtime validator. Diagnostic values are excluded, unknown key lists are bounded and credential-shaped names are redacted. Acceptance rules and runtime operations are unchanged. Rejected creation leaves `draftState.hasDraft=false` and `nextPayload=program`; repair must resend a complete corrected program. A valid private draft with failed behavior checks instead accepts ID-based edits. Feedback includes remaining calls and completion capacity. Failed evaluation rows identify `budgetLimit` (`calls`, `completion` or `inputBytes`), so a call-limit failure with completion tokens left is explicit.

## Browser-oriented owner rollout

1. Review the feature PR and verification report. Use a separate test Worker first; do not connect its branch to production deployment before review.
2. In Google AI Studio, select the intended project, confirm model access, active quotas, billing state and applicable data-use terms. Create a restricted Gemini API key. Keep it private; do not paste it into a visitor page, prompt or repository file.
3. In the **test Worker** Cloudflare dashboard, open **Settings → Variables and Secrets**. Add `GEMINI_API_KEY` as an encrypted secret. Add ordinary variables `V3_AI_PROVIDER=gemini` and `V3_AI_MODEL=gemini-3.8-flash`. Keep existing `AI_PROVIDER=groq`, `AI_MODEL`, `GROQ_API_KEY`, enablement flags and all abuse controls intact. Save/deploy changes only when the owner chooses.
4. Open the test origin's `/api/v3/config`. Expect `mode:live`, `provider:gemini`, `model:gemini-3.8-flash`, and public limits only. `AI_NOT_CONFIGURED` requires correcting configuration; it does not fall back. Open `/v3/index.html`, confirm Gemini/privacy labeling, solve Turnstile, and request one small task board. Review the draft before Apply. Check reload, records and export. This first real build is **NOT RUN** by this change.
5. Roll back on the test Worker by removing `V3_AI_PROVIDER` and `V3_AI_MODEL`, or explicitly selecting `V3_AI_PROVIDER=groq` with `V3_AI_MODEL=openai/gpt-oss-120b`. Remove both overrides together to avoid a mismatched model. Confirm config reports Groq. To disable the lab, set `COMPOSABLE_AI_ENABLED=false`; leave legacy flags unchanged. Removing the Gemini secret is optional owner cleanup. Workspaces use the same format and storage keys across providers.

Provider errors: `AI_CREDENTIALS_REJECTED`/`AI_MODEL_UNAVAILABLE`/`AI_REQUEST_REJECTED` need operator attention; `AI_QUOTA_EXCEEDED` carries a bounded `Retry-After` hint, not a quota guarantee. `AI_TIMEOUT`, `AI_UNAVAILABLE`, `AI_INVALID_RESPONSE`, `AI_INCOMPLETE_RESPONSE`, `AI_RESPONSE_TOO_LARGE` and `AI_BUDGET_EXCEEDED` leave user data unchanged. Users may deliberately retry after resolving the cause; the builder does not do so automatically.

### Separate test Worker configuration

`wrangler.gemini-test.jsonc` targets `native-ai-gemini-test`, serves the same tracked studio assets and selects Gemini for v3 only. Its rate-limit namespaces `10711` / `10712` differ from the existing Worker's `10701` / `10702`, with unchanged request limits. No secret or Turnstile site key is included. Public/v3 enablement flags are absent, so a fresh test Worker fails closed. `keep_vars:true` preserves runtime variables added through the dashboard; values declared in the file remain authoritative on later deployments. The existing `wrangler.jsonc` is unchanged.

Use these build settings for this test Worker:

| Setting | Value |
| --- | --- |
| GitHub repository | `SohrabMokhtari/Native_AI` |
| Deployment branch | `feat/gemini-efficient-builder` |
| Project / Worker name | `native-ai-gemini-test` |
| Root directory | Repository root (`/`) |
| Build command | Leave empty |
| Deploy command | `npx wrangler@4.151.2 deploy --config wrangler.gemini-test.jsonc` |
| Preview command | `npx wrangler@4.151.2 preview --config wrangler.gemini-test.jsonc` |

The test config exists on the feature branch. If the initial import form does not offer branch selection, create an empty `native-ai-gemini-test` Worker using the dashboard's Hello World option, then connect GitHub through that Worker's Settings > Build. Select the feature branch before the first repository deployment. Cloudflare calls this the test Worker's production branch; it does not change the existing `native-ai` Worker's branch. Never substitute the default configuration to bypass a missing-file error on `main`.

After the test code is deployed, add encrypted `GEMINI_API_KEY` and `TURNSTILE_SECRET`, the public `TURNSTILE_SITE_KEY` for the test hostname, and runtime variables `PUBLIC_AI_ENABLED=true` / `COMPOSABLE_AI_ENABLED=true`. These belong under Settings > Variables and Secrets, not build-only secrets. The proof's hostname/action checks and both rate-limit bindings remain required. Do not copy a real key into this file or the build commands. Confirm `/api/v3/config` before requesting a browser build. To disable the test v3 route, set `COMPOSABLE_AI_ENABLED=false`; `keep_vars` retains that dashboard setting on later deployments.

Cloudflare references, checked October 19, 2026: [Worker names and Git connection](https://developers.cloudflare.com/workers/ci-cd/builds/), [build fields and runtime/build variable separation](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [branch selection](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/), [shared rate-limit namespaces](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), and [dashboard variable persistence](https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth).

## Maintainer evaluation (optional developer tools)

Dry command, no credentials or inference:

```sh
node scripts/eval-builder.mjs
```

The comparison configurations are `baseline-groq` (frozen loop and instructions from the starting commit), `optimized-groq`, and `optimized-gemini`. The baseline is evaluation-only and cannot be selected from the public gateway. Every configuration receives identical task prompts and fresh starting workspaces. Independent assertions live in `scripts/eval-cases.mjs`, outside model-editable tests. Eight tasks cover task creation, record-preserving redesign, empty/nonempty completion percentage, overdue exclusions, Focus filtering, quiz transitions/restart, unsupported shared backend, and a held-out fractional parcel calculator unrelated to authored examples. Explicit IDs make behavioral checks repeatable. They do not make this a broad application-quality benchmark.

Private maintainer setup: copy `.dev.vars.example` to ignored `.dev.vars`, fill `GEMINI_API_KEY` privately, then explicitly opt in to one first smoke case:

```sh
node --env-file=.dev.vars scripts/eval-builder.mjs --live --config=optimized-gemini --case=create --max-calls=3 --max-tokens=12288
```

This permits at most three calls with 12,288 conservative output-token reservations across requests; the builder additionally enforces its unchanged 8,192 charged completion budget. Input is separately byte bounded. Live startup/request status and five-second heartbeats appear on stderr; stdout remains the final JSON report. Waiting includes separate header/body stages, with cancellation enforced even for an uncooperative fetch or stream and nonblocking cleanup. Each request is limited to at most 30 seconds and each build to 55 seconds. If the old CLI stays blank beyond a minute, cancel with Ctrl+C before retrying. The script reports sanitized metrics, not keys, prompts in live results, program contents, or opaque continuation parts. It does not open a browser, apply a draft or save an app file; `exported:true` means HTML export checks passed in memory. To create an app interactively, use the configured test studio at `/v3/index.html` as described above. It stops on quota failure and never enables billing. For a matched small comparison, run the same case separately with `--config=baseline-groq` and `--config=optimized-groq`, the same budgets, and a private Groq key; respect project limits between commands. `--config=all --case=all` is a larger explicitly budgeted comparison, not the default. No model cost/quality win is established by dry or synthetic results.

Optional browser test: `node tests/gemini-browser.mjs` with a maintainer-installed Playwright/Chromium. `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` accept local installations. It uses real local browser storage/navigation with mocked inference/Turnstile. Optional Workers check: `wrangler dev --local --config tests/wrangler.integration.jsonc --ip 127.0.0.1 --port 4323`, then fetch `http://127.0.0.1:4323/`. Its fixture Worker imports the actual production routing/build modules but never contacts a provider. It is not referenced by production configuration.

## Official references (checked October 19, 2026)

- Model and availability: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
- Native endpoint, function declarations/results, token usage and thinking configuration: https://ai.google.dev/api/generate-content
- Function calling and continuation: https://ai.google.dev/gemini-api/docs/function-calling
- Signatures (redirects to thinking guide): https://ai.google.dev/gemini-api/docs/thought-signatures and https://ai.google.dev/gemini-api/docs/thinking
- Free-tier publication: https://ai.google.dev/gemini-api/docs/pricing
- Project quotas and active-limits link: https://ai.google.dev/gemini-api/docs/rate-limits
- Authentication: https://ai.google.dev/gemini-api/docs/api-key
- Provider errors and HTTP 503: https://ai.google.dev/gemini-api/docs/troubleshooting
- Data-use conditions: https://ai.google.dev/gemini-api/terms
- Groq tools: https://console.groq.com/docs/tool-use/overview
- Groq limits: https://console.groq.com/docs/rate-limits
- Cloudflare encrypted secrets: https://developers.cloudflare.com/workers/configuration/secrets/

After several owner-reported failures at provider availability, budget accounting, strict schema or local checks, the owner supplied a successful `optimized-gemini/create` result: two HTTP 200 responses, one repair of invalid/duplicate parameter IDs, two supplied tests passed, independent acceptance/export checks passed, 47,571 ms elapsed. Reported usage was 6,659 input / 4,166 output / 10,825 total tokens; thinking/cache counts remain unknown. This was a new-app fixture with no existing records, direct provider access and an in-memory export check. It does not establish record-preserving live edits, deployed behavior or comparative quality/cost. Timeout/progress changes were subsequently verified with fixtures and localhost only; a live rerun of those changes is NOT RUN. No agent live request or private credential read was made. Keep Groq as default; one smoke result is insufficient evidence to promote Gemini.
