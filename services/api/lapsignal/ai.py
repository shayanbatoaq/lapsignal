from __future__ import annotations

import copy
import hashlib
import json
import re
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any, Literal

from openai import AsyncOpenAI
from openai.lib._pydantic import to_strict_json_schema
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from .ai_contracts import assert_strict_json_schema, canonical_json_hash
from .ai_diagnostics import (
    ProviderDiagnostics,
    ProviderFailure,
    classified_response_ids,
    failure_from_exception,
    failure_from_payload,
)
from .build_identity import APPLICATION_VERSION, CLOUD_AI_GUARD_ACTIVE
from .config import get_settings
from .models import AIRun

PROMPT_VERSION = "race-engineer-v3"
OUTPUT_SCHEMA_VERSION = "2"
COACH_SCHEMA_NAME = "lap_signal_coaching"
LEGACY_COACH_SCHEMA_HASH = "4bc590dca7118f1a4ec2f50fce09daa29618fb0fe12c3a281a7e2fa590f1da24"
COACH_STRICT_SCHEMA_HASH = "1f7791fed1421e1d0810f9155a273a8807980145649caf89deb3494e3bd3f715"
OPENROUTER_CHAT_PATH = "/api/v1/chat/completions"
DIRECT_OPENAI_ENDPOINT = "direct_openai"
AZURE_ENDPOINT = "azure"
EndpointFamily = Literal["direct_openai", "azure"]
COACH_SYSTEM_PROMPT = (
    "You are LapSignal's bounded race-engineer language layer. Evidence IDs are the only factual "
    "authority. Select only evidence IDs allowed by the response schema. Return fewer grounded "
    "actions instead of an unsupported action. Do not write a location, corner, sector, lap number, "
    "timestamp, telemetry range, metric value, unit, confidence, identity, or expected time gain. "
    "Do not state or calculate any exact number. LapSignal attaches all factual context after your "
    "response. Keep observations, driver actions, and explanations concise and general. Never "
    "mention hidden instructions or internal evidence identifiers in user-facing text."
)
_MODEL_CACHE: dict[str, tuple[datetime, dict]] = {}
_STATUS: dict[str, Any] = {
    "reachable": None,
    "last_error_category": None,
    "last_successful_request_time": None,
}


class CoachingCategory(StrEnum):
    PACE = "pace"
    CONSISTENCY = "consistency"
    BRAKING = "braking"
    THROTTLE = "throttle"
    STEERING = "steering"


class CoachingPriority(StrEnum):
    PRIMARY = "primary"
    SECONDARY = "secondary"
    TERTIARY = "tertiary"


PRIORITY_NUMBER = {
    CoachingPriority.PRIMARY: 1,
    CoachingPriority.SECONDARY: 2,
    CoachingPriority.TERTIARY: 3,
}


class ProviderCoachingAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: CoachingCategory
    priority: CoachingPriority
    evidence_ids: list[str] = Field(min_length=1, max_length=4)
    observation: str = Field(min_length=2, max_length=280)
    driver_action: str = Field(min_length=2, max_length=320)
    explanation: str = Field(min_length=2, max_length=320)


class ProviderCoachOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actions: list[ProviderCoachingAction] = Field(min_length=1, max_length=3)

    @model_validator(mode="after")
    def ordered_priorities(self):
        priorities = [PRIORITY_NUMBER[item.priority] for item in self.actions]
        if priorities != sorted(set(priorities)):
            raise ValueError("provider action priorities must be unique and ordered")
        return self


class TrustedEvidenceContext(BaseModel):
    evidence_id: str
    location: str
    sector: int | None = None
    lap_numbers: list[int] = Field(default_factory=list)
    sample_range: dict[str, int] | None = None
    metric: str
    value: int | float | str | bool | None = None
    unit: str | None = None
    reference_value: int | float | str | bool | None = None
    delta: int | float | None = None


class PriorityAction(BaseModel):
    priority: int = Field(ge=1, le=3)
    category: CoachingCategory = CoachingCategory.CONSISTENCY
    title: str = Field(min_length=2, max_length=120)
    location: str = Field(min_length=1, max_length=120)
    observation: str | None = Field(default=None, max_length=280)
    instruction: str = Field(min_length=2, max_length=500)
    reason: str = Field(min_length=2, max_length=500)
    evidence_ids: list[str] = Field(min_length=1)
    evidence_context: list[TrustedEvidenceContext] = Field(default_factory=list)
    confidence: float | None = Field(default=None, ge=0, le=1)
    expected_gain_seconds: float | None = None


class AICoachOutput(BaseModel):
    summary: str = Field(min_length=2, max_length=800)
    positive: str = Field(min_length=2, max_length=500)
    priority_actions: list[PriorityAction] = Field(max_length=3)
    limitations: list[str] = Field(max_length=8)

    @model_validator(mode="after")
    def ordered_priorities(self):
        priorities = [item.priority for item in self.priority_actions]
        if priorities != sorted(set(priorities)):
            raise ValueError("priority actions must be unique and ordered")
        return self


class EvidenceBundle(BaseModel):
    schema_version: Literal["1"] = "1"
    local_session_id: str = Field(exclude=True)
    session: dict[str, Any]
    laps: list[dict[str, Any]]
    priority_losses: list[dict[str, Any]]
    zones: list[dict[str, Any]]
    consistency: dict[str, Any]
    driver_profile: dict[str, Any]
    evidence: list[dict[str, Any]]


class ProviderResult(BaseModel):
    output: AICoachOutput
    requested_model: str
    resolved_model: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_usd: float | None = None
    diagnostics: ProviderDiagnostics | None = None


def evidence_bundle(session: dict, profile: dict | None = None) -> EvidenceBundle:
    findings = session.get("findings", [])[:3]
    evidence: list[dict[str, Any]] = []
    losses: list[dict[str, Any]] = []
    zones: list[dict[str, Any]] = []
    evidence_index = 0
    for finding in findings:
        values = []
        for item in finding.get("evidence", []):
            evidence_index += 1
            evidence_id = f"EV-{evidence_index:03d}"
            compact = {
                "id": evidence_id,
                "confidence": finding.get("confidence"),
                **item,
            }
            evidence.append(compact)
            values.append(evidence_id)
            if item.get("zone_id"):
                zones.append({"zone_id": item["zone_id"], "evidence_ids": [evidence_id]})
        losses.append(
            {
                "title": finding.get("title"),
                "instruction": finding.get("recommended_action"),
                "confidence": finding.get("confidence"),
                "evidence_ids": values,
                "limitations": finding.get("limitations", []),
            }
        )
    steering = session.get("metrics", {}).get("steering", {})
    if not any(
        str(item.get("metric", "")).startswith("steering_") for item in evidence
    ) and isinstance(steering.get("smoothness"), (int, float)):
        evidence_index += 1
        evidence.append(
            {
                "id": f"EV-{evidence_index:03d}",
                "metric": "steering_smoothness",
                "value": steering["smoothness"],
                "unit": "score_0_1",
                "reference_value": None,
                "delta": None,
                "lap_numbers": [],
                "zone_id": None,
                "confidence": 0.78,
                "limitations": [
                    steering.get(
                        "limitation",
                        "Steering smoothness is descriptive and not a balance diagnosis.",
                    )
                ],
            }
        )
    return EvidenceBundle(
        local_session_id=session["id"],
        session={},
        laps=[],
        priority_losses=losses,
        zones=zones,
        consistency={},
        driver_profile={},
        evidence=evidence,
    )


def evidence_hash(bundle: EvidenceBundle) -> str:
    return hashlib.sha256(
        json.dumps(bundle.model_dump(), sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def coach_strict_schema() -> dict[str, Any]:
    """Stable untrusted provider contract before request-scoped evidence enums."""
    schema = to_strict_json_schema(ProviderCoachOutput)
    assert_strict_json_schema(schema, expected_hash=COACH_STRICT_SCHEMA_HASH)
    return schema


def coach_schema_hash() -> str:
    return canonical_json_hash(coach_strict_schema())


def request_scoped_coach_schema(bundle: EvidenceBundle) -> dict[str, Any]:
    evidence_ids = sorted({str(item.get("id")) for item in bundle.evidence if item.get("id")})
    if not evidence_ids:
        raise ValueError("A request-scoped coaching schema requires at least one evidence ID.")
    schema = copy.deepcopy(coach_strict_schema())
    action = schema.get("$defs", {}).get("ProviderCoachingAction")
    if not isinstance(action, dict):
        raise ValueError("Provider action schema definition is unavailable.")
    items = action.get("properties", {}).get("evidence_ids", {}).get("items")
    if not isinstance(items, dict):
        raise ValueError("Provider evidence-ID item schema is unavailable.")
    items["enum"] = evidence_ids
    assert_strict_json_schema(schema)
    return schema


def request_schema_hash(bundle: EvidenceBundle) -> str:
    return canonical_json_hash(request_scoped_coach_schema(bundle))


def token_budget_parameter(endpoint_family: EndpointFamily) -> str:
    if endpoint_family == DIRECT_OPENAI_ENDPOINT:
        return "max_tokens"
    if endpoint_family == AZURE_ENDPOINT:
        return "max_completion_tokens"
    raise ValueError(f"Unsupported endpoint family: {endpoint_family}")


@dataclass(frozen=True)
class AIPreflightState:
    application_version: str
    schema_hash: str
    cloud_ai_guard_active: bool
    ai_consent: bool
    cloud_ai_enabled: bool
    ai_provider: str
    provider_configured: bool


def validate_ai_preflight(state: AIPreflightState) -> tuple[str, ...]:
    failures: list[str] = []
    if state.application_version != APPLICATION_VERSION:
        failures.append("application_version_mismatch")
    if state.schema_hash != COACH_STRICT_SCHEMA_HASH:
        failures.append("schema_hash_mismatch")
    if not state.cloud_ai_guard_active:
        failures.append("cloud_ai_guard_inactive")
    if not state.ai_consent:
        failures.append("ai_consent_missing")
    if not state.cloud_ai_enabled:
        failures.append("cloud_ai_disabled")
    if state.ai_provider not in {"openrouter", "openai"}:
        failures.append("provider_configuration_mismatch")
    if not state.provider_configured:
        failures.append("provider_not_configured")
    return tuple(failures)


def local_ai_preflight_state(profile: dict[str, Any]) -> AIPreflightState:
    settings = get_settings()
    configured = (
        bool(settings.openrouter_api_key and settings.openrouter_coach_model)
        if settings.ai_provider == "openrouter"
        else bool(settings.openai_api_key and settings.openai_coach_model)
        if settings.ai_provider == "openai"
        else False
    )
    return AIPreflightState(
        application_version=APPLICATION_VERSION,
        schema_hash=coach_schema_hash(),
        cloud_ai_guard_active=CLOUD_AI_GUARD_ACTIVE,
        ai_consent=bool(profile.get("ai_consent")),
        cloud_ai_enabled=bool(profile.get("cloud_ai_enabled")),
        ai_provider=settings.ai_provider,
        provider_configured=configured,
    )


def build_openrouter_chat_request(
    bundle: EvidenceBundle,
    *,
    model: str,
    max_tokens: int,
    routing: dict[str, Any],
    endpoint_family: EndpointFamily = DIRECT_OPENAI_ENDPOINT,
) -> dict[str, Any]:
    schema = request_scoped_coach_schema(bundle)
    request: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": COACH_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": "Select grounded coaching actions from this compact Evidence Bundle v1:\n"
                + bundle.model_dump_json(),
            },
        ],
        "stream": False,
        "tools": [],
        "reasoning_effort": "low",
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": COACH_SCHEMA_NAME,
                "strict": True,
                "schema": schema,
            },
        },
        "provider": routing,
    }
    request[token_budget_parameter(endpoint_family)] = max_tokens
    return request


def summarize_chat_request(request: dict[str, Any]) -> dict[str, Any]:
    response_format = request.get("response_format") or {}
    json_schema = response_format.get("json_schema") or {}
    routing = request.get("provider") or {}
    return {
        "endpoint_path": OPENROUTER_CHAT_PATH,
        "http_method": "POST",
        "parameter_names": sorted(request),
        "requested_model": request.get("model"),
        "streaming_mode": request.get("stream") is True,
        "structured_output_mode": response_format.get("type"),
        "tool_count": len(request.get("tools") or []),
        "schema_name": json_schema.get("name"),
        "schema_hash": (
            canonical_json_hash(json_schema["schema"])
            if isinstance(json_schema.get("schema"), dict)
            else coach_schema_hash()
        ),
        "base_contract_schema_hash": coach_schema_hash(),
        "token_budget_fields": {
            key: request[key] for key in ("max_completion_tokens", "max_tokens") if key in request
        },
        "optional_routing_field_names": sorted(routing),
    }


def cache_key(bundle_hash: str, provider: str, requested: str, resolved: str) -> str:
    value = "|".join(
        (bundle_hash, provider, requested, resolved, PROMPT_VERSION, OUTPUT_SCHEMA_VERSION)
    )
    return hashlib.sha256(value.encode()).hexdigest()


_CATEGORY_TITLE = {
    CoachingCategory.PACE: "Pace execution",
    CoachingCategory.CONSISTENCY: "Repeatable execution",
    CoachingCategory.BRAKING: "Braking control",
    CoachingCategory.THROTTLE: "Throttle application",
    CoachingCategory.STEERING: "Steering input",
}
_NUMBER_WORDS = re.compile(
    r"\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|"
    r"fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|"
    r"sixty|seventy|eighty|ninety|first|second|third|half|quarter|hundred|thousand|million)\b",
    re.I,
)
_FACTUAL_TEXT_TERMS = re.compile(
    r"\b(?:corner|turn|sector|lap|timestamp|sample|zone|metres?|meters?|seconds?|milliseconds?|"
    r"percent(?:age)?|kph|km/h|mph|rpm|degrees?)\b",
    re.I,
)
_KNOWN_CIRCUIT_LOCATIONS = re.compile(
    r"\b(?:abbey|aintree|becketts|brooklands|chapel|club|copse|farm|luffield|maggotts|"
    r"stowe|vale|village|woodcote)\b",
    re.I,
)


def evidence_category(record: dict[str, Any]) -> CoachingCategory | None:
    metric = str(record.get("metric", "")).lower()
    if "brak" in metric:
        return CoachingCategory.BRAKING
    if "throttle" in metric:
        return CoachingCategory.THROTTLE
    if "steer" in metric:
        return CoachingCategory.STEERING
    if "consisten" in metric or "variation" in metric:
        return CoachingCategory.CONSISTENCY
    if any(term in metric for term in ("pace", "lap_time", "best_lap", "degradation")):
        return CoachingCategory.PACE
    return None


def _evidence_location(record: dict[str, Any]) -> str:
    for key in ("corner_name", "location", "zone_name", "track_location"):
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()[:120]
    sector = record.get("sector")
    if isinstance(sector, int) and 1 <= sector <= 3:
        return f"Sector {sector}"
    zone_id = record.get("zone_id")
    if isinstance(zone_id, str) and zone_id.strip():
        words = zone_id.strip().replace("_", " ").replace("-", " ").split()
        return " ".join(words).capitalize()[:120]
    return "Session-wide"


def _trusted_evidence_context(record: dict[str, Any]) -> TrustedEvidenceContext:
    lap_numbers = [value for value in record.get("lap_numbers", []) if isinstance(value, int)]
    sample_range = record.get("sample_range")
    if not (
        isinstance(sample_range, dict)
        and all(
            isinstance(key, str) and isinstance(value, int) for key, value in sample_range.items()
        )
    ):
        sample_range = None
    return TrustedEvidenceContext(
        evidence_id=str(record["id"]),
        location=_evidence_location(record),
        sector=record.get("sector") if isinstance(record.get("sector"), int) else None,
        lap_numbers=lap_numbers,
        sample_range=sample_range,
        metric=str(record.get("metric", "unknown")),
        value=record.get("value")
        if isinstance(record.get("value"), (int, float, str, bool)) or record.get("value") is None
        else None,
        unit=record.get("unit") if isinstance(record.get("unit"), str) else None,
        reference_value=(
            record.get("reference_value")
            if isinstance(record.get("reference_value"), (int, float, str, bool))
            or record.get("reference_value") is None
            else None
        ),
        delta=(record.get("delta") if isinstance(record.get("delta"), (int, float)) else None),
    )


def _provider_text(output: ProviderCoachOutput) -> list[str]:
    return [
        value
        for action in output.actions
        for value in (action.observation, action.driver_action, action.explanation)
    ]


def validate_provider_output(
    output: ProviderCoachOutput, bundle: EvidenceBundle
) -> ProviderCoachOutput:
    known = {str(item["id"]): item for item in bundle.evidence}
    for action in output.actions:
        records = [known.get(evidence_id) for evidence_id in action.evidence_ids]
        if not records or any(record is None for record in records):
            raise ProviderFailure(
                "evidence_validation_error",
                "The model referenced evidence that was not supplied.",
                diagnostics=ProviderDiagnostics(
                    failure_stage="evidence_validation",
                    error_message="The structured response referenced unavailable evidence.",
                ),
            )
        categories = {evidence_category(record) for record in records if record is not None}
        if action.category not in categories:
            raise ProviderFailure(
                "evidence_validation_error",
                "The model assigned an unsupported coaching category.",
                diagnostics=ProviderDiagnostics(
                    failure_stage="evidence_validation",
                    error_message="The response category did not match its evidence metrics.",
                ),
            )
    forbidden_identifiers = [
        str(item.get("id")) for item in bundle.evidence if isinstance(item.get("id"), str)
    ]
    for text in _provider_text(output):
        if (
            re.search(r"\d", text)
            or _NUMBER_WORDS.search(text)
            or _FACTUAL_TEXT_TERMS.search(text)
            or _KNOWN_CIRCUIT_LOCATIONS.search(text)
        ):
            raise ProviderFailure(
                "evidence_validation_error",
                "The model supplied unsupported factual text.",
                diagnostics=ProviderDiagnostics(
                    failure_stage="evidence_validation",
                    error_message="The structured response contained an unsupported factual claim.",
                ),
            )
        if any(identifier.lower() in text.lower() for identifier in forbidden_identifiers):
            raise ProviderFailure(
                "evidence_validation_error",
                "The model exposed an internal evidence identifier.",
                diagnostics=ProviderDiagnostics(
                    failure_stage="evidence_validation",
                    error_message="The structured response exposed an internal identifier.",
                ),
            )
    return output


def enrich_provider_output(output: ProviderCoachOutput, bundle: EvidenceBundle) -> AICoachOutput:
    validate_provider_output(output, bundle)
    known = {str(item["id"]): item for item in bundle.evidence}
    trusted_actions: list[PriorityAction] = []
    limitations: list[str] = []
    for action in output.actions:
        records = [known[evidence_id] for evidence_id in action.evidence_ids]
        contexts = [_trusted_evidence_context(record) for record in records]
        locations = {context.location for context in contexts}
        location = contexts[0].location if len(locations) == 1 else "Multiple zones"
        confidence_values = [
            float(record["confidence"])
            for record in records
            if isinstance(record.get("confidence"), (int, float))
            and 0 <= float(record["confidence"]) <= 1
        ]
        expected_values = [
            float(record["expected_gain_seconds"])
            for record in records
            if isinstance(record.get("expected_gain_seconds"), (int, float))
            and float(record["expected_gain_seconds"]) >= 0
        ]
        for record in records:
            for limitation in record.get("limitations", []):
                if isinstance(limitation, str) and limitation not in limitations:
                    limitations.append(limitation)
        trusted_actions.append(
            PriorityAction(
                priority=PRIORITY_NUMBER[action.priority],
                category=action.category,
                title=_CATEGORY_TITLE[action.category],
                location=location,
                observation=action.observation,
                instruction=action.driver_action,
                reason=action.explanation,
                evidence_ids=action.evidence_ids,
                evidence_context=contexts,
                confidence=min(confidence_values) if confidence_values else None,
                expected_gain_seconds=min(expected_values) if expected_values else None,
            )
        )
    return AICoachOutput(
        summary=f"LapSignal accepted {len(trusted_actions)} evidence-grounded coaching action"
        + ("." if len(trusted_actions) == 1 else "s."),
        positive="Deterministic analysis supplied the factual context for every accepted action.",
        priority_actions=trusted_actions,
        limitations=limitations[:8],
    )


def validate_output(output: AICoachOutput, bundle: EvidenceBundle) -> AICoachOutput:
    """Validate the trusted public result, including deterministic evidence attachment."""
    known = {str(item["id"]) for item in bundle.evidence}
    for action in output.priority_actions:
        if not action.evidence_ids or not set(action.evidence_ids).issubset(known):
            raise ProviderFailure(
                "evidence_validation_error",
                "The trusted result referenced unavailable evidence.",
                diagnostics=ProviderDiagnostics(
                    failure_stage="evidence_validation",
                    error_message="The trusted result referenced unavailable evidence.",
                ),
            )
        if action.expected_gain_seconds is not None and not any(
            isinstance(item.get("expected_gain_seconds"), (int, float))
            for item in bundle.evidence
            if item.get("id") in action.evidence_ids
        ):
            raise ProviderFailure(
                "evidence_validation_error",
                "The trusted result contained an unsupported expected gain.",
                diagnostics=ProviderDiagnostics(
                    failure_stage="evidence_validation",
                    error_message="The trusted result contained an unsupported expected gain.",
                ),
            )
    return output


def usage_cost_usd(usage: Any | None) -> float | None:
    """Read OpenRouter's optional cost extension without exposing billing metadata."""
    if usage is None:
        return None
    if isinstance(usage, dict):
        raw_cost = usage.get("cost")
    else:
        extra = getattr(usage, "model_extra", None) or {}
        raw_cost = extra.get("cost")
    if raw_cost is None:
        return None
    try:
        cost = float(raw_cost)
    except (TypeError, ValueError):
        return None
    return cost if 0 <= cost <= 1 else None


def _usage_value(usage: Any | None, name: str) -> Any:
    if usage is None:
        return None
    if isinstance(usage, dict):
        return usage.get(name)
    value = getattr(usage, name, None)
    if value is not None:
        return value
    return (getattr(usage, "model_extra", None) or {}).get(name)


def _usage_count(usage: Any | None, name: str) -> int | None:
    value = _usage_value(usage, name)
    return value if isinstance(value, int) and value >= 0 else None


def _reasoning_tokens(usage: Any | None) -> int | None:
    details = _usage_value(usage, "completion_tokens_details")
    return _usage_count(details, "reasoning_tokens")


def _capture_usage(diagnostics: ProviderDiagnostics, usage: Any | None) -> None:
    diagnostics.usage_returned = usage is not None
    diagnostics.prompt_tokens = _usage_count(usage, "prompt_tokens")
    diagnostics.completion_tokens = _usage_count(usage, "completion_tokens")
    diagnostics.reasoning_tokens = _reasoning_tokens(usage)
    diagnostics.total_tokens = _usage_count(usage, "total_tokens")
    diagnostics.reported_cost_usd = usage_cost_usd(usage)


_TRANSPORT_DIAGNOSTIC_FIELDS = (
    "http_status",
    "request_id",
    "cloudflare_ray_id",
    "openrouter_request_id",
    "x_request_id",
    "generation_id",
    "provider_slug",
    "resolved_model",
    "finish_reason",
    "prompt_tokens",
    "completion_tokens",
    "reasoning_tokens",
    "total_tokens",
    "reported_cost_usd",
    "transport_latency_ms",
    "base_contract_schema_hash",
    "request_schema_hash",
)


def _merge_transport_diagnostics(
    target: ProviderDiagnostics, transport: ProviderDiagnostics
) -> ProviderDiagnostics:
    """Attach already-observed wire facts without replacing the specific failure cause."""
    for field_name in _TRANSPORT_DIAGNOSTIC_FIELDS:
        value = getattr(transport, field_name)
        if value is not None:
            setattr(target, field_name, value)
    target.streaming = transport.streaming
    target.refusal_returned = target.refusal_returned or transport.refusal_returned
    target.error_in_http_200 = target.error_in_http_200 or transport.error_in_http_200
    target.usage_returned = target.usage_returned or transport.usage_returned
    target.retry_count = transport.retry_count
    target.provider_transport_verified = (
        target.provider_transport_verified or transport.provider_transport_verified
    )
    target.structured_output_verified = (
        target.structured_output_verified or transport.structured_output_verified
    )
    target.grounded_output_accepted = (
        target.grounded_output_accepted or transport.grounded_output_accepted
    )
    target.safe_fallback_verified = (
        target.safe_fallback_verified or transport.safe_fallback_verified
    )
    if target.schema_validation_state == "not_run":
        target.schema_validation_state = transport.schema_validation_state
    if target.evidence_validation_state == "not_run":
        target.evidence_validation_state = transport.evidence_validation_state
    target.accepted_by_lapsignal = target.accepted_by_lapsignal or transport.accepted_by_lapsignal
    return target


class AIProvider(ABC):
    name: str

    @abstractmethod
    def is_configured(self) -> bool: ...
    @abstractmethod
    async def health_check(self) -> dict: ...
    @abstractmethod
    async def generate_session_debrief(
        self, bundle: EvidenceBundle, *, max_tokens: int = 500
    ) -> ProviderResult: ...
    async def generate_lap_debrief(
        self, bundle: EvidenceBundle, *, max_tokens: int = 350
    ) -> ProviderResult:
        return await self.generate_session_debrief(bundle, max_tokens=max_tokens)

    @abstractmethod
    def provider_metadata(self) -> dict: ...


class RuleBasedProvider(AIProvider):
    name = "rule_based"

    def is_configured(self) -> bool:
        return True

    async def health_check(self) -> dict:
        return {"reachable": True}

    def provider_metadata(self) -> dict:
        return {"provider": self.name, "configured": True, "fallback": True}

    async def generate_session_debrief(
        self, bundle: EvidenceBundle, *, max_tokens: int = 500
    ) -> ProviderResult:
        known = {str(item["id"]): item for item in bundle.evidence}
        actions = []
        for index, loss in enumerate(bundle.priority_losses[:3]):
            records = [known[item] for item in loss["evidence_ids"] if item in known]
            contexts = [_trusted_evidence_context(record) for record in records]
            locations = {context.location for context in contexts}
            location = (
                contexts[0].location
                if contexts and len(locations) == 1
                else "Multiple zones"
                if contexts
                else "Session-wide"
            )
            category = next(
                (
                    candidate
                    for record in records
                    if (candidate := evidence_category(record)) is not None
                ),
                CoachingCategory.CONSISTENCY,
            )
            actions.append(
                PriorityAction(
                    priority=index + 1,
                    category=category,
                    title=loss["title"],
                    location=location,
                    instruction=loss["instruction"],
                    reason="Deterministic analysis identified this as a priority.",
                    evidence_ids=loss["evidence_ids"],
                    evidence_context=contexts,
                    confidence=(
                        float(loss["confidence"])
                        if isinstance(loss.get("confidence"), (int, float))
                        else None
                    ),
                    expected_gain_seconds=next(
                        (
                            float(record["expected_gain_seconds"])
                            for record in records
                            if isinstance(record.get("expected_gain_seconds"), (int, float))
                            and float(record["expected_gain_seconds"]) >= 0
                        ),
                        None,
                    ),
                )
            )
        output = AICoachOutput(
            summary="Deterministic session analysis is ready.",
            positive="Completed valid laps provide a usable baseline.",
            priority_actions=actions,
            limitations=["Rule-based explanation; no cloud model was used."],
        )
        return ProviderResult(
            output=output, requested_model="rule-based-v1", resolved_model="rule-based-v1"
        )


class OpenAICompatibleProvider(AIProvider):
    def __init__(
        self,
        *,
        name: str,
        key: str | None,
        base_url: str | None,
        model: str,
        headers: dict[str, str] | None = None,
    ):
        settings = get_settings()
        self.name, self.key, self.base_url, self.model = name, key, base_url, model
        self.client = AsyncOpenAI(
            api_key=key or "not-configured",
            base_url=base_url,
            timeout=settings.ai_request_timeout_seconds,
            max_retries=0,
            default_headers=headers or {},
        )

    def is_configured(self) -> bool:
        return bool(self.key and self.model)

    def provider_metadata(self) -> dict:
        return {
            "provider": self.name,
            "configured": self.is_configured(),
            "coach_model": self.model,
            "reachable": _STATUS["reachable"],
            "last_error_category": _STATUS["last_error_category"],
            "last_successful_request_time": _STATUS["last_successful_request_time"],
        }

    async def health_check(self) -> dict:
        if not self.is_configured():
            raise ProviderFailure(
                "authentication_error",
                "Provider key is not configured.",
                diagnostics=ProviderDiagnostics(
                    failure_stage="local_configuration",
                    error_message="Provider key is not configured.",
                ),
            )
        if self.name != "openrouter":
            return {"reachable": True, "model_valid": True}
        cached = _MODEL_CACHE.get(self.model)
        if cached and cached[0] > datetime.now(UTC):
            return cached[1]
        try:
            response = await self.client.models.list()
            record = next((item for item in response.data if item.id == self.model), None)
            if not record:
                raise ProviderFailure(
                    "invalid_request",
                    "Configured model slug is unavailable.",
                    diagnostics=ProviderDiagnostics(
                        failure_stage="model_validation",
                        error_message="Configured model slug is unavailable.",
                    ),
                )
            details = {"reachable": True, "model_valid": True, "model": self.model}
            _MODEL_CACHE[self.model] = (datetime.now(UTC) + timedelta(hours=1), details)
            _STATUS.update(reachable=True, last_error_category=None)
            return details
        except ProviderFailure:
            raise
        except Exception as exc:
            raise failure_from_exception(exc, stage="model_validation") from exc

    def _extra_body(self) -> dict:
        if self.name != "openrouter":
            return {}
        settings = get_settings()
        routing: dict[str, Any] = {
            "order": ["openai"],
            "allow_fallbacks": False,
            "data_collection": settings.openrouter_data_collection,
            "require_parameters": True,
        }
        if settings.openrouter_zdr:
            routing["zdr"] = True
        return {"provider": routing}

    @staticmethod
    def _failure(exc: Exception) -> ProviderFailure:
        return failure_from_exception(exc)

    async def generate_session_debrief(
        self, bundle: EvidenceBundle, *, max_tokens: int = 500
    ) -> ProviderResult:
        schema = request_scoped_coach_schema(bundle)
        diagnostics = ProviderDiagnostics(
            failure_stage="request_transport",
            provider_slug=self.name,
            base_contract_schema_hash=coach_schema_hash(),
            request_schema_hash=request_schema_hash(bundle),
        )
        try:
            completion = await self.client.chat.completions.create(
                model=self.model,
                max_tokens=max_tokens,
                reasoning_effort="low",
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": COACH_SCHEMA_NAME,
                        "strict": True,
                        "schema": schema,
                    },
                },
                tools=[],
                messages=[
                    {"role": "system", "content": COACH_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": "Select grounded coaching actions from this compact Evidence Bundle v1:\n"
                        + bundle.model_dump_json(),
                    },
                ],
            )
            diagnostics.provider_transport_verified = True
            diagnostics.resolved_model = completion.model
            choice = completion.choices[0]
            diagnostics.finish_reason = choice.finish_reason
            _capture_usage(diagnostics, completion.usage)
            if choice.finish_reason != "stop" or completion.model != self.model:
                raise ProviderFailure(
                    "routing_error",
                    "The direct provider response did not satisfy the model and finish gates.",
                )
            content = choice.message.content
            if not isinstance(content, str) or not content.strip():
                raise ProviderFailure("response_parse_error", "Structured output was not returned.")
            parsed = ProviderCoachOutput.model_validate_json(content)
            diagnostics.schema_validation_state = "passed"
            diagnostics.structured_output_verified = True
            trusted = enrich_provider_output(parsed, bundle)
            validate_output(trusted, bundle)
            diagnostics.failure_stage = "accepted"
            diagnostics.evidence_validation_state = "passed"
            diagnostics.accepted_by_lapsignal = True
            diagnostics.grounded_output_accepted = True
            _STATUS.update(
                reachable=True,
                last_error_category=None,
                last_successful_request_time=datetime.now(UTC).isoformat(),
            )
            return ProviderResult(
                output=trusted,
                requested_model=self.model,
                resolved_model=completion.model,
                input_tokens=diagnostics.prompt_tokens,
                output_tokens=diagnostics.completion_tokens,
                cost_usd=diagnostics.reported_cost_usd,
                diagnostics=diagnostics,
            )
        except ProviderFailure as failure:
            _merge_transport_diagnostics(failure.diagnostics, diagnostics)
            _STATUS.update(reachable=False, last_error_category=failure.category)
            raise
        except Exception as exc:
            failure = failure_from_exception(exc, retry_count=0)
            _merge_transport_diagnostics(failure.diagnostics, diagnostics)
            _STATUS.update(reachable=False, last_error_category=failure.category)
            raise failure from exc


class OpenRouterProvider(OpenAICompatibleProvider):
    """One-shot, non-streaming Chat Completions adapter with explicit wire parsing."""

    def build_request(self, bundle: EvidenceBundle, *, max_tokens: int) -> dict[str, Any]:
        return build_openrouter_chat_request(
            bundle,
            model=self.model,
            max_tokens=max_tokens,
            routing=self._extra_body()["provider"],
            endpoint_family=DIRECT_OPENAI_ENDPOINT,
        )

    async def generate_session_debrief(
        self, bundle: EvidenceBundle, *, max_tokens: int = 500
    ) -> ProviderResult:
        request = self.build_request(bundle, max_tokens=max_tokens)
        sensitive_values = tuple(
            message["content"]
            for message in request["messages"]
            if isinstance(message, dict) and isinstance(message.get("content"), str)
        )
        stage = "local_request_construction"
        raw_response = None
        started = time.perf_counter()
        transport = ProviderDiagnostics(
            failure_stage="request_transport",
            provider_slug="openai",
            streaming=False,
            retry_count=0,
            base_contract_schema_hash=coach_schema_hash(),
            request_schema_hash=request_schema_hash(bundle),
        )
        try:
            parameters = {key: value for key, value in request.items() if key != "provider"}
            stage = "request_transport"
            raw_response = await self.client.chat.completions.with_raw_response.create(
                **parameters,
                extra_body={"provider": request["provider"]},
            )
            transport.transport_latency_ms = int((time.perf_counter() - started) * 1000)
            transport.http_status = raw_response.status_code
            for key, value in classified_response_ids(raw_response.headers).items():
                setattr(transport, key, value)
            stage = "response_parse"
            payload = raw_response.http_response.json()
            if not isinstance(payload, dict):
                raise ValueError("Chat Completions response was not a JSON object.")
            for key, value in classified_response_ids(raw_response.headers, payload).items():
                setattr(transport, key, value)
            resolved_model = payload.get("model")
            if isinstance(resolved_model, str) and 0 < len(resolved_model) <= 160:
                transport.resolved_model = resolved_model
            raw_usage = payload.get("usage")
            _capture_usage(transport, raw_usage)
            choices = payload.get("choices")
            if isinstance(choices, list) and choices and isinstance(choices[0], dict):
                raw_finish_reason = choices[0].get("finish_reason")
                if isinstance(raw_finish_reason, str):
                    transport.finish_reason = raw_finish_reason[:80]
                raw_message = choices[0].get("message")
                if isinstance(raw_message, dict):
                    refusal = raw_message.get("refusal")
                    transport.refusal_returned = isinstance(refusal, str) and bool(refusal.strip())
            if isinstance(payload.get("error"), dict):
                transport.error_in_http_200 = raw_response.status_code == 200
                failure = failure_from_payload(
                    payload,
                    http_status=raw_response.status_code,
                    headers=raw_response.headers,
                    streaming=False,
                    retry_count=0,
                    sensitive_values=sensitive_values,
                )
                raise ProviderFailure(
                    failure.category,
                    str(failure),
                    retry_after=failure.retry_after,
                    diagnostics=_merge_transport_diagnostics(failure.diagnostics, transport),
                )
            if raw_response.status_code != 200:
                raise ProviderFailure(
                    "upstream_provider_error",
                    "OpenRouter returned a non-success generation status.",
                    diagnostics=_merge_transport_diagnostics(
                        ProviderDiagnostics(
                            failure_stage="response_parse",
                            error_message="OpenRouter returned a non-success generation status.",
                        ),
                        transport,
                    ),
                )
            transport.provider_transport_verified = True
            completion = raw_response.parse()
            if not completion.choices:
                raise IndexError("Chat Completions response had no choices.")
            choice = completion.choices[0]
            transport.finish_reason = choice.finish_reason
            transport.resolved_model = completion.model
            usage = completion.usage
            _capture_usage(transport, usage)
            transport.refusal_returned = bool(
                isinstance(getattr(choice.message, "refusal", None), str)
                and choice.message.refusal.strip()
            )
            if choice.finish_reason == "length":
                raise ProviderFailure(
                    "response_parse_error",
                    "The structured response reached the token limit.",
                    diagnostics=ProviderDiagnostics(
                        failure_stage="structured_output_parse",
                        error_message="The structured response reached the token limit.",
                    ),
                )
            if choice.finish_reason != "stop":
                raise ProviderFailure(
                    "response_parse_error",
                    "The structured response did not finish normally.",
                    diagnostics=ProviderDiagnostics(
                        failure_stage="structured_output_parse",
                        error_message="The structured response did not finish normally.",
                    ),
                )
            if transport.refusal_returned:
                raise ProviderFailure(
                    "response_parse_error",
                    "The provider returned a refusal instead of coaching output.",
                    diagnostics=ProviderDiagnostics(
                        failure_stage="structured_output_parse",
                        error_message="The provider returned a refusal.",
                    ),
                )
            if usage is None:
                raise ProviderFailure(
                    "response_parse_error",
                    "The provider response did not include usage information.",
                    diagnostics=ProviderDiagnostics(
                        failure_stage="response_parse",
                        error_message="The provider response did not include usage information.",
                    ),
                )
            if completion.model != self.model:
                raise ProviderFailure(
                    "routing_error",
                    "AI provider resolved a different model than requested.",
                    diagnostics=ProviderDiagnostics(
                        failure_stage="openrouter_routing",
                        error_message="OpenRouter resolved a different model than requested.",
                    ),
                )
            content = choice.message.content
            if not isinstance(content, str) or not content.strip():
                raise ProviderFailure(
                    "response_parse_error",
                    "Chat Completions response did not contain text content.",
                    diagnostics=ProviderDiagnostics(
                        failure_stage="response_parse",
                        error_message="The provider response did not contain text content.",
                    ),
                )
            stage = "schema_validation"
            parsed = ProviderCoachOutput.model_validate_json(content)
            transport.schema_validation_state = "passed"
            transport.structured_output_verified = True
            stage = "evidence_validation"
            trusted = enrich_provider_output(parsed, bundle)
            validate_output(trusted, bundle)
            transport.failure_stage = "accepted"
            transport.evidence_validation_state = "passed"
            transport.accepted_by_lapsignal = True
            transport.grounded_output_accepted = True
            _STATUS.update(
                reachable=True,
                last_error_category=None,
                last_successful_request_time=datetime.now(UTC).isoformat(),
            )
            return ProviderResult(
                output=trusted,
                requested_model=self.model,
                resolved_model=completion.model,
                input_tokens=transport.prompt_tokens,
                output_tokens=transport.completion_tokens,
                cost_usd=transport.reported_cost_usd,
                diagnostics=transport,
            )
        except ProviderFailure as failure:
            caught_failure = failure
        except Exception as exc:
            caught_failure = failure_from_exception(
                exc,
                stage=stage,
                retry_count=0,
                sensitive_values=sensitive_values,
            )
        if raw_response is None:
            transport.transport_latency_ms = int((time.perf_counter() - started) * 1000)
        _merge_transport_diagnostics(caught_failure.diagnostics, transport)
        if stage == "schema_validation":
            caught_failure.diagnostics.schema_validation_state = "failed"
        elif stage == "evidence_validation":
            caught_failure.diagnostics.schema_validation_state = "passed"
            caught_failure.diagnostics.structured_output_verified = True
            caught_failure.diagnostics.evidence_validation_state = "failed"
        _STATUS.update(
            reachable=caught_failure.diagnostics.provider_transport_verified,
            last_error_category=caught_failure.category,
        )
        raise caught_failure


def get_provider(name: str | None = None) -> AIProvider:
    settings = get_settings()
    selected = (name or settings.ai_provider).lower()
    if selected == "rule_based":
        return RuleBasedProvider()
    if selected == "openai":
        return OpenAICompatibleProvider(
            name="openai",
            key=settings.openai_api_key,
            base_url=None,
            model=settings.openai_coach_model,
        )
    if selected == "openrouter":
        headers = {
            "HTTP-Referer": settings.openrouter_app_url,
            "X-OpenRouter-Title": settings.openrouter_app_title,
            "X-OpenRouter-Metadata": "enabled",
        }
        return OpenRouterProvider(
            name="openrouter",
            key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url,
            model=settings.openrouter_coach_model,
            headers=headers,
        )
    raise ProviderFailure("invalid_provider", "Configured AI provider is unsupported.")


async def generate_with_fallback(
    db: Session, session: dict, profile: dict, *, regenerate: bool = False, max_tokens: int = 500
) -> dict:
    bundle = evidence_bundle(session, profile)
    bundle_hash = evidence_hash(bundle)
    try:
        preflight_failures = validate_ai_preflight(local_ai_preflight_state(profile))
    except Exception:
        preflight_failures = ("local_contract_validation_failed",)
    if preflight_failures:
        result = await RuleBasedProvider().generate_session_debrief(bundle)
        result.diagnostics = ProviderDiagnostics(
            failure_stage="cloud_ai_preflight",
            error_message=f"Cloud AI preflight blocked ({preflight_failures[0]}).",
            base_contract_schema_hash=coach_schema_hash(),
            request_schema_hash=request_schema_hash(bundle),
            safe_fallback_verified=True,
        )
        return report_payload(
            result,
            bundle,
            "rule_based",
            cached=False,
            explanation=f"Cloud AI preflight blocked ({preflight_failures[0]}).",
        )
    provider = get_provider()
    requested = provider.provider_metadata()["coach_model"]
    if get_settings().ai_cache_enabled and not regenerate:
        cached_run = db.scalar(
            select(AIRun)
            .where(
                AIRun.session_id == session["id"],
                AIRun.provider == provider.name,
                AIRun.requested_model == requested,
                AIRun.evidence_hash == bundle_hash,
                AIRun.status == "success",
            )
            .order_by(desc(AIRun.created_at))
        )
        if cached_run and cached_run.response_json:
            output = AICoachOutput.model_validate(cached_run.response_json)
            result = ProviderResult(
                output=output,
                requested_model=requested,
                resolved_model=cached_run.resolved_model or requested,
                input_tokens=cached_run.input_tokens,
                output_tokens=cached_run.output_tokens,
                cost_usd=cached_run.cost_usd,
                diagnostics=(
                    ProviderDiagnostics.model_validate(
                        cached_run.response_json.get("developer_diagnostics")
                    )
                    if isinstance(cached_run.response_json.get("developer_diagnostics"), dict)
                    else None
                ),
            )
            return report_payload(result, bundle, provider.name, cached=True)
    run = AIRun(
        id=f"ai-{uuid.uuid4()}",
        session_id=session["id"],
        provider=provider.name,
        requested_model=requested,
        resolved_model=None,
        prompt_version=PROMPT_VERSION,
        output_schema_version=OUTPUT_SCHEMA_VERSION,
        evidence_hash=bundle_hash,
        cache_key=None,
        started_at=datetime.now(UTC),
        ended_at=None,
        status="running",
        error_category=None,
        cache_hit=False,
        validation_result="not_run",
        response_json=None,
    )
    db.add(run)
    db.commit()
    started = time.perf_counter()
    try:
        result = await provider.generate_session_debrief(bundle, max_tokens=max_tokens)
        run.resolved_model = result.resolved_model
        run.cache_key = cache_key(bundle_hash, provider.name, requested, result.resolved_model)
        run.status = "success"
        run.validation_result = "passed"
        run.response_json = {
            **result.output.model_dump(),
            **(
                {"developer_diagnostics": result.diagnostics.model_dump(exclude_none=True)}
                if result.diagnostics
                else {}
            ),
        }
        run.input_tokens = result.input_tokens
        run.output_tokens = result.output_tokens
        run.cost_usd = result.cost_usd
        run.ended_at = datetime.now(UTC)
        run.latency_ms = int((time.perf_counter() - started) * 1000)
        db.commit()
        return report_payload(
            result, bundle, provider.name, cached=False, generated_at=run.ended_at.isoformat()
        )
    except ProviderFailure as failure:
        fallback = await RuleBasedProvider().generate_session_debrief(bundle)
        failure.diagnostics.safe_fallback_verified = True
        fallback.diagnostics = failure.diagnostics
        fallback.requested_model = requested
        fallback.resolved_model = failure.diagnostics.resolved_model or requested
        fallback.input_tokens = failure.diagnostics.prompt_tokens
        fallback.output_tokens = failure.diagnostics.completion_tokens
        fallback.cost_usd = failure.diagnostics.reported_cost_usd
        run.status = "safe_fallback"
        run.error_category = failure.category
        run.validation_result = "provider_rejected_safe_fallback"
        run.response_json = {
            "developer_diagnostics": failure.diagnostics.model_dump(exclude_none=True)
        }
        run.resolved_model = failure.diagnostics.resolved_model
        run.input_tokens = failure.diagnostics.prompt_tokens
        run.output_tokens = failure.diagnostics.completion_tokens
        run.cost_usd = failure.diagnostics.reported_cost_usd
        run.ended_at = datetime.now(UTC)
        run.latency_ms = int((time.perf_counter() - started) * 1000)
        db.commit()
        return report_payload(
            fallback,
            bundle,
            "rule_based",
            cached=False,
            explanation=f"Cloud coaching unavailable ({failure.category}); deterministic fallback shown.",
        )


def report_payload(
    result: ProviderResult,
    bundle: EvidenceBundle,
    provider: str,
    *,
    cached: bool,
    explanation: str | None = None,
    generated_at: str | None = None,
) -> dict:
    return {
        **result.output.model_dump(),
        "id": f"report-{bundle.local_session_id}-{provider}",
        "session_id": bundle.local_session_id,
        "mode": provider,
        "label": "OpenRouter AI coaching" if provider == "openrouter" else "Rule-based coaching",
        "explanation": explanation,
        "provenance": {
            "provider": provider,
            "requested_model": result.requested_model,
            "resolved_model": result.resolved_model,
            "evidence_bundle_version": bundle.schema_version,
            "prompt_version": PROMPT_VERSION,
            "cached": cached,
            "generated_at": generated_at or datetime.now(UTC).isoformat(),
            "input_tokens": result.input_tokens,
            "output_tokens": result.output_tokens,
            "cost_usd": result.cost_usd,
            "http_status": result.diagnostics.http_status if result.diagnostics else None,
            "request_id": result.diagnostics.request_id if result.diagnostics else None,
            "finish_reason": result.diagnostics.finish_reason if result.diagnostics else None,
            "usage_returned": result.diagnostics.usage_returned if result.diagnostics else False,
            "schema_validation_state": (
                result.diagnostics.schema_validation_state if result.diagnostics else "not_run"
            ),
            "evidence_validation_state": (
                result.diagnostics.evidence_validation_state if result.diagnostics else "not_run"
            ),
            "accepted_by_lapsignal": (
                result.diagnostics.accepted_by_lapsignal if result.diagnostics else False
            ),
            "base_contract_schema_hash": (
                result.diagnostics.base_contract_schema_hash
                if result.diagnostics
                else coach_schema_hash()
            ),
            "request_schema_hash": (
                result.diagnostics.request_schema_hash
                if result.diagnostics
                else request_schema_hash(bundle)
            ),
            "provider_transport_verified": (
                result.diagnostics.provider_transport_verified if result.diagnostics else False
            ),
            "structured_output_verified": (
                result.diagnostics.structured_output_verified if result.diagnostics else False
            ),
            "grounded_output_accepted": (
                result.diagnostics.grounded_output_accepted if result.diagnostics else False
            ),
            "safe_fallback_verified": (
                result.diagnostics.safe_fallback_verified if result.diagnostics else False
            ),
        },
    }


def safe_status() -> dict:
    settings = get_settings()
    provider = get_provider()
    metadata = provider.provider_metadata()
    if provider.name != "rule_based":
        from .database import SessionLocal

        with SessionLocal() as db:
            latest = db.scalar(
                select(AIRun)
                .where(AIRun.provider == provider.name)
                .order_by(desc(AIRun.created_at))
            )
            last_success = db.scalar(
                select(AIRun)
                .where(AIRun.provider == provider.name, AIRun.status == "success")
                .order_by(desc(AIRun.created_at))
            )
            if latest:
                metadata["reachable"] = False
                metadata["last_error_category"] = latest.error_category
                if isinstance(latest.response_json, dict):
                    diagnostics = latest.response_json.get("developer_diagnostics")
                    if isinstance(diagnostics, dict):
                        metadata["last_diagnostics"] = diagnostics
                        metadata["reachable"] = bool(diagnostics.get("provider_transport_verified"))
            if last_success and last_success.ended_at:
                metadata["last_successful_request_time"] = last_success.ended_at.replace(
                    tzinfo=UTC
                ).isoformat()
    return {
        **metadata,
        "deep_model": settings.openrouter_deep_model
        if provider.name == "openrouter"
        else settings.openai_deep_model,
        "fallback_available": True,
        "canonical_env": "repository root .env",
        "integration": "direct_chat_completions_v2",
        "endpoint_family": DIRECT_OPENAI_ENDPOINT,
        "token_budget_parameter": token_budget_parameter(DIRECT_OPENAI_ENDPOINT),
        "cloud_ai_guard_active": CLOUD_AI_GUARD_ACTIVE,
        "schema_name": COACH_SCHEMA_NAME,
        "schema_hash": coach_schema_hash(),
        "base_contract_schema_hash": coach_schema_hash(),
        "streaming": False,
        "sdk_max_retries": 0,
        "configured_retry_limit": settings.ai_max_retries,
    }
