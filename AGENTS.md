# LapSignal repository guide

## Layout

- `apps/web`: Next.js product and marketing UI.
- `apps/collector`: native Windows Node UDP collector.
- `services/api`: FastAPI, storage, analytics, coach, and migrations.
- `packages/*`: contracts, design tokens, telemetry domain, and shared config.
- `data`: deterministic demo, replay fixtures, and ignored local artifacts.
- `docs`: setup, protocol, analytics, privacy, security, and release notes.

## Commands

Use `pnpm setup`, `pnpm seed`, `pnpm dev:demo`, and `pnpm check`. Python commands run through `uv --project services/api`. The collector must remain runnable in native Windows PowerShell.

## Conventions

Strict TypeScript, Pydantic v2, SQLAlchemy 2, Zod validation at boundaries, explicit units, deterministic seeds, bounded buffers, sanitized logs, and evidence IDs on every coaching claim. Keep protocol parsing separate from transport.

## Versioning and tests

Update `versions.json` and `CHANGELOG.md` together. Use SemVer and Conventional Commit messages. Run relevant unit tests while editing and `pnpm check` before handoff.

## Do not

Do not add a license, publisher branding, fabricated performance claims, secrets, raw telemetry uploads to AI, Docker as a local requirement, or deploy/push without permission.

## Definition of done

Demo, replay, API, analytics, collector, fallback coach, accessibility, mobile/desktop layouts, documentation, and production builds are verified with no critical placeholders.
