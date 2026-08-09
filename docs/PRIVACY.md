# Privacy

LapSignal is local-first. Demo mode uses synthetic data. Live/replay metadata, captures, retry queues, SQLite, JSONL, and Parquet files remain under the configured `DATA_DIR` unless the operator explicitly configures another service.

## Collected data

The prototype can store game/session identifiers, input-device type, lap summaries, high-frequency car/control telemetry, derived findings, local profile preferences, and coach provenance. It does not need a publisher account, payment data, contact list, microphone, camera, or precise real-world location.

Raw high-frequency telemetry is excluded from the summary export endpoint. The Settings export includes profile and session summaries. Local deletion requires the exact confirmation phrase `DELETE LOCAL DATA`, validates the target below `DATA_DIR`, removes local user telemetry, and preserves reproducible demo fixtures.

## Optional AI

Cloud coaching is disabled without a server-side key and should also require profile consent. Only compact deterministic summaries/findings/evidence IDs may be sent. Raw UDP captures and complete traces are prohibited from the AI tool boundary. Provider retention and account controls are governed by the operator's OpenAI account configuration; review them before opting in.

## Sharing

The read-only report route is designed for portfolio demonstration and contains synthetic summaries rather than private raw telemetry. Do not expose a local API or user report publicly without adding authentication, authorization, a retention policy, and a threat review.

This alpha is not a production privacy policy or legal advice. A commercial release needs jurisdiction-specific disclosures, consent/withdrawal flows, data subject operations, and retention defaults.
