# Data model and telemetry contract

LapSignal separates low-frequency relational metadata from high-frequency telemetry artifacts.

## Relational model

SQLite is the zero-configuration default; SQLAlchemy models remain PostgreSQL-compatible. Alembic owns schema changes.

| Entity | Responsibility |
| --- | --- |
| `DriverProfile`, `Device` | Preferences, experience, consent, and input hardware |
| `GameAdapter`, `CollectorInstance` | Adapter/schema compatibility and collector heartbeat |
| `Session`, `Stint`, `Lap` | Session identity, clean/invalid classifications, summaries, and provenance |
| `TelemetryArtifact` | Validated artifact path, format, row count, schema version, checksum |
| `DerivedMetric`, `AnalysisRun`, `Finding` | Deterministic results, limitations, evidence, and analysis version |
| `CoachReport`, `CoachMessage`, `ModelRun` | Structured explanation and AI/fallback provenance |
| `AppBuild` | Product/build/component versions and Git SHA |

Raw sample streams are not relational rows. Native collection records a length-prefixed `.lsraw` capture and normalized JSONL; finalized telemetry is stored as Zstandard-compressed Parquet. Storage paths are resolved beneath `DATA_DIR`; traversal outside that root is rejected.

Finalized physical or replay sessions persist lap validity, the complete nested analysis contract (pace, stint, braking, throttle, and steering), evidence-backed findings, a rule-based coach report, and normalized Parquet telemetry. The session telemetry endpoint reloads the local normalized stream for bounded, downsampled multi-lap comparison after a process restart. Invalid and incomplete attempts remain available as technique evidence, but only clean completed laps can set personal-best, benchmark, or theoretical-best timing.

## Canonical sample v1

The game-independent contract is validated in both `packages/contracts` (Zod) and `services/api/lapsignal/schemas.py` (Pydantic). It includes identity/provenance, lap position, pose, controls, drivetrain, fuel/tyre data, invalidity, and source packet ID. Units are explicit in names:

- time: Unix or monotonic event milliseconds (`*_ms`)
- distance and world position: metres (`*_m`, position axes)
- speed: kilometres per hour (`speed_kph`)
- controls: normalized 0–1, steering −1–1
- angles: radians from the source adapter
- engine speed: revolutions per minute (`rpm`)
- fuel: kilograms; tyre wear: percent by `[RL, RR, FL, FR]`

Unavailable adapter fields are `null`; the adapter must never synthesize a measurement it did not receive. `schema_version` is currently `1`. A breaking field or semantic change requires a new schema version and an explicit compatibility path.

## Provenance chain

Each stored session links the collector, F1 adapter, telemetry schema, normalized and raw artifacts when present, analysis version, input device, build number, and Git SHA. Findings link to an analysis run and carry metric IDs, units, reference values, involved laps, confidence, and limitations. Reports list every supplied finding ID so UI claims can return to deterministic evidence.

`pnpm db:init` is idempotent and content-free. It creates schema plus required adapter/build rows and never creates sessions, laps, artifacts, analyses, findings, reports, comparisons, personal bests, or progress points.
