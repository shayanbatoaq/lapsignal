# LapSignal implementation plan

## Status

LapSignal starts at `v0.1.0-alpha.1` (build 1). The repository was empty, so no prior application code or user changes required preservation.

## Architecture decisions

1. **Offline-first demo:** deterministic JSON fixtures are the canonical demo source. The API seeds SQLite metadata and materializes normalized telemetry as Parquet when PyArrow is available, with JSONL as a transparent local fallback.
2. **Bounded telemetry:** raw captures and normalized telemetry live outside relational tables. Browser responses are downsampled.
3. **One analytics authority:** Python calculations produce findings. The coach only summarizes stored evidence.
4. **One optional coach agent:** the OpenAI Agents SDK uses narrow typed tools and a Pydantic output model. Missing credentials always select the deterministic fallback.
5. **Native collector:** Node's `dgram` owns transport; F1 2021 parsing, normalization, recording, delivery, and CLI concerns stay isolated.
6. **Game-independent contracts:** the normalized schema is versioned separately from the F1 adapter.
7. **Client boundaries:** the Next.js app works against the API when available and falls back to the same seeded snapshot for portfolio reliability.

## Milestones

- [x] M0: inspect the repository, verify source requirements, initialize Git, record versions and decisions.
- [x] M1: monorepo, API, database migration, deterministic seed data, and complete responsive UI.
- [x] M2: deterministic lap preparation, pace, braking, throttle, steering, and stint analysis with tests.
- [x] M3: verified F1 2021 packet parser, native UDP listener, replay, recording, queueing, and diagnostics.
- [x] M4: fallback coach, optional one-agent SDK path, structured evidence, provenance, and evaluation scenarios.
- [x] M5: lint, typing, unit/API/E2E tests, production builds, browser screenshots, documentation, and handoff.

## Definition of done

The local acceptance path is verified and every executed command is recorded in `HANDOFF.md`. Cloud-coach execution and packets from a physical PS4 remain external-credential/hardware checks and are explicitly not claimed as executed.
