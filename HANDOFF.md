# LapSignal v0.1.0-alpha.1 handoff

Local demo, replay, analytics, collector, fallback-coach, UI, documentation, and build acceptance paths were verified on Windows 11 on 2026-08-09. A real OpenAI request and physical PS4 packet stream were not executed because the environment supplied neither an API key nor console hardware; their boundaries, native socket, binary fixtures, fallback, and setup path are implemented and documented.

## 1. What was built

- Premium responsive marketing and product UI for overview, onboarding, live telemetry, sessions, detail, two-to-four-lap comparison, coach, progress, settings, and shareable reports.
- Three fixed-seed synthetic sessions: F1-style controller, GT3 wheel practice, and hypercar endurance; 42 laps and 7,560 normalized samples total.
- FastAPI REST/WebSocket service, SQLite/Alembic metadata model, Parquet artifacts, bounded live buffer, export/delete flows, error envelopes, validation, CORS, and version compatibility response.
- Deterministic pace, consistency, distance alignment, braking, throttle, steering, and stint analytics with evidence/limitations.
- Native Windows Node UDP collector with verified F1 2021 headers/layout lengths, player detection, recording, frame statistics, bounded retry queue, heartbeat, inspect/doctor/listen/replay commands, and graceful shutdown.
- Maximum-three-priority fallback coach and optional one-agent OpenAI Agents SDK path with narrow tools, structured output, evidence validation, provenance, and an original twelve-topic knowledge base.

## 2. Architecture

`F1 2021 or replay → Node collector → bounded HTTP batches/heartbeat → FastAPI → SQLite summaries + Parquet/JSONL/captures → deterministic findings → fallback or optional AI explanation → Next.js REST/WebSocket UI`.

Analytics is authoritative. AI receives compact findings, never raw UDP or complete telemetry. The canonical telemetry schema is game-independent/versioned, and browser traces are bounded/downsampled.

## 3. Fresh setup

```powershell
corepack enable
pnpm setup
pnpm seed
pnpm dev:demo
```

Open `http://localhost:3000`; OpenAPI is at `http://localhost:8000/docs`.

## 4. Demo

```powershell
pnpm dev:demo
```

No environment variables, Docker, wheel, live telemetry, database server, or paid service is required.

## 5. Collector replay

With the API running:

```powershell
pnpm collector:replay
```

Verified result: 120 accepted fixture samples, 0 rejected, 0 queued; API reported replay/online, session `demo-f1-controller-silverstone`, frame 357, lap 2, and wrote a 103,068-byte live JSONL artifact.

## 6. Live PS4 setup

Put PS4 and laptop on the same private LAN; run `ipconfig`; start `pnpm dev` and `pnpm collector:listen`; in F1 2021 choose **Game Options → Settings → Telemetry Settings**, turn **UDP Telemetry** on, leave **UDP Broadcast Mode** off, set **UDP IP Address** to the laptop IPv4 address, **UDP Port** to `20777`, **UDP Send Rate** to `20Hz`, and **UDP Format** to `2021`. Permit inbound UDP 20777 on the Windows Private firewall profile if needed. Full troubleshooting is in `docs/PS4_F1_2021_SETUP.md`.

## 7. Optional OpenAI environment

```dotenv
OPENAI_API_KEY=your-key
OPENAI_COACH_MODEL=gpt-5.6-luna
OPENAI_DEEP_MODEL=gpt-5.6-terra
```

Keep all values server-side and enable both **AI consent** and **Cloud AI** in Settings. The server enforces both flags. Model access is account-dependent. Without the key or either flag, every flow uses the labeled rule-based coach.

## 8. Verification results

- `pnpm generate:client`: 21 operations and 7 schema names generated.
- `pnpm seed`: 3 sessions and 7,560 samples.
- `pnpm check`: pass.
- TypeScript/React/collector/Python lint: pass.
- Strict TypeScript type checking: pass across contracts, domain, collector, and web.
- Unit/API/evaluation tests: 51 pass (contracts 1, telemetry domain 3, collector 10, web 7, Python 30).
- Coach evaluation cases: all 12 pass.
- Next.js 16.3 production build: pass; all 11 application routes generated.
- Playwright: 8/8 pass across 1440×900 desktop and 390×844 mobile, including console-error, chart, replay, and keyboard checks.
- API process startup and `/health`: pass.
- Native UDP bind/start/stop and recording flush: pass.
- One non-failing dependency warning remains: Starlette's current TestClient adapter warns about a future `httpx2` migration.

## 9. QA captures

- `artifacts/qa/desktop-dashboard.png` — 1440×900 viewport, full-page dashboard.
- `artifacts/qa/mobile-dashboard.png` — 390×844 viewport, full-page mobile dashboard.

These generated QA artifacts are intentionally gitignored.

## 10. Version

Product/web/API/collector: `v0.1.0-alpha.1`; build `1`; telemetry schema `1`; F1 2021 adapter `0.1.0`; analytics `0.1.0`; prompt `coach-v1`; local Git SHA defaults to `local` until a release build supplies `GIT_SHA`.

## 11. Known limitations

- No real OpenAI request was possible without credentials; the SDK path is implemented, typed, failure-safe, and not claimed as cloud-executed.
- No physical PS4 packet stream was available; native UDP binding, protocol fixtures, player indexes, malformed packets, recording, shutdown, and actual replay-to-API were executed.
- Live ingress is bounded in memory and appended to JSONL, but automatic durable conversion of every live run into the full relational/Parquet session lifecycle is phase two.
- Demo reads are intentionally backed by the deterministic fixture snapshot even though SQLite metadata is seeded; this keeps portfolio/demo startup resilient.
- This is a trusted-local, single-user alpha without hosted auth, TLS, tenant isolation, or production object storage.
- Fuel correction, robust traffic classification, and tyre conclusions stay unavailable when required measured channels are sparse.

## 12. Phase two

Durable live-session finalization, authenticated PostgreSQL/object storage, signed collector enrollment, background analysis, newer game adapters, richer measured endurance/traffic/energy analysis, gated real-model evaluations, and thin Tauri/mobile clients after contracts stabilize.

## 13. Manual review

- `apps/collector/src/protocol/parser.ts` and `docs/F1_2021_UDP_SOURCES.md` before distributing the adapter.
- `services/api/lapsignal/analytics.py` before using findings beyond the synthetic/local alpha.
- `services/api/lapsignal/coach.py` and `knowledge.py` before enabling a paid model/account.
- `docs/PRIVACY.md`, `SECURITY.md`, and `TRADEMARK_USAGE.md` before any hosted or commercial release.
- `.env.example`, `versions.json`, and `CHANGELOG.md` for every release.

No deployment, paid infrastructure, Git push, tag, permissive license, publisher logo, testimonial, or guaranteed performance claim was created.
