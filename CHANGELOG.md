# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and Semantic Versioning.

## [Unreleased]

## [0.1.0-alpha.4] - 2026-08-12

### Changed

- Split untrusted provider coaching from trusted LapSignal output, with request-scoped evidence enums and deterministic enrichment for location, metric context, confidence, and expected gain.
- Hardened the language boundary so unsupported numerical, location, unit, identity, and internal-ID claims are rejected before display.
- Separated provider transport, structured-output, grounded-acceptance, and safe-fallback verification states.
- Added an API/web-only managed start mode that leaves the collector stopped while preserving PID and build-identity verification.
- Extended the native collector replay path to accept ignored `.lsraw` captures, parse them through the F1 2021 adapter, drain normal API delivery, and request deterministic session finalization only after successful delivery.
- Persisted the complete pace, consistency, braking, throttle, steering, and stint analysis contract for finalized live sessions, and made their stored lap traces available to the comparison workspace after restart.
- Made desktop/mobile browser acceptance deterministic on Windows by serializing Playwright projects, creating a sanitized synthetic local session instead of depending on an operator database, and scoping duplicate status assertions.
- Separated circuit geometry from marker positioning so complete F1 2021 maps load by numeric track ID before calibration, while accepted world transforms remain optional precision upgrades.
- Made circuit maps beginner-first: matching seeds render before a valid lap, invalid and incomplete attempts refine geometry per sample, and invalid attempts remain coachable while official timing stays clean-only.
- Replaced the landing page's fictional circuit outline with attributed, normalized Spa-Francorchamps, Red Bull Ring, and Monza centerlines while preserving the telemetry-marker animation and reduced-motion fallback.

### Added

- Verified the pinned OpenAI route through OpenRouter exactly once with synthetic Silverstone evidence: HTTP 200, exact `openai/gpt-5-mini` identity, strict structured output, usage, and a safely rejected factual claim followed by deterministic fallback.
- Added adversarial AI coverage for evidence-scoped schemas, all coaching categories, hallucinated factual text, transport/status failures, refusal, truncation, model mismatch, missing usage, and diagnostic survival after evidence rejection.
- Added desktop/mobile browser fixtures for accepted AI output, rejected-provider fallback, disabled consent/Cloud AI, unavailable coaching service, and saved local-session navigation without provider calls.
- Completed an offline acceptance replay from an existing ignored physical capture: 5,390 samples parsed with zero rejections, one session finalized with three laps, invalid laps remained coachable but timing-clean, rule-based coaching stayed operational, comparison traces survived restart, and the source capture hash remained unchanged.
- Added the complete 24-track F1 2021 full-circuit map pack: eight existing telemetry seeds plus sixteen pinned, attributed, locally packaged static centrelines with deterministic manifest validation and contact-sheet QA.
- Added eight privacy-sanitized F1 2021 circuit seeds, bounded progressive multi-session calibration, map management/reset controls, and deterministic calibration list/validate/promote commands.
- Verified Windows development service management through `dev:status`, `dev:stop`, and `dev:clean-start`, with project PID manifests, guarded shutdown, duplicate detection, current-build health gates, and API/web/collector build identity.
- Fail-before-network Cloud-AI preflight coverage for version, schema, guard, consent, enabled state, provider configuration, and explicit direct-versus-Azure token parameters.
- LapSignal monorepo foundation and independently versioned contracts.
- Three fixed-seed sessions, 42 laps, 7,560 telemetry samples, Parquet artifacts, and a normalized replay fixture.
- FastAPI/SQLite metadata service, deterministic analytics, evidence findings, bounded live ingestion, and WebSocket stream.
- Native Node F1 2021 UDP parser/listener, capture recording, bounded retry delivery, diagnostics, and replay CLI.
- Rule-based coach, optional one-agent SDK path, twelve-topic original knowledge base, provenance, and twelve evaluation scenarios.
- Premium responsive Next.js application with all marketing, product, comparison, report, onboarding, and settings routes.
- Windows/PS4, protocol, privacy, security, deployment, evaluation, and architecture documentation.
- Credential-free Windows CI, 50 unit/API/evaluation tests, and eight desktop/mobile Playwright flows.

### Fixed

- Preserved sanitized provider/model, identifiers, finish state, token usage, reported cost, latency, and both schema hashes when downstream evidence validation rejects otherwise valid structured output.
- Prevented provider-authored locations and expected gains from entering trusted UI results and kept nullable deterministic confidence render-safe.

## [0.1.0-alpha.3] - 2026-08-10

### Changed

- Rebuilt the public landing page around the "Every lap has a signal." sim-racing identity while preserving every internal product route and workflow.
- Reduced the landing narrative to five sections and 302 authored words, with a racing-first hero, a seed-grounded debrief composition, a four-step engineering loop, equipment-aware context, and a focused final call to action.
- Added original unbranded sim-racing imagery, structural carbon-fiber surfaces, code-native illustrative circuit layouts, an animated position marker, and reduced-motion fallbacks.
- Updated the 1200x630 social preview, metadata, responsive imagery, and asset provenance documentation.
- Added landing acceptance coverage for the five-section and 300–400-word contracts, local anchors, primary demo navigation, reduced motion, and 1440, 1280, 390, 768, and 360 responsive views.

### Fixed

- Prevented below-the-fold landing imagery from appearing blank in full-page mobile rendering while keeping the assets compact and responsive.

## [0.1.0-alpha.2] - 2026-08-10

### Changed

- Rebuilt the marketing and product experience around a graphite/crimson pit-wall design system with Manrope, Barlow Condensed, Geist Mono, compact timing rails, sector dividers, status lamps, and a new code-native LapSignal line mark.
- Reframed the landing page as a seeded Silverstone post-stint debrief with stored lap, sector, stint, confidence, hardware, workflow, and compatibility evidence.
- Applied the system across overview, live, sessions, session detail, comparison, debrief, progress, settings, onboarding, report, loading, error, empty, and responsive navigation states.
- Switched session and comparison telemetry views to the API's recorded, downsampled traces with deterministic fallback and a functional chart-reset control.
- Replaced fabricated cross-track progress claims with a context-separated evidence archive built only from seeded metrics.
- Refreshed the favicon, metadata, and 1200x630 Open Graph card; added 1280, 768, 390, and 360 responsive/overflow coverage.

### Fixed

- Removed generic AI/SaaS visual cues and unsupported landing/comparison metrics while preserving all collector, analytics, replay, consent, export, and data-control behavior.

## [0.1.0-alpha.1] - 2026-08-09

### Added

- Initial alpha version and build metadata.
