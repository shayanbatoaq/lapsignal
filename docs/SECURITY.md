# Security

## Implemented prototype controls

- Safe local defaults bind the API to `127.0.0.1`; CORS permits only local web origins.
- Request bodies are capped at 2 MB and telemetry batches at 1000 validated samples.
- Pydantic and Zod reject extra/malformed telemetry fields; packet readers verify format, version, ID, and length.
- Storage resolves every relative path under `DATA_DIR`; local deletion revalidates its resolved target.
- Raw files are data only and are never executed.
- Collector queues and live buffers are bounded; logs are structured and contain no configured secrets.
- Security response headers include `nosniff` and same-origin referrer policy.
- `.env`, SQLite, captures, queues, build output, and coverage output are gitignored.
- The LLM has no database/filesystem tool and receives no raw telemetry.

## Trust boundary and limitations

This is a single-user local alpha. It has no user authentication, authorization, TLS termination, CSRF token system, per-client rate limiter, antivirus pipeline, signed collector identity, or encrypted-at-rest local store. Therefore keep API/collector ports on a trusted private network and do not bind FastAPI to `0.0.0.0` for internet exposure.

Before hosted deployment, add an identity provider, object-level authorization, TLS, rate and quota enforcement, structured audit retention, secret management, database least privilege, signed uploads/checksums, dependency and image scanning, backups, incident procedures, and tests for tenant isolation.

## Reporting

This private prototype has no public vulnerability mailbox. Report issues directly to the repository owner without including keys, raw private captures, or exploit data in shared screenshots. Rotate a key immediately if it may have entered logs or source control.
