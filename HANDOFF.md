# LapSignal v0.1.0-alpha.4 handoff

LapSignal alpha.4 closes the AI reliability milestone while preserving the verified physical telemetry, session detail/comparison, circuit-map, collector, deterministic analytics, and responsive product paths.

## Release identity

- Product/web/API/collector: `v0.1.0-alpha.4 · build 4`
- Provider contract: `race-engineer-v3`
- Base AI schema: `1f7791fed1421e1d0810f9155a273a8807980145649caf89deb3494e3bd3f715`
- Diagnostics contract: `3`
- Cloud AI and consent: default off and restored off after verification

## AI verification

One authorized OpenRouter generation was made on 2026-08-12 with the deterministic synthetic Silverstone fixture and `openai/gpt-5-mini`. The pinned OpenAI route returned HTTP 200, exact model identity, `finish_reason=stop`, valid strict structured output, and usage. LapSignal rejected an unsupported factual phrase and displayed three deterministic fallback actions without retrying.

- Provider transport verified: yes
- Structured output verified: yes
- Grounded provider output accepted: no
- Safe fallback verified: yes
- Usage: 857 prompt, 490 completion, 128 reasoning, 1,347 total tokens
- Reported cost: `$0.00119425`
- Further generation or metadata requests: none

This is successful Outcome B safety behavior. It verifies the cloud transport/contract once with synthetic evidence, not cloud coaching over a physical PS4 session. The separately verified physical telemetry path remains documented in `docs/HANDOFF.md` and `docs/AI_COACH.md`.

## Architecture boundary

Provider output is untrusted and limited to category, priority, exact request-enumerated evidence IDs, and short coaching language. LapSignal derives locations, metric context, confidence, and expected gain locally. Unsupported factual or numerical provider text is never rendered. Sanitized transport usage and validation diagnostics survive downstream rejection; raw prompts, responses, telemetry, secrets, and rejected model text do not persist.

## Local use

```powershell
pnpm setup
pnpm dev:app-start
```

Open the product at `http://localhost:3000`, API health at `http://localhost:8000/health`, and OpenAPI at `http://localhost:8000/docs`.

The collector intentionally stays off with `dev:app-start`. For later PS4 use:

```powershell
pnpm collector:listen
```

Use `pnpm dev:status` to inspect verified processes and `pnpm dev:stop` to stop only manifest-verified LapSignal processes. Use `pnpm dev:clean-start` when API, web, and collector should all run.

## Verification and privacy

The bundled-session architecture has subsequently been removed without changing the alpha.4/build 4 identity. Fresh initialization stays empty; saved physical/imported sessions remain available while the collector is offline; replay requires an explicit local file. Automated synthetic inputs are confined to isolated temporary test storage and are not exposed through production routes.

The verification gate covers 208 unit/API/process checks and 31 isolated desktop/mobile browser flows, plus complete lint/type/build checks, schema and terminology audits, secret audit, capture inventory, and runtime health checks. `.env`, raw captures, databases, Parquet/telemetry recordings, logs, PID files, caches, test fixtures copied at runtime, and QA artifacts remain ignored and excluded from Git.

The AI verification milestone is closed. Product development can move to the next milestone without another paid verification attempt.
