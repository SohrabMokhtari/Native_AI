# Native AI

Experimental v3 update: optional Gemini transport, a provider-independent construction loop, bounded structure inspection and combined submission. Groq remains the configured default. See [Gemini builder setup and evaluation](GEMINI_BUILDER.md) and [current verification](VERIFICATION-gemini.md). One owner-run live Gemini creation evaluation and a manual theme-edit/Apply/reload/export smoke test on a separate deployed test Worker passed. A matched provider comparison has not run.

**An idea in. An app out.** Describe an application in ordinary language, try it in the browser, refine it, and take the working app with you.

The goal is **zero coding and zero developer-tool installation for the person building an app**. Human-readable source code is optional as an intermediate representation, not forbidden. The shared engine is currently JavaScript; each supported app is a validated executable structure rather than a separately generated codebase.

## What exists today — v0.2.1 public prototype

A browser-first studio with responsive desktop/mobile previews, local records, validated design changes, and portable exports. No frontend dependencies, package installation, build step, Python server, Node server, or user API key is required to use a **hosted** studio.

**This is not yet an arbitrary-app production platform.** It does not generate native Android/iOS binaries, real logins, multi-user backends, payments, or cloud synchronization.

| Mode | What actually happens |
| --- | --- |
| Starter mode (default) | A transparent, deterministic matcher builds six supported app types and a few edits. No LLM calls, no AI bill, no claim of understanding every detail. |
| Hosted AI (operator configured) | A server-side model interprets broader requests into the same validated app representation. Visitors never supply API keys. The engine's capability limits still apply. |

Supported primitives: collections, typed fields, cards, tables, boards, forms, search, record creation/edit/deletion, boolean toggles, and numeric totals. Starter examples: tasks, reading lists, expenses, habits, inventory, and notes.

### Use it without installing anything

The repository is the source, not automatically a live website. The owner must activate hosting once; see [DEPLOYMENT.md](DEPLOYMENT.md).

On a hosted copy:

1. Describe an app, or choose a starter.
2. Try the preview and refine it in the conversation panel.
3. Choose **Get app** and download a standalone web app, mobile-ready web package, or private workspace backup.

A standalone export is one HTML file with its shared runtime embedded. Open it in a browser; no packages or developer tools. Local-file storage behavior varies by browser. A mobile-ready package adds a manifest and service worker for HTTPS hosting. It is a web app, **not** an APK or IPA, and mobile installation support must be tested on target devices.

Runnable links contain the app design in a URL fragment, not records. Recipients get separate local data; a shared link is not a shared database. Anyone with the link can inspect its design.

## Public AI without asking visitors for keys

**Default: Groq with `openai/gpt-oss-120b`.** The server-only adapter requests strict JSON-schema output and validates the result independently. Set `GROQ_API_KEY` as a hosting secret, not in this repository or the browser. The checked-in configuration selects Groq but leaves `PUBLIC_AI_ENABLED=false` until the owner completes setup. See [DEPLOYMENT.md](DEPLOYMENT.md#groq-setup).

There are no automatic retries, provider fallbacks, or paid-plan upgrades. Quota failures are reported without changing the app. Free usage depends on the operator account and current provider limits; the app cannot determine or guarantee that an account is on a free plan. The existing OpenAI adapter remains an explicitly configurable alternative, not a fallback.

Deploy the included Cloudflare Worker with static assets. Configure a model, server-held provider secret, Turnstile, and rate-limit bindings, then explicitly enable public AI. It fails closed if these requirements are missing. Until that deployment is configured, the website remains an honestly labeled starter builder.

There is no magic removal of infrastructure: hosted AI has an operator cost; shared databases and native signing/build services would be additional capabilities. These should be hidden from the end user's workflow, not misrepresented as nonexistent. **Zero installs does not mean zero hosting or inference costs.**

## Data and safety

Records live in this browser, are not encrypted by this app, and are not sent to the model. App names, field labels, descriptions, and prompts *are* sent in live mode. Do not put secrets into them. Backups explicitly include records; regular app exports exclude them. Clearing browser data loses local records. There is no account security or authorization boundary on a shared device.

The runtime uses allowlisted operations and text rendering, not `eval`, generated executable scripts, or model-provided HTML. Incompatible design changes are rejected rather than silently dropping populated fields. See [SECURITY.md](SECURITY.md).

## Verification

150 Node tests pass after the Groq integration (74 existing plus 76 new checks). The 25 restricted-environment DOM/packaging checks were run for v0.2, not rerun for this provider update. Direct navigation was blocked by managed browser policy; DOM tests used a test-only memory storage adapter. Actual live model calls, real browser storage/reload, deployed service-worker behavior, mobile installation, and cloud deployment are **not yet verified**. See [VERIFICATION.md](VERIFICATION.md).

For maintainers only, Node 22+ can run `node --test tests/*.test.mjs` with no package installation. Optional browser tests require Playwright in the test environment, not in the product. A direct-navigation acceptance suite is included for an unrestricted test machine.

## Repository map

- `docs/`: deployable browser studio, model validator, shared renderer, export packaging, and runnable-link viewer.
- `worker.mjs`, `ai/provider.mjs`, `wrangler.jsonc`: protected same-origin gateway, server-only Groq/OpenAI adapters, and cloud configuration.
- `scripts/check-groq.mjs`: opt-in maintainer acceptance probe; no API calls unless `--live` is supplied.
- `tests/`: model, migration, export, gateway, and browser checks.
- [ARCHITECTURE.md](ARCHITECTURE.md): representation and execution boundaries.
- [ROADMAP.md](ROADMAP.md): path toward broader app construction and native delivery.
- [DEPLOYMENT.md](DEPLOYMENT.md): browser-only owner setup.

MIT licensed; the repository's existing license is preserved. Contributions should improve measured correctness and time-to-working-app, not merely introduce a new syntax. Superiority over conventional code generation has not been established.
