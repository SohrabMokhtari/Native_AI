# Deployment: no installs for visitors

For the opt-in **v3-only Gemini experiment**, see [browser-oriented activation and rollback](GEMINI_BUILDER.md#browser-oriented-owner-rollout). Keep legacy `AI_PROVIDER=groq` / `AI_MODEL` and all production controls intact. This feature branch does not change `wrangler.jsonc`, secrets, billing or a deployment. Review [current verification](VERIFICATION-gemini.md) before owner-controlled rollout.

The owner configures hosting once. Visitors need only a supported browser, not model downloads, developer tools, or API keys. This update implements Groq support; it does **not** activate hosting or prove a live provider call.

## A. Starter studio on GitHub Pages

In GitHub, open **Settings → Pages**, choose **Deploy from a branch**, branch **main**, folder **/docs**, and save. GitHub reports the website URL after deployment.

Pages serves the static studio only. It cannot run `worker.mjs` or protect a Groq secret. It remains explicitly labeled **starter mode**, not live AI. Never put a provider key in Pages, browser code, or an exported HTML app.

## Groq setup

### 1. Owner account and secret

Create a GroqCloud account and generate an API key in its **API Keys** page. For this free-tier experiment, keep the account on its free plan and review its current model limits. The application does not select a billing plan, detect whether the account is free, or upgrade it. A paid account can incur charges even though the integration has no paid fallback.

Do not paste the key into a GitHub file, issue, chat, browser form, or a shell command argument. Save it directly as an encrypted hosting secret named **GROQ_API_KEY**.

### 2. Host the studio and gateway together

In Cloudflare **Workers & Pages**, create an application, connect GitHub, and select `SohrabMokhtari/Native_AI`. Use the repository root. `wrangler.jsonc` points to `worker.mjs` and the `docs` static assets. There is no frontend build or dependency-install step. The hosting deploy command is `npx wrangler deploy`; it runs on the host, not on the visitor's device.

Deploy initially with the checked-in `PUBLIC_AI_ENABLED=false`. Confirm the studio loads and `/api/config` reports `{"mode":"starter"}`.

### 3. Server configuration

In the Worker's **Settings → Variables and Secrets**, configure these values:

| Name | Type | Value |
| --- | --- | --- |
| `GROQ_API_KEY` | Secret | Your Groq API key |
| `TURNSTILE_SECRET` | Secret | Secret for the hostname-specific Turnstile widget |
| `AI_PROVIDER` | Plain text | `groq` (already the checked-in default) |
| `AI_MODEL` | Plain text | `openai/gpt-oss-120b` (already the checked-in default) |
| `TURNSTILE_SITE_KEY` | Plain text | Public site key for that widget |
| `PUBLIC_AI_ENABLED` | Plain text | `true` only after completing controls below |

Create the Turnstile widget for the deployed hostname. The studio uses the `generate` action; the gateway verifies that action and the exact hostname. No OpenAI account or key is needed for the Groq route: `openai/` in the model ID identifies the model publisher.

Confirm the `GENERATION_LIMITER` and `GLOBAL_LIMITER` bindings are deployed. The config supplies one build/minute per IP and two/minute for the aggregate key, both local to each Cloudflare location. Namespace IDs must be unique in your account. These are approximate per-location limits, **not a worldwide spending cap or token budget**. Groq may reject a request sooner because its token limits are organization-wide.

Review provider usage controls and privacy settings before public exposure. Do not promise unlimited free builds. Only then set `PUBLIC_AI_ENABLED=true` and redeploy. Missing/invalid provider settings, challenge secrets, or limiter bindings keep live inference disabled.

Keep non-secret repo and dashboard settings consistent. A later deploy may reapply `PUBLIC_AI_ENABLED=false` from `wrangler.jsonc`. For persistent enablement, intentionally update that non-secret setting or the deployment configuration after setup; never commit secrets.

### 4. Verify the deployed flow

Open `/api/config`: it should contain `mode: live`, `provider: groq`, `model: openai/gpt-oss-120b`, and the public challenge site key, never provider credentials. This checks configuration presence, not successful inference.

In the studio, complete the challenge and request **“Build a local task board named My Tasks with Task and Status fields.”** After the trial limiter allows another request, ask **“Make it teal.”** Add a fictional record, edit the design, and confirm the record is preserved. Request real cloud logins: the model should honestly report unsupported rather than invent a backend.

Verify exports, a failed challenge, quota errors, and mobile behavior. One successful prompt is not a full production acceptance test. No successful deployment or actual Groq response is claimed in this handoff.

## What happens when Groq cannot respond?

Every build makes at most one provider call. There are no automatic retries, paid upgrades, other-provider fallbacks, or fake starter successes. Provider quota responses return HTTP 429, code `AI_QUOTA_EXCEEDED`, and a bounded `Retry-After` hint. Credential errors require operator attention. Invalid, refused, or truncated results are not applied. Existing workspace data remains in the browser.

Free-tier limits change and are shared by the operator's organization. Consult Groq's account **Limits** page. Prompt/schema/current-design input and completion tokens all affect available capacity. Edge request limits alone cannot guarantee a cost cap. Hosted service costs, if any, are separate from model costs.

## Optional maintainer-only live probe

Normal visitors never need this step. Maintainers with Node 22+ can use the included acceptance script without installing packages. It is dry by default:

```sh
node scripts/check-groq.mjs
```

Copy `.dev.vars.example` to the ignored `.dev.vars` and privately fill `GROQ_API_KEY`. Then run one explicitly authorized fictional probe at a time:

```sh
node --env-file=.dev.vars scripts/check-groq.mjs --live --case=create
node --env-file=.dev.vars scripts/check-groq.mjs --live --case=edit
node --env-file=.dev.vars scripts/check-groq.mjs --live --case=unsupported
```

Each command makes one request and consumes quota. Space them to suit the account token limit; on failure, stop and inspect the sanitized error. This is a direct provider test, not a substitute for hosted Worker, Turnstile, browser persistence, or end-to-end verification. The script prints no keys, prompts, record values, or provider reasoning. CI runs only mocks, never live requests.

## Existing OpenAI installations

Set `AI_PROVIDER=openai`, `AI_MODEL` to an appropriate Responses/structured-output model, and add `OPENAI_API_KEY` as a secret. The gateway never falls back to this route if Groq fails. For older configurations with no `AI_PROVIDER`, an OpenAI-only key preserves the legacy path. Two provider keys without an explicit selection fail closed. New repository deployments explicitly select Groq.

## Generated apps

A standalone HTML file runs the embedded shared runtime in a browser; local-file storage varies by browser. A mobile-ready ZIP requires HTTPS hosting for installation/caching and is not an APK/IPA. Shared links carry design, not synchronized records. One-click hosting of each generated app, production accounts, and native store delivery remain future capabilities.

## Primary references (checked October 16, 2026)

- Groq quickstart and API keys: https://console.groq.com/docs/quickstart
- GPT-OSS-120B: https://console.groq.com/docs/model/openai/gpt-oss-120b
- Strict structured outputs: https://console.groq.com/docs/structured-outputs
- API parameters: https://console.groq.com/docs/api-reference
- Account rate limits: https://console.groq.com/docs/rate-limits
- Provider data handling: https://console.groq.com/docs/your-data
- Cloudflare Git builds: https://developers.cloudflare.com/workers/ci-cd/builds/
- Static assets: https://developers.cloudflare.com/workers/static-assets/
- Encrypted secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Per-location rate-limit semantics: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Turnstile validation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
