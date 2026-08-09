# LapSignal

**Every lap has a signal.** LapSignal is an evidence-backed AI race engineer prototype for sim racers. A deterministic analytics pipeline calculates pace, consistency, technique, and stint findings; the optional AI coach may explain only that stored evidence.

This alpha runs locally on Windows without Docker, telemetry hardware, cloud credentials, or an OpenAI key. It includes three reproducible demo sessions, a fixture replay, a native F1 2021 UDP listener, and a responsive web application.

> LapSignal is an independent telemetry analysis prototype and is not affiliated with or endorsed by any game publisher, racing series, governing body, console manufacturer, or vehicle manufacturer.

## Requirements

- Windows 11 (the collector also develops on other Node-supported systems)
- Node.js 22.13 or newer, Corepack, and pnpm 11
- Python 3.12 or newer and [uv](https://docs.astral.sh/uv/)

## First run

From PowerShell in the repository root:

```powershell
corepack enable
pnpm setup
pnpm seed
pnpm dev:demo
```

Open [http://localhost:3000](http://localhost:3000). The API and interactive OpenAPI document are at [http://localhost:8000](http://localhost:8000) and [http://localhost:8000/docs](http://localhost:8000/docs). `pnpm dev:demo` reseeds deterministic data, then starts both processes; the separate `pnpm seed` above is useful as an explicit setup check.

Copy `.env.example` to `.env` only when overriding defaults. No variable is required for demo or replay mode.

## Working modes

- **Demo:** `pnpm dev:demo` serves 42 laps across F1-style controller, GT3 practice, and synthetic hypercar endurance sessions.
- **Replay:** with the API running, use `pnpm collector:replay`. The fixture follows the same heartbeat and batch-ingestion path as live data and updates `/app/live`.
- **Live F1 2021:** run `pnpm collector:listen`, then send PS4 telemetry to the laptop IPv4 address on UDP port `20777`. See [PS4 setup](docs/PS4_F1_2021_SETUP.md).

Useful collector diagnostics:

```powershell
pnpm --filter @lapsignal/collector start doctor
pnpm --filter @lapsignal/collector start inspect ..\..\data\fixtures\f1-2021-replay.jsonl
pnpm --filter @lapsignal/collector start listen --port 20777 --data-dir ..\..\data
```

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start FastAPI and Next.js without reseeding |
| `pnpm dev:demo` | Seed, then start API and web |
| `pnpm build` | Build all buildable workspaces |
| `pnpm lint` | Run TypeScript/React and Python lint checks |
| `pnpm typecheck` | Run strict TypeScript checks |
| `pnpm test` | Run workspace and Python unit/API/evaluation tests |
| `pnpm test:e2e` | Run Playwright desktop/mobile flows |
| `pnpm seed` | Recreate deterministic SQLite/Parquet demo data |
| `pnpm collector:listen` | Listen on native Windows UDP 20777 |
| `pnpm collector:replay` | Replay the bundled normalized fixture |
| `pnpm generate:client` | Generate route/schema types from FastAPI OpenAPI |
| `pnpm check` | Lint, typecheck, test, and build |

## Optional OpenAI coach

Fallback coaching is always available. To opt in to the hosted coach, set these server-only values in `.env`, then enable both **AI consent** and **Cloud AI** in Settings:

```dotenv
OPENAI_API_KEY=your-key
OPENAI_COACH_MODEL=gpt-5.6-luna
OPENAI_DEEP_MODEL=gpt-5.6-terra
```

Raw captures and complete high-frequency traces are never provided to the model. Only compact metrics, findings, and evidence IDs are exposed through narrow tools. Model identifiers remain configurable because availability depends on the account.

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
