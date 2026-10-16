# Roadmap

## North star

Anyone can describe an app in human language and receive a usable web or mobile app, without coding or installing a development stack. The AI chooses efficient internal representations. Human-readable source is optional when it is a bottleneck; it is not banned as an engineering tool.

## Shipped foundation (v0.2)

Browser studio, typed collection/view models, deterministic shared runtime, six transparent local starters, forms/cards/tables/boards, local records, compatible edits, exports, backup/import, runnable-design links, optional protected hosted-AI adapter, no frontend dependencies.

## Next release gates

1. Activate actual hosting, configure a real model privately, and verify full prompt → app → edit → export behavior. Measure failures; do not substitute mocks for live evidence.
2. Run direct-navigation browser acceptance tests, actual browser persistence/reload, backup restore, and HTML file opening. Validate mobile Safari/Chrome, PWA icons, installation, service-worker cache updates, and offline operation.
3. Add generated-app publishing to actual hosted URLs with clear ownership. Exports currently require a user/host upload; the platform does not perform that publication.
4. Add production identity, per-user workspaces, shared storage, authorization, cloud sync, enforced quotas, audit and rollback. These are needed for public multi-user apps.
5. Extend the typed operation graph for conditional behavior, formulas, integrations, background jobs, and custom workflows. Add verification and capability boundaries before expanding expressiveness.
6. Offer optional native Android/iOS delivery through operator-side build/signing infrastructure. End users should not need Xcode/Android tooling; signing, accounts, reviews, and store policies do not disappear.
7. Benchmark against conventional code generation fairly; consider learned reusable operations and specialized model interfaces only when measurements justify them.

Do not claim universal app construction, native app-store delivery, zero infrastructure cost, or improved AI efficiency until those capabilities are implemented and independently tested.
