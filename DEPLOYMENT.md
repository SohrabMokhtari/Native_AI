# Deployment: no installs for visitors

There are two routes. The owner configures hosting once. Visitors need only a supported browser. Neither route was activated during this implementation.

## A. Publish the starter studio with GitHub Pages

In this repository's browser UI, open **Settings → Pages**. Select **Deploy from a branch**, branch **main**, folder **/docs**, and save. GitHub will report the actual site URL once published. Do not treat the expected URL as live until GitHub confirms deployment.

The `docs` directory is already static, with `.nojekyll`. There is no package installation or build command. Pages cannot run `worker.mjs`; this route serves **starter mode**, not live hosted AI. Do not place a provider key in Pages, client code, repository variables consumed into client assets, or a public configuration file.

## B. Publish the full studio and AI gateway from the Cloudflare dashboard

The code is designed for Cloudflare Workers with Static Assets. No local CLI is necessary when using Git integration.

1. In Cloudflare **Workers & Pages**, create an application, connect GitHub, and select `SohrabMokhtari/Native_AI`. Use the repository root; the included `wrangler.jsonc` points static assets to `docs` and the worker to `worker.mjs`. No frontend build command is needed. The hosted deploy command is `npx wrangler deploy`; that tooling runs on the host, not the visitor's computer.
2. Deploy with `PUBLIC_AI_ENABLED=false`. Confirm the static studio loads and `/api/config` reports starter mode.
3. In the worker's server-side configuration, add secrets **OPENAI_API_KEY** and **TURNSTILE_SECRET**. Never commit them. Set non-secret values **AI_MODEL** to an available model supporting the Responses API and Structured Outputs, and **TURNSTILE_SITE_KEY** to the public key for a Turnstile widget authorized for the deployed hostname. The UI uses the `generate` action and the worker verifies that action and the exact hostname.
4. Confirm **GENERATION_LIMITER** and **GLOBAL_LIMITER** bindings exist. The configuration supplies 5 requests/minute per IP and 25 requests/minute per Cloudflare location for the aggregate key. Namespace IDs must be unique within the operator account; change the provided IDs if already used. These approximate limits are NOT a global hard spending cap.
5. Set provider-side usage restrictions/alerts and an acceptable spending policy before public exposure. Only then set **PUBLIC_AI_ENABLED=true**. Keep the repository and dashboard variable settings consistent: a later deploy can reapply the false default from the checked-in configuration. Configure persistent build variables in Cloudflare or update the non-secret repository configuration intentionally.
6. Test a real prompt, unsupported request, invalid challenge, burst limit, edit preserving records, mobile browser, exported file, and backup restore. Confirm no secret appears in responses or browser assets. Monitor errors and abuse before advertising general availability.

A missing secret, model, challenge key, or rate-limit binding leaves AI unavailable. The app never silently switches a failed live build to a template and calls it AI success. Real provider integration and Cloudflare deployment remain unverified in this handoff.

## Generated apps

- **HTML file:** a self-contained local web app. No backend or external runtime download; browser JavaScript must be enabled. Local file persistence is browser-dependent.
- **Web ZIP:** upload the contained files together to a static HTTPS host. Home-screen installation and service-worker caching are browser/device-dependent; included SVG icons may require PNG alternatives on some devices. Do not promise App Store or Play Store delivery.
- **Share link:** valid only on an active hosted studio. App structure is in the fragment; records are excluded and never synchronized across recipients.

One-click publishing of generated apps to their own hosted URLs is a roadmap item, not implemented by the ZIP download.

## Primary references

- GitHub Pages static hosting: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- GitHub Pages setup: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- Cloudflare Git builds: https://developers.cloudflare.com/workers/ci-cd/builds/
- Static assets: https://developers.cloudflare.com/workers/static-assets/
- Secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Rate-limit semantics: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Turnstile validation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Structured model outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- PWA installation requirements: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
