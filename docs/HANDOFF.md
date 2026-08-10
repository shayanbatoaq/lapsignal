# LapSignal engineering handoff

## Current identity

- Release remains `v0.1.0-alpha.3 · build 3`.
- Cloud coach: **Implemented and contract-tested; live OpenRouter verification pending.**
- Cloud AI remains disabled. No OpenRouter generation or metadata request was made during this work.
- The physical F1 2021 telemetry path remains separately verified; it is not evidence of cloud-coach verification.

## Local development services

Run `pnpm dev:clean-start` from the repository root. `pnpm dev:status` reports the verified manifest-backed API, web, and collector processes; `pnpm dev:stop` stops only those verified processes. Runtime manifests and logs are ignored beneath `data/local/dev-services`.

The API health identity includes version, build, Git commit or `uncommitted`, real server PID, process start time, provider, provider-configured state, Cloud-AI state, guard state, endpoint family, coaching schema hash, and diagnostics-contract version. The web exposes its own safe runtime identity at `/api/build`; the collector heartbeat carries the corresponding collector identity. Clean start requires all three identities to match current code before it succeeds.

## Cloud-coach boundary

The future preferred candidate remains strict `json_schema`, non-streaming, zero-tool, `require_parameters: true`, and direct OpenAI-compatible routing with `max_tokens`. Azure routing is modeled separately with `max_completion_tokens`. `data_collection: deny` compatibility remains unverified and may not be relaxed automatically. Pydantic, evidence-reference, unsupported-claim, model-identity, usage, and finish-reason gates remain mandatory, with deterministic fallback on every failure.

The diagnostic checkpoint is local commit `a3de498` (`chore(ai): checkpoint OpenRouter diagnostics pending verification`). No tag, push, deployment, or release bump is part of this handoff.
