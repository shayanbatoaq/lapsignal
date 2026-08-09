# Deployment paths

No infrastructure is created or deployed by this repository. The alpha's supported path is local Windows execution.

## Local production-like run

```powershell
pnpm setup
pnpm seed
pnpm build
pnpm api:dev
```

In another terminal, run `pnpm --filter @lapsignal/web start`. Keep the API on loopback. The collector always stays on the user's Windows machine because it receives LAN UDP from the console.

## Future hosted topology

- **Web frontend:** build the Next.js app on a Node-compatible platform. Configure only the public HTTPS API base in `NEXT_PUBLIC_API_BASE_URL`.
- **Python API:** deploy Uvicorn/Gunicorn behind an HTTPS reverse proxy with authenticated endpoints, strict hosted CORS, request/rate limits, health checks, and background jobs for analysis.
- **PostgreSQL:** set `DATABASE_URL`, run Alembic migrations as a release step, use least-privilege credentials, TLS, backups, and point-in-time recovery.
- **Object storage:** implement the existing storage boundary for S3/Supabase-compatible private buckets, presigned access, checksums, retention, and server-side encryption. Never expose raw artifacts through the report route.
- **Collector:** configure `COLLECTOR_API_URL` to the authenticated HTTPS ingest service and add signed collector enrollment before internet delivery. UDP reception itself remains local/native.

Hosted readiness still requires auth/tenant isolation, durable analysis jobs, production storage adapters, secret management, observability with telemetry redaction, migrations under load, backup/restore drills, and privacy/legal review. Dockerfiles and paid services are intentionally not required in this alpha.

## Release versioning

Use SemVer and Conventional Commits. Update `versions.json` and `CHANGELOG.md`, run `pnpm check`, create an annotated tag such as `v0.1.0-alpha.1`, and publish only after explicit approval. Include Git SHA and build number in the release environment. Do not push, tag, or deploy automatically from a developer machine.
