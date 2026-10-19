The v3 builder previously embedded Groq transport and required a separate completion turn after validating an app. This adds an opt-in native Gemini adapter behind a provider-independent construction loop, exact bounded dependency inspection, compact repair feedback, and a combined submission operation. Groq remains the configured default; production configuration, legacy routing, runtime and exports are unchanged.

Independent `V3_AI_PROVIDER` / `V3_AI_MODEL` overrides prevent Gemini testing from changing the legacy provider. Gemini uses header authentication, native function declarations/results and private bounded opaque continuation. Both transports use manual redirects, deadlines and response limits, with no automatic retry or fallback. The studio shows the selected provider and Gemini-specific privacy disclosure. Owner setup, current official references and rollback are in `GEMINI_BUILDER.md`.

Validation:

- Baseline commit `16ee5cac4df3dab8b57fa5aac59f9988ad0b6ad3`: 286 tests passed; final suite: 375 passed, none failed/skipped. Syntax checks passed for 38 modules; whitespace checks passed.
- Actual local Chromium navigation/storage: both providers passed draft/Apply/Discard/undo/reload/export/privacy checks. Inference and Turnstile were mocked.
- Actual local workerd through Wrangler 4.151.2: both transports and full gateway routing passed, including continuation and injected failures. Inference and challenge responses were synthetic.
- Identical synthetic Groq edit: 2 → 1 calls, 27,735 → 11,017 request bytes. This measures overhead only, not live token/cost/quality gains.
- Dry-by-default evaluation includes frozen baseline Groq, optimized Groq and optimized Gemini on eight tasks with independent acceptance assertions, failed-attempt accounting and explicit live budgets.

Live model evaluation, actual project access/quotas, deployed Turnstile and deployed end-to-end builds are NOT RUN. There is insufficient evidence to promote Gemini. Test on a separate Worker before any owner-controlled production rollout; unpaid-service data terms require review. No deploy, production secret edit, billing activation or merge was performed. See `VERIFICATION-gemini.md` for evidence and limitations.
