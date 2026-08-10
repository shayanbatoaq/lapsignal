# AI coach architecture

LapSignal has one bounded race-engineer path and one deterministic fallback. Analytics remains authoritative: no model calculates telemetry metrics, and raw high-frequency telemetry is never sent to a provider.

## Providers and configuration

`AI_PROVIDER` selects `rule_based`, `openai`, or `openrouter` through one server-side provider interface. OpenRouter uses the official OpenAI Python client directly against the configurable `OPENROUTER_BASE_URL`; it does not use an Agents runner. The preferred candidate is one non-streaming `POST /api/v1/chat/completions` request with no tools, `openai/gpt-5-mini`, `max_tokens`, and Chat Completions structured output under `response_format.json_schema`. `openai/gpt-5.2` remains reserved for optional deeper analysis. Direct OpenAI configuration remains supported independently.

The canonical secret file is the repository-root `.env`, loaded by `services/api/lapsignal/config.py`. The browser receives only provider name, configured state, model IDs, reachability, sanitized diagnostics, and last success time. OpenRouter attribution and router-metadata headers are server-side only; routing requires parameter support and defaults data collection to `deny`. ZDR is requested only when explicitly enabled. Raw headers and bodies are never persisted.

## Consent and cadence

Both persisted **AI consent** and **Cloud AI** must be enabled. The provider must also be configured, its exact model slug validated, and Evidence Bundle v1 must validate. Manual generation is allowed; post-session generation is separately opt-in; per-lap coaching is experimental and off by default. A telemetry sample can never trigger a provider call.

## Evidence Bundle v1

The compact bundle contains session/track/car context, manual performance mode and source, completed lap summaries, deterministic consistency values, up to three priority losses, zone references, equipment profile, and stable evidence IDs. It excludes raw samples, participant names, network identifiers, IP addresses, paths, secrets, and unrelated personal information. A canonical JSON hash makes unchanged evidence cacheable.

## Structured validation and fallback

The Pydantic output permits a summary, a positive observation, no more than three priority actions, and limitations. Every action requires supplied evidence IDs and bounded confidence; `expected_gain_seconds` is required and must remain null unless a later deterministic contract explicitly supplies a gain. The runtime request uses the official OpenAI Python client's strict Pydantic transformation. The resulting schema hash is `5e1d18d4a757a6ac2f145710f4cff0d231daa02e00772900a5ce0abf5f41bc6c`; a recursive local contract audit runs before provider health or generation network access. Unsupported evidence, invented performance context, exact time-gain language, malformed output, or a provider error is discarded before display. The UI then shows rule-based coaching with a discreet sanitized reason.

Run metadata persists in `ai_runs`: provider, requested/resolved model, prompt/schema versions, evidence hash/cache key, timestamps, latency, token counts when returned, cost when available, status, cache state, validation result, and validated response JSON. Failed runs use the same JSON field only for a bounded `developer_diagnostics` object. Cloudflare Ray, OpenRouter request/trace, `x-request-id`, and `gen-` generation identifiers are classified into separate fields. A provider message is stored verbatim only when it passes secret and prompt-overlap screening; otherwise only a redacted marker, length, and SHA-256 hash are retained. Keys, authorization headers, prompts, raw telemetry, raw response bodies, raw model text, and hidden reasoning are never stored.

## Offline request verification

`build_openrouter_chat_request` constructs the preferred strict request. `build_openrouter_json_object_request` prepares an explicit compatibility candidate that still requires local Pydantic and evidence validation; the adapter never switches to it automatically. `summarize_chat_request` records only the endpoint, method, parameter names, requested model, streaming and structured-output modes, tool count, schema name/hash, token-budget fields, and routing field names. Tests send the exact serialized request only through `httpx.MockTransport`; they also confirm the body contains Chat Completions `response_format`, not Responses API `text.format`, and that unsupported `verbosity` is absent.

The adapter inspects the non-streaming HTTP response envelope before SDK parsing. This preserves OpenRouter errors returned inside HTTP 200 responses, then separately gates JSON parsing, Pydantic validation, exact-model matching, and evidence validation. Streaming is not enabled for coaching, but the diagnostic parser is tested against OpenRouter's documented SSE error envelope so a future streaming path cannot silently collapse `finish_reason: error`.

## Provider verification status

OpenRouter is not provider-verified. One authorized synthetic Silverstone request returned HTTP 400 before generation and invoked the deterministic fallback. The historical `error.message` and header provenance were not retained, so the exact cause remains unproven. Cloud AI remains disabled. The separately verified physical telemetry path does not constitute cloud-AI verification.
