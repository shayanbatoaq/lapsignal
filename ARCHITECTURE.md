# LapSignal architecture

LapSignal is an offline-first telemetry platform with three independently versioned runtime surfaces.

```text
F1 2021 / explicitly selected local recording
        |
        v
Node collector -> raw capture + normalized JSONL
        |  bounded HTTP batches + heartbeat
        v
FastAPI -> SQLite metadata + Parquet telemetry artifacts
        |  deterministic analysis -> findings -> coach report
        v
Next.js web app -> downsampled REST + bounded WebSocket live stream
```

The collector validates the packed little-endian F1 2021 header before packet-specific parsing. The API stores low-frequency provenance and findings relationally while high-frequency samples remain artifacts. The web application consumes a narrow public DTO layer. AI is optional and never owns calculations; it receives compact findings through typed tools.

PostgreSQL and object storage are production adapters, not local requirements. Tauri and mobile clients can later reuse the HTTP/WebSocket API and versioned telemetry contracts.

Database initialization is intentionally content-free: it creates schema and required adapter/build metadata, but never sessions, laps, telemetry, findings, reports, comparisons, or progress. Automated synthetic sessions are test-only, use temporary storage roots, and cannot be reached through the production API.
