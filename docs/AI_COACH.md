# AI coach architecture

LapSignal has one optional coaching agent and one deterministic fallback. Neither path calculates telemetry metrics. The evidence contract comes from a completed analysis run and is validated again before a report is returned.

## Runtime paths

Without `OPENAI_API_KEY`, `generate_coach_report` returns a polished **Rule-based coach** report. It selects no more than three stored findings and includes their exact IDs, limitations, analysis/prompt versions, timestamp, response status, and fallback provenance.

With a key, the server uses the current [OpenAI Agents SDK for Python](https://openai.github.io/openai-agents-python/) `Agent`, `Runner`, function tools, and a Pydantic output type. The SDK's documented [agents](https://openai.github.io/openai-agents-python/agents/) and [tools](https://openai.github.io/openai-agents-python/tools/) patterns informed the implementation. Model IDs are environment-configurable; the account must have access to the selected model.

The agent can call only:

- `get_session_summary`
- `get_lap_comparison`
- `get_top_findings`
- `get_stint_analysis`
- `get_driver_progress`
- `get_finding_evidence`
- `search_coaching_knowledge`

Tools close over one selected session and return compact summaries, not arbitrary database queries, filesystem access, raw captures, or full high-frequency traces. A returned report is rejected if any `evidence_references` value is absent from the supplied finding set. Failure or unavailable cloud service falls back locally and adds a visible limitation.

## Structured output

The Pydantic schema requires `session_summary`, at most three priorities, `what_improved`, `what_regressed`, `next_stint_plan`, `confidence_summary`, limitations, and evidence references. The prompt prohibits invented references, guaranteed gains, unevidenced setup advice, vehicle-balance diagnoses as fact, and wheel-specific advice for controller users.

Provenance contains model ID, prompt and analysis versions, supplied finding IDs, permitted tool set, token usage when available, latency, timestamp, status, fallback flag, and Git SHA. The alpha exposes this in reports/settings but does not yet persist live cloud runs through a durable job queue.

## Coaching knowledge

`knowledge.py` contains twelve short, original notes: braking, brake release, trail braking, throttle, corner exit, consistency, controller, wheel, tyre, fuel, endurance mindset, and multiclass traffic. Retrieval is deterministic tag/text scoring with a three-result bound. The notes guide language; they cannot override telemetry evidence and contain no copied paid material or external passages.

## Consent and data boundary

AI is opt-in. Keep `OPENAI_API_KEY` server-side and set profile consent before enabling the cloud path. Only derived evidence needed for a report may leave the machine. Do not add a raw-telemetry tool or place secrets in any `NEXT_PUBLIC_*` variable. SDK tracing must follow the same privacy boundary if enabled later.
