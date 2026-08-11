# LapSignal alpha.4 engineering handoff

## Current identity

- Release: `v0.1.0-alpha.4 · build 4`.
- AI contract: `race-engineer-v3`; base schema `1f7791fed1421e1d0810f9155a273a8807980145649caf89deb3494e3bd3f715`; diagnostics contract `3`.
- Cloud coach: **Transport and strict structured output verified once with a synthetic fixture; grounded provider output was rejected safely.**
- Deterministic coach: dependable product path and verified fallback.
- Cloud AI and consent: disabled after verification.
- Physical F1 2021 telemetry: separately verified; it is not evidence of cloud-coach grounding.

## AI milestone result

One and only one alpha.4 OpenRouter generation was made on 2026-08-12. It used synthetic Silverstone evidence, `openai/gpt-5-mini`, the pinned OpenAI provider route, strict request-scoped JSON Schema, `max_tokens: 1500`, no streaming, no tools, no provider fallback, `data_collection: deny`, and zero SDK/application retries.

The response returned HTTP 200, the exact model, `finish_reason=stop`, valid strict JSON, and complete usage. Pydantic validation passed; LapSignal then rejected an unsupported factual phrase and displayed three deterministic actions. Reported usage was 857 input, 490 output, 128 reasoning, and 1,347 total tokens at `$0.00119425`. No generation metadata lookup or second request was made.

Verification states:

- `provider_transport_verified: true`
- `structured_output_verified: true`
- `grounded_output_accepted: false`
- `safe_fallback_verified: true`

The rejected provider text was not persisted. Sanitized usage, latency, provider/model, separate request identifiers, schema hashes, validation states, and safe-fallback state were persisted. The AI verification loop is closed; do not schedule another paid attempt for this milestone.

## Contract and privacy boundary

The provider may return only controlled category/priority values, exact request-enumerated evidence IDs, and bounded coaching language. LapSignal deterministically owns location, sector/lap/sample context, metrics, units, confidence, and expected gain. Provider text with numbers, locations, units, internal IDs, or other unsupported factual claims is rejected.

The provider bundle uses opaque request-local evidence IDs and excludes session, track, car, participant, path, network, secret, and raw-sample identity. `.env`, captures, databases, telemetry recordings, logs, PID files, caches, QA artifacts, provider bodies, and rejected model text remain outside Git.

## Local development services

- `pnpm dev:app-start` safely starts and verifies the API and web app while leaving the collector stopped.
- `pnpm dev:clean-start` safely starts and verifies API, web, and collector.
- `pnpm dev:status` reports manifest-backed ownership.
- `pnpm dev:stop` stops only verified LapSignal processes.
- `pnpm collector:listen` starts the collector later for PS4 use.

The API health response contains safe version/build, commit, PID/start time, provider/configuration, Cloud-AI state, guard state, schema hash, and diagnostics-contract identity. The web and collector expose corresponding safe build identities.

## Product state carried into alpha.4

- Physical-session detail, comparison, and deterministic debrief survive restart and remain collector-independent.
- The complete 24-track F1 2021 circuit-map pack remains available locally.
- Saved invalid laps stay coachable while official timing uses clean laps only.
- Desktop/mobile browser coverage includes demo coach, saved local-session coach, accepted AI fixture, rejected-provider fallback fixture, disabled consent/Cloud AI, unavailable coach service, console-error checks, and horizontal overflow.

## Release verification

`pnpm check` passed 207 tests (7 process safety, 2 contracts, 10 telemetry-domain, 22 collector, 34 web, and 132 API/evaluation), strict TypeScript, ESLint/Ruff, the collector build, and the 12-route Next.js production build. Final Playwright passed 31 desktop/mobile flows with one intentional duplicate responsive-matrix skip. The schema audit, secret audit, capture inventory, `git diff --check`, runtime health, and OpenAPI checks also passed. Generated Playwright/QA output remains ignored.
