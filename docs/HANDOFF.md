# LapSignal engineering handoff

## Current identity

- Release remains `v0.1.0-alpha.3 · build 3`.
- Cloud coach: **Implemented and contract-tested; live OpenRouter verification pending.**
- Cloud AI remains disabled. No OpenRouter generation or metadata request was made during this work.
- The physical F1 2021 telemetry path remains separately verified; it is not evidence of cloud-coach verification.

## Local development services

Run `pnpm dev:clean-start` from the repository root. `pnpm dev:status` reports the verified manifest-backed API, web, and collector processes; `pnpm dev:stop` stops only those verified processes. Runtime manifests and logs are ignored beneath `data/local/dev-services`.

The API health identity includes version, build, Git commit or `uncommitted`, real server PID, process start time, provider, provider-configured state, Cloud-AI state, guard state, endpoint family, coaching schema hash, and diagnostics-contract version. The web exposes its own safe runtime identity at `/api/build`; the collector heartbeat carries the corresponding collector identity. Clean start requires all three identities to match current code before it succeeds.

## F1 2021 circuit-map pack

The live map now has complete local geometry for all 24 full F1 2021 circuits: eight highest-quality telemetry seeds and sixteen packaged static maps from pinned, CC BY 4.0 F1DB historical-layout SVGs. Melbourne uses the old pre-2022 layout, Singapore uses the pre-2023 layout, and Abu Dhabi uses the 5.554 km pre-redesign layout represented by F1 2021. IDs 8, 21-25 remain explicitly unavailable.

Geometry selection and marker positioning are separate. Partial calibration never replaces a complete static circuit; marker positioning upgrades from static/no marker to lap-distance projection, then to an accepted local or seed world transform where available. The pack validator and contact-sheet generator are `pnpm circuits:validate` and `pnpm circuits:contact-sheet`. Runtime map rendering is fully local.

## Offline acceptance checkpoint

An existing ignored F1 2021 `.lsraw` recording was replayed offline through the production parser, adapter, bounded collector delivery, API ingestion, finalization, persistence, analytics, debrief, and saved-lap telemetry path. The accepted run parsed 5,390 samples with zero rejections, drained the queue, finalized one session with three laps, and left the capture SHA-256 unchanged. After a managed restart, the saved session retained one clean lap, two invalid-but-coachable laps, all five analysis groups, grounded findings, a rule-based report, and 812 bounded comparison trace points across three laps.

The live pass resolved numeric track ID 14 to the packaged Abu Dhabi map and Ferrari identity immediately. Marker positioning used lap distance; physical world coordinates remained an optional upgrade. Performance mode remained `unknown` because F1 2021 UDP does not provide it. No PS4 was required and this was not a new live physical telemetry test.

Cloud AI stayed disabled. The local coach path produced rule-based coaching and the isolated acceptance database retained zero AI-run rows, so no OpenRouter or other provider call occurred. The cloud coach remains **Implemented and contract-tested; live OpenRouter verification pending.**

Validation commands and results:

- `pnpm check`: passed lint, Ruff, strict TypeScript, 7 process-safety tests, 2 contract tests, 10 telemetry-domain tests, 22 collector tests, 19 web tests, 109 API/evaluation tests, the collector build, and the 12-route Next.js production build (169 automated tests total).
- `pnpm test:e2e`: 25 passed and 1 intentional mobile-project skip, covering 1440Ã—900 desktop, 390Ã—844 mobile, and the additional 1280/768/360 overflow matrix.
- `pnpm circuits:validate`: all 24 full F1 2021 maps passed (8 telemetry seeds and 16 packaged static circuits; 6 unsupported IDs remain explicit).
- `pnpm calibration:validate`: all 8 built-in seeds and 13 ignored local calibration candidates passed privacy/geometry validation; the local candidates remain excluded from Git.
- `git diff --check`: passed.

## Cloud-coach boundary

The future preferred candidate remains strict `json_schema`, non-streaming, zero-tool, `require_parameters: true`, and direct OpenAI-compatible routing with `max_tokens`. Azure routing is modeled separately with `max_completion_tokens`. `data_collection: deny` compatibility remains unverified and may not be relaxed automatically. Pydantic, evidence-reference, unsupported-claim, model-identity, usage, and finish-reason gates remain mandatory, with deterministic fallback on every failure.

The diagnostic checkpoint is local commit `a3de498` (`chore(ai): checkpoint OpenRouter diagnostics pending verification`). No tag, push, deployment, or release bump is part of this handoff.
