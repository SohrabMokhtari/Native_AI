# Architecture

## Product contract

A person describes desired behavior, receives a working supported app, and changes it through conversation. They do not write code, choose a framework, install dependencies, or provide a model API key. Source readability must not constrain the internal representation when another representation measurably works better.

## Current execution path

`Natural-language request → starter interpreter or hosted AI → validated app model → compatibility check → saved workspace → shared browser runtime`

The artifact is a bounded typed collection/view structure (`native-ai/1`). JSON is its current transport, not a claim that JSON is optimal or a new machine-native language. Record creation, editing, deletion, boolean toggles, filtering, and rendering are existing runtime operations. The model selects and connects supported capabilities; it cannot supply executable source.

The representation currently exposes fewer explicit action nodes than the earlier local Intent Native experiment: CRUD behavior is intrinsic to a collection. This version is a browser-first successor, not a migration of the old Node/SQLite multi-actor runtime. Those server-side access-control tests do not apply to this local-only architecture.

## Source code still exists

The common runtime, validator, studio, and gateway are maintained using conventional source code. Exporting an app embeds the *same* renderer function and styles with a validated app model. It does not ask a second model to generate JavaScript behind the scenes. Extending the runtime for new capabilities still requires engineering. There is no general-purpose computation graph, bytecode optimizer, or custom model training in v0.2.

## Data and design changes

The studio stores one workspace (model, local records, last ten design versions) in one localStorage value. A candidate model is validated before use. On edits, IDs must remain stable; populated fields cannot be deleted or have types changed. Existing records are revalidated against the candidate. Adding a required field to populated data is blocked unless existing data already satisfies it. There is no automatic destructive migration.

A storage error rejects the save before the current in-memory state is replaced. Corrupt saved workspaces are not automatically overwritten. Design undo is subject to the same compatibility checks and may be refused rather than lose records. Cross-tab editing, concurrent clients, conflict resolution, transactions spanning cloud services, and shared authorization are not implemented. Use one studio tab per workspace for now.

## Hosted AI boundary

The browser sends only prompt, current design, and challenge token. The gateway uses a server-held key, a fixed provider endpoint, bounded input/output, exact-origin check, edge-IP and aggregate rate-limit bindings, and verified Turnstile hostname/action. A structured response is independently validated. Unsupported, failed, incomplete, and malformed responses are not applied. The server-only `ai/provider.mjs` supports Groq Chat Completions (the default `openai/gpt-oss-120b`) and the existing OpenAI Responses route. Adapters were exercised with mocks only; real inference remains unverified.

The browser performs the populated-data compatibility check because the gateway never receives those records. Client-side checks protect a user's local workspace from accidental loss; they are not a server authorization system. No upstream error bodies or provider keys are returned. The OpenAI route requests `store:false`; Groq does not receive that unsupported parameter. Neither is a blanket claim about provider retention. Review the chosen provider's current privacy settings.

The Groq payload uses strict JSON Schema, non-streaming output, low reasoning effort and at most 4,096 completion tokens. The full provider response is bounded to 256 KiB before parsing. A truncated completion, refusal, invalid model, or incompatible ID/type/select-choice edit is rejected. Each build makes at most one model call, with a 50-second deadline and no automatic retry or cross-provider fallback. Provider 429 responses map to an explicit quota error with a bounded Retry-After header.

`AI_PROVIDER` explicitly selects a provider. For older deployments without that variable, an OpenAI-only secret preserves the old path; a Groq-only secret selects Groq. Two secrets without an explicit selection fail closed. `/api/config` publishes only mode, public challenge key, provider and model, not credentials. A live config means settings are present, not that provider connectivity has been verified.

## Export and delivery

HTML embeds the shared runtime plus the model and no records. ZIP adds a manifest, icon, service worker, and limitations/readme. The small ZIP writer uses standard uncompressed entries and CRC32; it is packaging, not an AI app compiler. Runnable links carry only design in a URL fragment. All recipients have local, independent data.

A model is not a production app deployment. Native signing, store submission, cloud persistence, account isolation, billing, collaboration, and hosted generated-app URLs are future services.

## Evaluation

We need multiple held-out tasks, the same model and reusable component library on both sides, independent acceptance tests, and total cost/time including repairs and engine development. Comparing this reusable runtime against handwritten boilerplate alone would confound reuse with representation. No efficiency win is claimed yet.
