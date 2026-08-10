# Windows development setup

## Install prerequisites

Install 64-bit Node.js 22.13+, Python 3.12+, Git, and `uv`. Open a new PowerShell window, then verify:

```powershell
node --version
corepack --version
python --version
uv --version
git --version
```

Enable pnpm through Corepack and install both runtimes:

```powershell
corepack pnpm setup
corepack pnpm seed
```

`corepack pnpm setup` installs the pnpm workspace and runs `uv sync --project services/api`. It does not write a global shim and does not require an Administrator terminal. If `corepack enable` returns EPERM under `C:\Program Files\nodejs`, skip it and keep using `corepack pnpm ...`.

## Start demo mode

```powershell
corepack pnpm dev:demo
```

Open `http://localhost:3000`. Stop both processes with Ctrl+C. Local metadata is written to `data\local\lapsignal.db`; normalized demo artifacts are Parquet files under `data\demo`. Both are reproducible with `pnpm seed`.

If port 3000 or 8000 is occupied, identify the owner with:

```powershell
Get-NetTCPConnection -State Listen | Where-Object LocalPort -In 3000,8000
```

## Validate the workspace

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm test:e2e
```

Playwright may request its Chromium binary on a fresh machine. Install only that browser with `pnpm --filter @lapsignal/web exec playwright install chromium`.

## Native collector

Run the collector directly in PowerShell:

```powershell
corepack pnpm --filter @lapsignal/collector start doctor
corepack pnpm collector:listen
```

Do not place the collector in WSL: a native Windows UDP socket avoids virtual-network and firewall ambiguity. Captures and the bounded retry queue stay under `data\local` and are gitignored. `scripts\lapsignal.ps1` also exposes `setup`, `seed`, `demo`, `live`, `collector`, `replay`, and `verify` actions.

## Environment overrides

Copy `.env.example` to `.env` only when necessary. Safe local defaults cover the database, data directory, ports, CORS, collector target, demo flag, and fallback coach. Never commit `.env` or paste an API key into a client-side `NEXT_PUBLIC_*` variable.
