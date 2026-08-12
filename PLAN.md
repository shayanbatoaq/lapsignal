# LapSignal implementation plan

## Current direction

LapSignal is a real-data-first, local telemetry product. A fresh installation initializes schema and required static metadata but contains no sessions. Sessions enter the product only from the native collector or an explicitly selected local recording.

## Architecture decisions

1. **Truthful local state:** the UI distinguishes an unavailable API, an offline collector, an empty library, and persisted saved sessions. It never substitutes bundled session data.
2. **Bounded telemetry:** physical captures and normalized telemetry live outside relational tables. Browser responses are downsampled.
3. **One analytics authority:** Python calculations produce findings. The coach only summarizes stored evidence.
4. **One optional coach agent:** the provider path uses narrow typed contracts and Pydantic validation. Missing consent, Cloud AI, configuration, or valid output always selects the deterministic fallback without a network attempt.
5. **Native collector:** Node's `dgram` owns transport; F1 2021 parsing, normalization, recording, delivery, and CLI concerns stay isolated.
6. **Game-independent contracts:** the normalized schema is versioned separately from the F1 adapter.
7. **Isolated verification:** automated synthetic fixtures exist only under test directories and always use temporary database and telemetry roots.

## Completed milestones

- Monorepo, API, empty-safe database initialization, and complete responsive UI.
- Deterministic lap preparation, pace, braking, throttle, steering, and stint analysis.
- Verified F1 2021 packet parser, native UDP listener, explicit replay, recording, queueing, and diagnostics.
- Rule-based coach, bounded optional provider path, structured evidence, provenance, and evaluations.
- PID-verified Windows service management, production builds, browser acceptance, documentation, and private release workflow.
