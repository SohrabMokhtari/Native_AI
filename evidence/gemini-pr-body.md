The v3 builder embeds Groq transport and requires a separate completion turn after validating an app. This adds an opt-in native Gemini adapter behind a provider-independent construction loop, bounded dependency inspection, compact repair feedback and a combined submission operation. Groq remains the default. Production configuration, legacy routing, interpreter operations and exports are preserved.

Independent V3_AI_PROVIDER / V3_AI_MODEL overrides isolate v3 experiments. Gemini uses header authentication, native function declarations/results and private bounded opaque continuation. Both transports use manual redirects, deadlines and response limits, without automatic retry or fallback. The studio identifies the selected provider and Gemini privacy terms. Setup and rollback are documented in GEMINI_BUILDER.md.

Repair feedback identifies strict-schema paths and missing/unexpected keys, distinguishes a rejected creation from a valid private draft, and reports remaining capacity. Consistent provider total/prompt usage bounds completion charges without treating unknown thinking counts as zero. Failed evaluation traces retain bounded check summaries, test phase/index paths and failing view nodes even when the subsequent repair receives HTTP 503. Raw programs, assertion values, provider prose, credentials and opaque metadata are excluded; validation and completion limits are unchanged.

Validation:

- Baseline: 286 tests passed. Current: 418 passed, none failed/skipped. Syntax checks passed for 38 modules; whitespace checks passed.
- Actual Chromium with origin localStorage: both providers passed draft/Apply/Discard/undo/reload/export/privacy checks. Inference and Turnstile were mocked.
- Actual local workerd through Wrangler 4.151.2: 25 checks passed, including both transports, full gateway routing, continuation, bounded repairs and retained failed-check evidence after repair HTTP 503. Inference/challenge responses were synthetic.
- Historical synthetic Groq edit: 2 to 1 calls, 27,735 to 11,017 request bytes at the initial feature commit. This measures overhead only, not live token/cost/quality gains.
- Dry-by-default evaluation compares frozen baseline Groq, optimized Groq and optimized Gemini on eight tasks with independent assertions, failed-attempt accounting and explicit live budgets.

Owner-run live attempts have failed at provider availability, budget accounting, strict schema or local behavior checks. The latest reached a valid private draft, failed local checks and then received HTTP 503 on the repair call. The original failed check is unknown because the earlier trace omitted it. No successful live build or provider comparison is established. No agent live calls or credential reads were made; a live rerun after the latest diagnostic correction is NOT RUN.

Actual project quotas, deployed Turnstile and deployed end-to-end builds remain unverified. Evidence is insufficient to promote Gemini. No merge, deployment command, production secret edit, billing activation or provider switch was performed. The existing Cloudflare Workers Builds integration runs independently on feature pushes; its status is separate from GitHub runtime CI and local verification. See VERIFICATION-gemini.md for evidence and rollout limits.
