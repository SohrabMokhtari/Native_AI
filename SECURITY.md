# Security and privacy

This is a local-first public prototype, not a security-reviewed production platform.

## Supported boundary

The app model permits known fields, finite enums, bounded text, and valid collection/field references. Unknown properties and executable-source fields are rejected. Rendering uses textContent, not model HTML. Exported inline JSON escapes `<` and Unicode line separators. Shared links are validated before use. The runtime never executes model-generated scripts or makes model-directed network calls.

The optional AI gateway keeps credentials server-side, requires same-origin JSON requests, bounds the streamed body, limits input/output size, verifies challenge hostname/action, uses two edge rate limiters, handles provider failures without returning raw upstream errors, and defaults to disabled. This is abuse mitigation, not proof against determined abuse or a precise global cost cap.

## Provider and quota controls

Groq is selected by the checked-in configuration but public inference remains disabled until the owner adds server-side secrets and explicitly enables it. `GROQ_API_KEY` must never appear in browser assets. Only fixed allowlisted provider endpoints are used; redirects are rejected. Responses are size-bounded and independently checked, including refusal/truncation and ID/type/select-choice preservation. No model tool calls execute.

Each build issues at most one model request. Quota and credential errors return sanitized messages; no raw provider errors or reasoning are exposed. There is no automatic retry, fallback to another provider, or programmatic billing upgrade. This does not prevent charges on a provider account that the owner has already configured as paid. Keep the account on its intended plan and use its account-level spending controls.

The checked-in edge limits are deliberately conservative for a small trial: one build/minute per IP and two/minute for the aggregate key, both local to each Cloudflare location. They are approximate abuse mitigation, not a global quota ledger or guaranteed alignment with Groq token limits. Larger designs can exhaust the provider token quota first.

`ai/` and `scripts/` are server/maintainer-only and outside the hosted `docs/` assets. The optional live probe requires an explicit `--live` flag and an environment secret; automated CI never calls an LLM.

## What is NOT secured

- Browser localStorage is not encrypted and is accessible to the browser profile and same-origin code. Do not store sensitive medical, financial, identity, or authentication data in this prototype.
- There are no real user accounts, login sessions, multi-tenant authorization, cloud database, team permissions, or shared-record security. A hidden control is not an access boundary.
- The service-worker bundle and PWA installation have not been validated on real devices. The cached assets are app structure, not an encrypted store.
- Backups contain record values. Export/download them only to a location you control. Regular app exports and share links omit records, but the design itself may still be sensitive.
- Prompts and app metadata go to the AI provider in live mode. Do not put secrets in prompts, app descriptions, field labels, or select options. Turnstile processes anti-abuse data. Review operator and provider privacy practices before public launch.
- Approximate edge rate limits are not global accounting. Provider spending limits, monitoring, additional authentication or quotas, and a security review are prerequisites for larger-scale public service.

Never commit `.env`, `.dev.vars`, credentials, runtime databases, personal backups, or real customer data. The repository includes only fictional test fixtures and source/evidence files. Report a vulnerability privately to the repository owner; do not put secrets into a public issue.
