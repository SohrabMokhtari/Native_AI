# Verification: experimental Gemini and efficient construction

Date: October 19, 2026. Branch: `feat/gemini-efficient-builder`. Baseline `16ee5cac4df3dab8b57fa5aac59f9988ad0b6ad3` matched `origin/main` after an authenticated fetch. The starting working tree was clean. No pre-existing failures were found.

Follow-up: the owner supplied a live Gemini result with HTTP 200 twice, input/output/total counts `(2058, 2312, 4370)` and `(4454, 10, 4464)`, and missing thinking/cache breakdowns. The initial code unnecessarily reserved all 4,096 completion tokens per response and stopped after two calls. It now uses consistent total-minus-prompt counts as a conservative completion bound while leaving missing thinking counts unknown. No limits were raised, no automatic retries were added, and no live request was made by the agent to test the correction. Failed evaluations now retain sanitized local construction traces and charge bases; the exact initial validation error remains unknown because the owner's old output did not include it.

| Check | Actual result and scope |
| --- | --- |
| Baseline `node --test tests/*.test.mjs` | 286 passed, 0 failed |
| Updated full suite | 387 passed, 0 failed, 0 skipped; 101 additional checks, including 12 accounting/diagnostic regressions after the initial 375-test handoff |
| Syntax | 38 `.mjs` modules checked with `node --check`, including both Workers and tests |
| Whitespace | `git diff --check` passed |
| Browser | Both provider configurations passed 9 acceptance categories each in actual local Chromium 151, with actual origin localStorage and reload. Inference and Turnstile were mocked; no simulated memory storage adapter was used. |
| Workers | Actual local workerd through Wrangler 4.151.2: 21 reported checks passed, including both adapters, opaque continuation, native Web APIs, routing, full generation/challenge path, unchanged legacy provider selection, injected HTTP errors, and a third-call repair with missing thinking details. All provider/challenge responses were synthetic. |
| Evaluation CLI | Dry run completed, with 3 configurations and 8 tasks; zero inference calls. Missing credentials, invalid options, explicit budgets, failed-attempt accounting and quota-stop behavior covered by tests. |
| Live Groq/Gemini evaluation | Owner-reported Gemini attempts failed: first HTTP 503, then two HTTP 200 responses followed by the accounting-related budget stop. No successful live build or provider comparison. Live rerun after this fix is **NOT RUN**. No agent live calls or credential reads. |
| Cloud deployment / real Turnstile / real provider round trip | **NOT RUN**. No deploy, Cloudflare secret edit, billing activation or production provider switch. |

Node tests use synthetic responses and fixture credentials only. They cover configuration precedence and public allowlists, independent legacy Groq operation, native Gemini formatting/thinking/function-result associations, intact private signatures, combined submission, exact dependency inspection, local repair, unsupported requests, stale/destructive edits, malformed/empty/truncated/refused/multi-call output, oversized input continuation/response bounds, missing usage, HTTP 3xx/400/401/403/404/429/5xx, cleanup failures, timeout/cancellation, no fallback/retry, cross-request isolation, exports and independent evaluation assertions. Existing assertions were retained; the exact tool-list assertion was extended for the two new declared tools.

The browser checks cover selected provider and Gemini privacy labeling, record creation, reload, unapplied draft staging, discard, apply, compatible undo, standalone download, no private records in requests and no page exceptions. They do not prove inference quality or deployed behavior. The Workers fixture imports the actual production entry point and adapters under a separate local-only config; no test routes enter the production config. Sandbox restrictions initially blocked Wrangler's log/bundler directory access. The successful check ran outside that file sandbox with workspace-local logs, fixture credentials and localhost binding, without deployment.

## Measured overhead, not inferred model performance

`evidence/gemini-efficiency.json` compares the frozen baseline Groq loop against the optimized Groq loop, given **synthetic tool results producing the exact same app edit**:

| Metric | Baseline | Optimized |
| --- | ---: | ---: |
| Model calls represented | 2 | 1 |
| Serialized request bytes across calls | 27,735 | 11,017 |
| Full initial design / compact index bytes | 4,938 | 1,821 |

Token counts in this fixture are injected test values, not measured inference usage. These results demonstrate removal of an acknowledgement-only turn and reduced design context for this fixture. They do not establish general quality, token/quota savings, or comparative Gemini performance. Existing instructions and loop are frozen in `scripts/baseline-agent.mjs` / `baseline-spec.mjs`, with only import relocation and a provenance comment; they are evaluation-only. The executable runtime is unchanged.

The dry/live harness compares baseline Groq, optimized Groq and optimized Gemini on identical isolated tasks, with acceptance assertions outside model-editable program tests. It includes a held-out fractional quote calculator. The harness counts failed requests, reports unknown usage separately, reserves an explicit global output-token allowance and stops on quota failure. Its conservative reservation budget is distinct from the builder's unchanged per-build charged completion budget and from provider input quotas. It is not a monetary billing guard.

## Evidence and reproduction

- `evidence/gemini-verification.json`: baseline/current counts, checked module count and SHA-256 of the local ignored TAP output.
- `evidence/gemini-browser.json`: actual local-browser categories, with mock boundaries stated.
- `evidence/gemini-workerd.json`: actual local workerd checks, with synthetic-inference boundary stated.
- `evidence/gemini-efficiency.json`: synthetic byte/call comparison.
- `evidence/gemini-accounting-replay.json`: owner-reported failed-attempt metadata and conservative bounds, with synthetic replay and live-verification limits stated.
- `evidence/gemini-eval-dry.json`: dry task/configuration manifest, no model outcomes.
- `node --test tests/*.test.mjs`
- `node scripts/eval-builder.mjs`
- Optional browser/Workers commands and exact small live command: [GEMINI_BUILDER.md](GEMINI_BUILDER.md#maintainer-evaluation-optional-developer-tools).

Official provider contracts and terms were read on October 19, 2026; URLs and owner-controlled browser setup/rollback are recorded in [GEMINI_BUILDER.md](GEMINI_BUILDER.md). Actual project access, applicable account tier, billing state, regional eligibility and quotas are still unverified. No private credential was read into a prompt or committed. The feature does not alter production `wrangler.jsonc`, either entry-point Worker, the legacy adapter, the interpreter, renderer or export engine. Groq remains the configured default. Evidence is insufficient to promote Gemini.
