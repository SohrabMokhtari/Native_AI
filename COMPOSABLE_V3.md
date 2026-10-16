# Native AI / Composable Lab

## What changed

The new `native-ai/3` artifact is an executable program, not a request to generate per-app source files. It combines a component tree, typed persistent state, pure expression functions, local collections and event-driven action sequences. The shared kernel interprets the program; the same renderer is used in the lab and exported apps.

This is a more expressive browser-app runtime, not an unrestricted software factory. Human-readable JSON is currently the transport and inspectable serialization; no efficiency superiority over source generation is claimed. The common engine and construction tools remain conventional maintained software.

### Implemented

- Nested stacks, rows, responsive grids, cards, headings, text, badges, buttons, inputs, selects, toggles, stats, progress bars, repeated components, dividers and collection components.
- Light/dark appearance, custom hex accent, compact/comfortable density, font family, font sizes, spacing, grid columns, radius, top/sidebar navigation and content width.
- Typed state; arithmetic and comparison; lazy conditions; text composition; bounded filtering/mapping and iteration; reusable functions; dynamic list/object composition; local record creation/update/deletion; navigation and atomic action batches.
- Explicit aggregate expressions rather than automatically summing the first numeric field. Conditional collection filtering and highlighting.
- Browser-local persistence, storage-error rollback, stable-ID draft edits, revision checks, compatible design undo, transcript restoration and explicit draft approval.
- A Groq local-tool construction loop with inspect/edit/test/finish/unsupported tools. Edits automatically run validation, interpreter tests and text-only expression preflight; an invalid draft can be repaired within the same bounded build session.
- Standalone HTML exports with the same interpreter and renderer. Exports contain the program and its design constants, not the user's saved records or runtime snapshot. They do not call an LLM during ordinary app use.

### Explicitly not implemented

Arbitrary external network/device capabilities, authentication, multi-user cloud data, native APK/IPA output, app-store publishing, calendar/chart/media primitives, WebAssembly extensions, unbounded loops or recursive functions, hosted browser automation, image-based visual review, model retraining, arbitrary source/script execution and automatic hosting of exported apps. These require further work, not different wording in a prompt.

## Coexistence and safe rollout

The original `worker.mjs`, its provider adapter, the old studio files and old exported app format are unchanged. `worker-v3.mjs` routes `/api/v3/*` to the new handler and delegates every other request to the existing handler. The deployment configuration selects that wrapper. The lab lives at `/v3/index.html` (the host may normalize this to `/v3/`).

**New inference is off by default.** The branch sets `COMPOSABLE_AI_ENABLED=false`. This does not change the owner's existing `PUBLIC_AI_ENABLED=true`, Groq model, public site key, rate limits or secret bindings. No production merge, cloud secret change or paid-plan change is part of the development handoff.

After reviewing and merging the feature branch:

1. Wait for the Cloudflare deployment of the merged commit.
2. Visit `https://YOUR-WORKER.workers.dev/v3/index.html`. Authored dashboard and quiz examples work without model calls. They are explicitly labeled authored examples, not generated results.
3. Use **Copy original workspace** on the same deployed origin, or import the original builder's `.native.json` backup. The original `native-ai-workspace-v2` storage entry is never modified. The lab writes `native-ai-workspace-v3`. Export a backup first as a precaution.
4. To try real construction, intentionally change only `COMPOSABLE_AI_ENABLED` to `"true"` in `wrangler.jsonc`, commit and deploy. The existing encrypted `GROQ_API_KEY` and `TURNSTILE_SECRET` are reused. Never put secrets into this file.
5. `/api/v3/config` should report `mode: live`. This proves configuration presence, not inference quality. Complete Turnstile on the lab page and submit one small request. Review the draft before **Apply draft**.

Rollback: set `COMPOSABLE_AI_ENABLED=false` to stop new model construction. The original builder remains available. To remove the new routing entirely, restore the deployment `main` value to `worker.mjs`. No data migration is required for rollback because the workspaces are separate.

## First live acceptance sequence

Copy the existing planner into the lab and request:

> Switch to a compact dark dashboard with sidebar navigation. Keep my records. Show a completion percentage, highlight overdue unfinished tasks and add a Focus page that excludes completed tasks.

Begin with a smaller change if free-tier token capacity is insufficient. The current model call has finite output size and can fail on very large programs.

Check the draft's actual appearance and behavior. Apply it, edit a task, navigate to Focus and reload. Download a standalone HTML app and test it outside the studio. This sequence must be run on a real deployed browser before calling the new flow end-to-end verified.

For a different kind of app, use New app after backing up the planner and request a small quiz with scoring and restart. This is not preselected by the server: the model must construct the program through the tools. The separate authored quiz fixture is a runtime demonstration and test target, not evidence of live model generation.

## Model budget and privacy

A public request permits at most 3 model calls (operator may reduce `V3_MAX_CALLS` to 2), 8,192 completion-token allowance across the loop, 55 seconds inside the construction agent, 30 seconds for a single provider attempt and 220 KB cumulative serialized input. The byte cap is not an exact input-token estimate. The challenge check has a separate 10-second deadline. No provider error is automatically retried and no other provider or paid tier is selected as fallback. Validation repairs are additional authorized tool turns within the request budget.

Quota is shared with the original builder. One lab build can consume multiple inference requests, unlike the original one-call builder. The existing per-location Cloudflare request limit is not a worldwide token or spending cap. Free-tier availability can reject a request before the app's own limits. Check the account's actual provider and hosting billing settings.

The model receives the user prompt, current program and at most eight recent conversation messages. It does not receive saved records or the running state snapshot. Programs can themselves contain design constants, including quiz questions; prompts, labels and constants must not contain secrets. Conversation history is stored locally (last 24 messages) and is not encrypted by the application.

## Representation and execution

`docs/v3/kernel.mjs` is the authority. `ai/composable-spec.mjs` documents the construction vocabulary supplied to the model. Programs contain:

- `design`, `pages` and nested UI nodes;
- `collections` with typed fields;
- `state` declarations with typed initial values;
- pure `functions` whose bodies are prefix expression trees;
- `actions` whose steps are a small allowlisted instruction set;
- supplied fictional `tests`.

The prefix expressions and step objects are interpreted directly. Model output is never given to `eval`, a Function constructor, a shell, browser markup parsing or a general script executor. The HTML export embeds the shared implementation using the same factories for every program; it does not create unique per-app source logic.

Type declarations are checked at initialization and execution, with structural/reference validation before application. This is not a complete static type inference system. A model can still choose incorrect behavior; runtime error handling and independent tests matter.

Actions apply to a copy of the snapshot. The commit callback must successfully persist it before the in-memory machine accepts it. A failure rolls the whole action back. Existing collection IDs, field IDs/types/choices and state IDs/types are preserved on model edits. New required fields that are incompatible with existing rows block application. Changing a state's initial value does not reset its already-saved value. Deleting local records through a declared custom action asks for confirmation in the renderer.

Bounds: 160 KB program; 2 MB snapshot (the snapshot bound is a serialized-character guard, not a byte-perfect storage quota); 240 UI nodes; 3,200 expression nodes; 30,000 weighted interpreter steps per dispatch/render scope; 1,000 records per collection; finite depths and 16 supplied tests. This is defense in depth, not a formal sandbox proof or security audit. Browser render and storage resource limits still apply.

## Testing

`node --test tests/*.test.mjs` runs without package installation. New tests cover validation, expression evaluation, transactions, budgets, data-safe migration, export safety, mocked provider tool flows/repairs, provider failures, quotas and the existing security boundary.

Optional maintainer browser suites require Playwright and Chromium in the test environment; end users do not install either:

- `tests/v3-browser.py`: direct navigation, real browser persistence, downloads and interaction checks for an unrestricted environment.
- `tests/v3-dom.py`: clearly labeled local-DOM fallback with isolated fake storage when navigation is blocked.
- `tests/v3-draft-dom.py`: draft staging/application and no-record-transmission checks with a fake hosted provider and widget.

See `VERIFICATION-v3.md` for what actually ran. The model's own supplied tests are not independent acceptance tests. An app with zero supplied tests is explicitly warned about. The server cannot inspect screenshots; preflight evaluates expressions and test fixtures, not visual quality.

## Development checkpoints

Next work: real Groq acceptance on held-out prompts; actual browser/mobile persistence and exported-file checks; visibility into inference tokens/latency; richer diagnostics; explicit test expectations independent of the builder model; shared component definitions and safe capability extensions; eventual authenticated multi-user backends and mobile packaging. Measure total time/cost including repairs before claiming this representation is better than code generation.

Primary integration references checked October 16, 2026:

- https://console.groq.com/docs/tool-use/overview
- https://console.groq.com/docs/structured-outputs (do not combine strict structured output with tool mode)
- https://developers.cloudflare.com/workers/runtime-apis/request/
