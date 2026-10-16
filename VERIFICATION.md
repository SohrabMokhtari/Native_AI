# Verification — Native AI v0.2

## Executed

- **74/74 Node automated tests passed.** Starter/model constraints, input data, migrations, export escaping, ZIP structure, provider schema, mocked gateway security/error paths.
- **25/25 restricted-environment DOM/packaging checks passed.** Studio rendering, plain-language starter, record creation/edit/delete, search, board grouping, rename/theme/optional field edits preserving data, unsupported-request refusal, mobile preview, 390px viewport overflow check, restoration through a memory storage adapter, export runtime with network calls disabled, ZIP CRC verification with an independent ZIP reader.
- JavaScript modules passed `node --check`.
- Desktop/mobile screenshots were visually inspected in the development session.

The earlier Intent Native v0.1 test counts are not reused as evidence for this implementation.

## Important test limitation

Managed Chromium returned `ERR_BLOCKED_BY_ADMINISTRATOR` for direct local HTTP navigation. The policy was **not** altered. `tests/render_check.py` instead injected locally available app assets into a blank page and used a clearly isolated test-only in-memory localStorage adapter. Exported runtime rendering was checked the same way with network calls unavailable.

These results are **not** proof of real browser localStorage durability, page-reload behavior, direct `file://` opening, actual browser downloads, service-worker installation, or deployed HTTP end-to-end behavior. `tests/browser.py` contains direct-navigation checks for an unrestricted machine; that full suite did not run here.

## Not executed or not implemented

Real model credentials/calls; actual Cloudflare Worker and Turnstile deployment; GitHub Pages activation; Safari/iOS/Android device tests; production identity and authorization; cross-device records; native APK/IPA generation; store publishing; hosted URLs for exported apps; independent security audit; fair efficiency benchmark against source-code generation.

Screenshots and sample exports are handoff artifacts. The committed `evidence/browser-results.json` records the restricted test method and checks; `evidence/test-summary.json` records the Node result and the hash of the full TAP log supplied in the downloadable archive. Fixtures are fictional, not user data.
