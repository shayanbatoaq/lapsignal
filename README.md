# LapSignal

**Every lap has a signal.** LapSignal is an evidence-backed AI race engineer prototype for sim racers. A deterministic analytics pipeline calculates pace, consistency, technique, and stint findings; the optional AI coach may explain only that stored evidence.

This alpha runs locally on Windows without Docker, telemetry hardware, cloud credentials, or an OpenAI key. It includes three reproducible demo sessions, normalized and raw-capture replay, a native F1 2021 UDP listener, a local 24-circuit F1 2021 map pack, and a responsive web application.

> LapSignal is an independent telemetry analysis prototype and is not affiliated with or endorsed by any game publisher, racing series, governing body, console manufacturer, or vehicle manufacturer.

## Requirements

- Windows 11 (the collector also develops on other Node-supported systems)
- Node.js 22.13 or newer, Corepack, and pnpm 11
- Python 3.12 or newer and [uv](https://docs.astral.sh/uv/)

## First run

From PowerShell in the repository root:

```powershell
corepack pnpm setup
corepack pnpm seed
corepack pnpm dev:demo
```

Open [http://localhost:3000](http://localhost:3000). The API and interactive OpenAPI document are at [http://localhost:8000](http://localhost:8000) and [http://localhost:8000/docs](http://localhost:8000/docs). `pnpm dev:demo` reseeds deterministic data, then safely starts the API, web app, and collector; the separate `pnpm seed` above is useful as an explicit setup check.

Use `pnpm dev:status`, `pnpm dev:stop`, and `pnpm dev:clean-start` for PID-verified Windows process management. Clean start proves the current alpha.4/build 4 identity for all three services and never stops an unrelated process merely because it owns an expected port. Use `pnpm dev:app-start` when the API and web app should run while the collector stays off.

Copy `.env.example` to `.env` only when overriding defaults. No variable is required for demo or replay mode.

## Working modes

- **Demo:** `pnpm dev:demo` serves 42 laps across F1-style controller, GT3 practice, and synthetic hypercar endurance sessions.
- **Replay:** with the API running, use `pnpm collector:replay` for the sanitized fixture. To reprocess an existing ignored physical recording without changing it, run `pnpm --filter @lapsignal/collector start replay "data\captures\<capture>.lsraw" --data-dir data`. Both paths use the collector heartbeat, bounded delivery queue, API ingestion, and session-finalization endpoints.
- **Live F1 2021:** run `corepack pnpm dev:live`, then send PS4 telemetry to the laptop IPv4 address on UDP port `20777`. The managed development stack includes the collector. See [PS4 setup](docs/PS4_F1_2021_SETUP.md).

Useful collector diagnostics:

```powershell
pnpm --filter @lapsignal/collector start doctor
pnpm --filter @lapsignal/collector start inspect ..\..\data\fixtures\f1-2021-replay.jsonl
pnpm --filter @lapsignal/collector start listen --port 20777 --data-dir ..\..\data
```

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Clean-start API, web, and collector without reseeding |
| `pnpm dev:demo` | Seed, then clean-start API, web, and collector |
| `pnpm dev:status` | Report verified LapSignal service ownership |
| `pnpm dev:stop` | Stop only verified LapSignal services |
| `pnpm dev:clean-start` | Replace verified stale services and prove current build identity |
| `pnpm build` | Build all buildable workspaces |
| `pnpm lint` | Run TypeScript/React and Python lint checks |
| `pnpm typecheck` | Run strict TypeScript checks |
| `pnpm test` | Run workspace and Python unit/API/evaluation tests |
| `pnpm test:e2e` | Run Playwright desktop/mobile flows |
| `pnpm seed` | Recreate deterministic SQLite/Parquet demo data |
| `pnpm collector:listen` | Listen on native Windows UDP 20777 |
| `pnpm collector:replay` | Replay and finalize the bundled normalized fixture |
| `pnpm generate:client` | Generate route/schema types from FastAPI OpenAPI |
| `pnpm check` | Lint, typecheck, test, and build |

If a global pnpm shim is available, the shorter `pnpm ...` forms remain valid. When `corepack enable` fails with EPERM under `C:\Program Files\nodejs`, use the Corepack-direct commands above or `powershell -ExecutionPolicy Bypass -File .\scripts\lapsignal.ps1 demo`; neither path requires Administrator access.

## Optional cloud coach

Fallback coaching is always available. To opt in to the hosted coach, set these server-only values in `.env`, then enable both **AI consent** and **Cloud AI** in Settings:

```dotenv
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your-key
OPENROUTER_COACH_MODEL=openai/gpt-5-mini
OPENROUTER_DEEP_MODEL=openai/gpt-5.2
```

The canonical environment file is the repository-root `.env`. Raw captures and complete high-frequency traces are never provided to the model. Only a versioned compact evidence bundle of lap summaries, deterministic metrics, context, and evidence IDs may leave the machine. The server validates structured output and falls back to clearly labelled rule-based coaching on any provider or validation failure.

## Repository map

```text
apps/web              Next.js App Router UI
apps/collector        Node/TypeScript UDP collector and replay CLI
services/api          FastAPI, SQLAlchemy, analytics, storage, coach
packages/contracts    Versioned Zod telemetry contracts
packages/design-system Design tokens
packages/telemetry-domain Shared browser/domain helpers
data/demo             Seed manifest and Parquet artifacts
data/fixtures         Bundled replay fixture
data/local            Ignored SQLite, captures, queues, and live JSONL
docs                  Operations and design documentation
```

Start with [Architecture](ARCHITECTURE.md), [Windows setup](docs/WINDOWS_SETUP.md), [analytics](docs/ANALYTICS.md), and [AI coach design](docs/AI_COACH.md). The alpha is private-source: no open-source license is granted or included.
