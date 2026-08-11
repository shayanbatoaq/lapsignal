# OpenRouter support bundle

This bundle is sanitized. It contains no API key, authorization header, prompt, evidence bundle, telemetry values, or response body.

- UTC timestamp: `2026-08-10T19:58:00.263972Z`
- Model: `openai/gpt-5-mini`
- Endpoint: `POST /api/v1/chat/completions`
- HTTP status: `400`
- SDK exception: `BadRequestError`
- Canonical local category: `invalid_request`
- OpenRouter error type: not returned or not retained
- Provider code: not returned
- Generation ID (`gen-`): not returned
- OpenRouter request/trace ID: not retained
- `x-request-id`: not retained
- Cloudflare Ray ID: not verifiable from the legacy record
- Unclassified legacy identifier: `a29192af1e38a07f-KHI` (format resembles `cf-ray`, but the old adapter collapsed four header sources into one field)
- Local run ID: `ai-f4f40878-50f7-407c-bd0a-b10d05222c49`

## Message recovery

The original `error.message` cannot be recovered. The exception object and HTTP response are no longer alive, the local logs contain no matching request/run identifier, and the raw body was intentionally not persisted. The adapter replaced a non-whitelisted message—or an absent message—with the same generic value, so even original-message presence is unknowable.

- Persisted replacement: `OpenRouter rejected the request parameters.`
- Persisted replacement length: `43`
- Persisted replacement SHA-256: `0d169dec150ccf5263f2bc9cd03c082a606aa3b4118d9d7d9024bba81d966026`
- Original message length/hash: unavailable

## Known request defects

The historical cause cannot be isolated because two independent defects existed:

1. Schema hash `4bc590dca7118f1a4ec2f50fce09daa29618fb0fe12c3a281a7e2fa590f1da24` was raw Pydantic schema rather than the official client strict schema. Violations occurred at `/additionalProperties`, `/$defs/PriorityAction/additionalProperties`, `/$defs/PriorityAction/required`, and `/$defs/PriorityAction/properties/expected_gain_seconds/default`.
2. The request used `max_completion_tokens`. Endpoint metadata retrieved later showed direct OpenAI endpoints advertise `max_tokens`, while Azure endpoints advertise `max_completion_tokens`. Data-policy compatibility for `data_collection: deny` was not returned, so the viable historical route cannot be established offline.

Historical note: this support bundle describes the superseded alpha.3 request. Alpha.4 replaced that contract with base schema `1f7791fed1421e1d0810f9155a273a8807980145649caf89deb3494e3bd3f715` and request-scoped evidence enums. Exactly one later authorized synthetic request returned HTTP 200 and valid structured output, then was rejected safely by factual-text validation; see `AI_COACH.md`. No support contact or additional provider request is pending.
