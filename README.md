# LapSignal

**Every lap has a signal.** LapSignal is an evidence-backed AI race engineer prototype for sim racers. A deterministic analytics pipeline calculates pace, consistency, technique, and stint findings; the optional AI coach may explain only stored evidence.

This alpha runs locally on Windows without Docker, cloud credentials, or an OpenAI key. A fresh installation contains no sessions: telemetry enters only through the native F1 2021 collector or an explicitly selected local recording. The product includes a local 24-circuit F1 2021 map pack and a responsive web application.

> LapSignal is an independent telemetry analysis prototype and is not affiliated with or endorsed by any game publisher, racing series, governing body, console manufacturer, or vehicle manufacturer.

## Requirements

- Windows 11 (the collector also develops on other Node-supported systems)
- Node.js 22.13 or newer, Corepack, and pnpm 11
- Python 3.12 or newer and [uv](https://docs.astral.sh/uv/)

## First run

From PowerShell in the repository root:

```powershell
corepack pnpm setup
corepack pnpm dev:app-start
```

Open [http://localhost:3000](http://localhost:3000). API health and interactive OpenAPI are at [http://localhost:8000/health](http://localhost:8000/health) and [http://localhost:8000/docs](http://localhost:8000/docs). `setup` installs dependencies and initializes only schema and required static metadata; it never creates sessions, laps, telemetry, findings, or progress.

Use `pnpm dev:status`, `pnpm dev:stop`, and `pnpm dev:clean-start` for PID-verified Windows process management. Clean start proves the current alpha.4/build 4 identity for all three services and never stops an unrelated process merely because it owns an expected port. Use `pnpm dev:app-start` when the API and web app should run while the collector stays off.

Copy `.env.example` to `.env` only when overriding defaults. No environment variable is required for local storage, saved-session browsing, or deterministic coaching.

## Capture and replay

- **Live F1 2021:** start `pnpm collector:listen`, then send PS4 telemetry to the laptop IPv4 address on UDP port `20777`. See [PS4 setup](docs/PS4_F1_2021_SETUP.md).
- **Explicit replay:** with the API running, supply a specific ignored local `.lsraw` or normalized JSONL recording: `pnpm collector:replay -- "data\captures\<capture>.lsraw"`. Replay uses the normal collector heartbeat, bounded delivery queue, ingestion, and finalization paths. No recording is selected automatically.

Useful collector diagnostics:

```powershell
pnpm --filter @lapsignal/collector start doctor
pnpm --filter @lapsignal/collector start inspect "data\captures\<capture>.lsraw"
pnpm --filter @lapsignal/collector start listen --port 20777 --data-dir ..\..\data
```

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm setup` | Install dependencies and initialize required database metadata |
| `pnpm db:init` | Idempotently initialize schema and required static rows without session content |
| `pnpm dev` | Clean-start API, web, and collector |
| `pnpm dev:app-start` | Start API and web while keeping the collector off |
| `pnpm dev:status` | Report verified LapSignal service ownership |
| `pnpm dev:stop` | Stop only verified LapSignal services |
| `pnpm dev:clean-start` | Replace verified stale services and prove current build identity |
| `pnpm collector:listen` | Listen on native Windows UDP 20777 |
| `pnpm collector:replay -- <path>` | Replay only the explicitly supplied local recording |
| `pnpm generate:client` | Generate route/schema types from FastAPI OpenAPI |
| `pnpm check` | Lint, typecheck, test, and build |
| `pnpm test:e2e` | Run isolated Playwright desktop/mobile flows |

If a global pnpm shim is available, the shorter `pnpm ...` forms remain valid. When `corepack enable` fails with EPERM under `C:\Program Files\nodejs`, use the Corepack-direct commands above or `powershell -ExecutionPolicy Bypass -File .\scripts\lapsignal.ps1 app`; neither path requires Administrator access.

## Optional cloud coach

Rule-based coaching is always available. To opt in to the hosted coach, set these server-only values in `.env`, then enable both **AI consent** and **Cloud AI** in Settings:

```dotenv
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your-key
OPENROUTER_COACH_MODEL=openai/gpt-5-mini
OPENROUTER_DEEP_MODEL=openai/gpt-5.2
```

The canonical environment file is the ignored repository-root `.env`. Raw captures and complete high-frequency traces are never provided to the model. Only a versioned compact evidence bundle of lap summaries, deterministic metrics, context, and evidence IDs may leave the machine. The server validates structured output and falls back to clearly labelled rule-based coaching on any provider or validation failure.

## Repository map

```text
apps/web              Next.js App Router UI
apps/collector        Node/TypeScript UDP collector and explicit replay CLI
services/api          FastAPI, SQLAlchemy, analytics, storage, coach
packages/contracts    Versioned Zod telemetry contracts
packages/design-system Design tokens
packages/telemetry-domain Shared browser/domain helpers
data/circuit-maps     Packaged non-session circuit geometry
data/circuit-seeds    Privacy-sanitized circuit geometry calibration assets
data/local            Ignored SQLite, queues, live telemetry, and artifacts
data/captures         Ignored physical recordings
docs                  Operations and design documentation
```

Automated synthetic inputs live only below test fixture directories, use temporary databases/data roots, and are unavailable through production routes. Start with [Architecture](ARCHITECTURE.md), [Windows setup](docs/WINDOWS_SETUP.md), [analytics](docs/ANALYTICS.md), and [AI coach design](docs/AI_COACH.md). The alpha is private-source: no open-source license is granted or included.

## Public portfolio showcase

The web workspace also has an explicit, read-only portfolio mode selected only by server-side `LAPSIGNAL_SHOWCASE=true`. It uses a compact fictionalized Spa programme, never falls back into local mode, and performs no API, collector, database, WebSocket, or provider calls. See [showcase data flow](docs/SHOWCASE_DATA_FLOW.md) and [exact Vercel dashboard settings](docs/VERCEL_SHOWCASE.md). This mode does not change the product version and must not be used as a source of physical-session evidence.
