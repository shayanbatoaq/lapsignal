# Deploy the LapSignal public showcase to Vercel

This repository is ready for a Vercel-hosted, read-only Next.js preview. The deployment does not contain or contact FastAPI, SQLite, the UDP collector, WebSockets, OpenRouter, or local telemetry storage. Do not make the GitHub repository public.

## Import settings

In the Vercel dashboard, choose **Add New → Project**, connect GitHub, and import the private repository `shayanbatoaq/lapsignal`. Use these settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | `Next.js` |
| Root directory | `apps/web` |
| Include source files outside Root Directory | Enabled |
| Node.js version | `22.x` |
| Install command | `corepack pnpm install --frozen-lockfile` |
| Build command | `corepack pnpm build` |
| Output directory | Leave blank; use the Next.js default |

The checked-in `apps/web/vercel.json` records the framework, install, and build commands. Enable **Include source files outside of the Root Directory** so pnpm can discover the repository workspace, root lockfile, and the `@lapsignal/contracts`, `@lapsignal/design-system`, and `@lapsignal/telemetry-domain` packages. The build invokes only the web workspace and does not require Python or `uv`.

## Environment variables

Add the following under **Project Settings → Environment Variables**:

| Name | Value | Environments |
| --- | --- | --- |
| `LAPSIGNAL_SHOWCASE` | `true` | Production and Preview; Development only if you want local Vercel Development to show the preview |
| `NEXT_PUBLIC_PORTFOLIO_URL` | `https://shayan.patricians.pk` | Production and Preview |
| `NEXT_PUBLIC_SHOWCASE_CANONICAL_URL` | Final `https://` public URL | Production after the final domain is known |
| `NEXT_PUBLIC_PROJECT_REPOSITORY_URL` | Leave unset while the repository is private | None |

Do not add database, API, OpenRouter, or collector variables. `LAPSIGNAL_SHOWCASE` must be the exact lowercase string `true`; absent, `false`, `TRUE`, and other values preserve local-product mode.

## First deployment

1. Confirm the settings and variables above.
2. Click **Deploy**. Vercel builds the commit currently at `main`; this is the first production deployment for the project.
3. Open the assigned `*.vercel.app` URL and perform the verification checklist below.
4. After choosing the permanent URL, set `NEXT_PUBLIC_SHOWCASE_CANONICAL_URL` to that exact origin and redeploy so canonical and social metadata use it.

## Custom domain

Use a descriptive subdomain such as `lapsignal.shayan.patricians.pk` or `labs.shayan.patricians.pk/lapsignal` if your portfolio routing supports it. A dedicated subdomain is clearest. In Vercel, open **Project Settings → Domains**, add the subdomain, and follow the displayed DNS instructions. A subdomain normally uses the CNAME record Vercel supplies. Once verified, assign it to the production deployment and update the canonical variable.

## Verification checklist

Open browser developer tools and verify:

1. The disclosure reads **INTERACTIVE PRODUCT PREVIEW — Representative telemetry · Read-only**.
2. Overview, Live Session, Sessions, a Session Detail URL, Compare, Debrief, Progress, Settings, and a report URL load directly and after refresh.
3. Live Session says **RECORDED SHOWCASE PLAYBACK**, and Play, Pause, Restart, 1×, and 2× work.
4. Settings controls, coach generation, session performance mode, export, and deletion are disabled or explain that they are available locally.
5. The Network panel contains no request to `localhost`, port `8000`, `/v1/`, OpenRouter, or a WebSocket endpoint.
6. The console has no hydration or uncaught runtime errors.
7. Mobile width has no horizontal overflow.

The public bundle is deterministic and read-only. It has no server route capable of ingesting data or performing product mutations.

## Rollback

Open the project’s **Deployments** tab, select the last known-good production deployment, and use **Promote to Production** or the dashboard rollback action. Do not delete the previous deployment if you want instant rollback to remain available. Vercel’s deployment view shows the source commit for confirmation.

No Vercel project or deployment is created by repository preparation. Connecting the repository, accepting the first build, configuring DNS, and promoting or rolling back deployments remain dashboard actions for the repository owner.
