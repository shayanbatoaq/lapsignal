# AI coach architecture

LapSignal has one bounded language layer and one dependable deterministic coach. Analytics remains authoritative: a model does not calculate telemetry metrics, and raw high-frequency telemetry is never sent to a provider.

## Providers and configuration

`AI_PROVIDER` selects `rule_based`, `openai`, or `openrouter` through one server-side interface. OpenRouter uses the official OpenAI Python client against `OPENROUTER_BASE_URL`. The OpenRouter path is a single non-streaming `POST /api/v1/chat/completions` request with zero tools, `reasoning_effort: low`, strict `response_format.json_schema`, and SDK retries fixed at zero. The direct OpenAI-compatible endpoint family deliberately uses `max_tokens`; the separately modeled Azure family uses `max_completion_tokens`.

OpenRouter routing is pinned to `order: ["openai"]`, `allow_fallbacks: false`, and `require_parameters: true`. Data collection remains `deny` and is never relaxed automatically. The alpha.4 live request succeeded with that policy, although endpoint metadata did not independently declare data-policy compatibility. ZDR is requested only when explicitly configured.

The canonical secret file is the ignored repository-root `.env`. The browser receives only safe provider/build state and sanitized diagnostics. Keys, authorization headers, prompts, raw response bodies, physical telemetry, participant information, and capture paths are never logged or persisted.

## Consent and cadence

Both persisted **AI consent** and **Cloud AI** must be enabled. Before provider construction or network access, the running API must report application `0.1.0-alpha.4`, base provider-contract schema `1f7791fed1421e1d0810f9155a273a8807980145649caf89deb3494e3bd3f715`, an active server-side guard, explicit consent, Cloud AI enabled, and the expected configured provider. Any mismatch returns the deterministic coach with zero provider calls. Post-session generation is separately opt-in; per-lap coaching remains experimental and off by default. A telemetry sample can never trigger a provider call.

## Untrusted provider contract

The model may author only one to three ordered actions containing:

- a controlled coaching category and priority;
- one or more request-enumerated evidence IDs;
- concise observation, driver action, and explanation text.

It cannot author a trusted location, corner, sector, lap, timestamp, sample range, metric value, unit, confidence, expected gain, session identity, driver identity, or car identity. Extra fields are rejected by Pydantic as well as the strict schema. Provider text containing numbers, number words, locations, internal IDs, or measurement/unit claims is rejected before display.

The stable official-client-generated base schema hash is `1f7791fed1421e1d0810f9155a273a8807980145649caf89deb3494e3bd3f715`. Each request deep-copies that contract and constrains evidence-ID items to the exact supplied snapshot. The final synthetic Silverstone request schema hash was `f9f95c21c660a13fb089912e45252a62ce7127899457a2e2cfb8976167150bb9`. Recursive schema audit runs before all network access. There is no JSON-object fallback, tool loop, model repair request, provider retry, or model substitution.

## Trusted application result

LapSignal resolves every accepted evidence ID locally, then attaches canonical locations, sector/lap/sample context, metric values and units, evidence confidence, and an expected gain only when deterministic analytics supplied one. A single location is used when all evidence agrees; differing locations become `Multiple zones`; valid evidence without location becomes `Session-wide`. The model cannot override these values.

If parsing, schema, exact-model, evidence, or factual-text validation fails, the untrusted output is discarded and the rule-based coach renders. The UI supports nullable confidence and labels a valid action `Evidence-backed` when no deterministic confidence is available.

## Durable diagnostics and verification states

A sanitized transport record is captured immediately after the HTTP response, before structured parsing or evidence validation. It preserves separately classified Cloudflare Ray, OpenRouter trace/request, `x-request-id`, and `gen-` generation IDs; provider/model; finish/refusal/error states; prompt, completion, reasoning, and total tokens; reported cost; latency; streaming and retry state; and both schema hashes. Those facts survive every downstream rejection.

Developer diagnostics report four independent states:

- `provider_transport_verified`
- `structured_output_verified`
- `grounded_output_accepted`
- `safe_fallback_verified`

Failed/rejected runs persist only bounded diagnostics. No complete prompt, raw response, rejected model text, secret, or hidden reasoning is stored.

## Alpha.4 live verification

Exactly one authorized synthetic Silverstone generation was sent on 2026-08-12 using `openai/gpt-5-mini`. It returned HTTP 200 from the pinned OpenAI route, the exact requested model, `finish_reason=stop`, strict JSON that passed Pydantic validation, and usage. Usage was 857 prompt tokens, 490 completion tokens including 128 reasoning tokens, 1,347 total tokens, and `$0.00119425` reported cost; transport latency was 8,898 ms.

The provider text contained an unsupported factual claim, so evidence validation rejected it before display. LapSignal returned three deterministic coaching actions, recorded safe fallback, made no retry or metadata request, and restored Cloud AI and consent to disabled.

Final states for that request:

- `provider_transport_verified: true`
- `structured_output_verified: true`
- `grounded_output_accepted: false`
- `safe_fallback_verified: true`

This verifies OpenRouter transport, the pinned provider/model route, strict structured output, durable diagnostics, and safe product behavior once with a synthetic fixture. It does **not** claim grounded live-provider acceptance and does **not** claim cloud coaching over a physical PS4 session. The physical telemetry path remains separately verified. No further paid verification attempt is recommended for this milestone.
