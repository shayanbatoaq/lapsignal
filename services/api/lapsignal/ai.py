from __future__ import annotations

import asyncio
import hashlib
import json
import re
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from openai import AsyncOpenAI
from openai.lib._pydantic import to_strict_json_schema
from pydantic import BaseModel, Field, model_validator
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

PROMPT_VERSION = "race-engineer-v2"
OUTPUT_SCHEMA_VERSION = "1"
COACH_SCHEMA_NAME = "lap_signal_coaching"
LEGACY_COACH_SCHEMA_HASH = "4bc590dca7118f1a4ec2f50fce09daa29618fb0fe12c3a281a7e2fa590f1da24"
COACH_STRICT_SCHEMA_HASH = "5e1d18d4a757a6ac2f145710f4cff0d231daa02e00772900a5ce0abf5f41bc6c"
OPENROUTER_CHAT_PATH = "/api/v1/chat/completions"
DIRECT_OPENAI_ENDPOINT = "direct_openai"
AZURE_ENDPOINT = "azure"
EndpointFamily = Literal["direct_openai", "azure"]
COACH_SYSTEM_PROMPT = (
    "You are LapSignal's bounded race engineer. Use only the supplied deterministic evidence. "
    "Never invent a corner, lap, delta, car, track, performance mode, or setup value. Never claim "
    "causation or an exact time gain. Return one to three calm, constructive, controller-aware "
    "actions and cite only supplied evidence IDs. Use 'Measured session zone' when no named corner "
    "is supplied. Acknowledge uncertainty."
)
_MODEL_CACHE: dict[str, tuple[datetime, dict]] = {}
_STATUS: dict[str, Any] = {
    "reachable": None,
    "last_error_category": None,
    "last_successful_request_time": None,
}


class PriorityAction(BaseModel):
    priority: int = Field(ge=1, le=3)
    title: str = Field(min_length=2, max_length=120)
    location: str = Field(min_length=1, max_length=120)
    instruction: str = Field(min_length=2, max_length=500)
    reason: str = Field(min_length=2, max_length=500)
    evidence_ids: list[str] = Field(min_length=1)
    confidence: float = Field(ge=0, le=1)
    expected_gain_seconds: None


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
    pace = session.get("metrics", {}).get("pace", {})
    findings = session.get("findings", [])[:3]
    evidence: list[dict[str, Any]] = []
    losses: list[dict[str, Any]] = []
    zones: list[dict[str, Any]] = []
    for finding in findings:
        stable_id = finding["id"]
        values = []
        for index, item in enumerate(finding.get("evidence", [])):
            evidence_id = f"{stable_id}-EV-{index + 1:03d}"
            compact = {"id": evidence_id, "finding_id": stable_id, **item}
            evidence.append(compact)
            values.append(evidence_id)
            if item.get("zone_id"):
                zones.append({"zone_id": item["zone_id"], "evidence_ids": [evidence_id]})
        losses.append(
            {
                "finding_id": stable_id,
                "title": finding.get("title"),
                "instruction": finding.get("recommended_action"),
                "confidence": finding.get("confidence"),
                "evidence_ids": values,
                "limitations": finding.get("limitations", []),
            }
        )
    laps = [
        {
            k: lap.get(k)
            for k in ("lap_number", "lap_time_ms", "valid", "quality_score", "sector_times_ms")
        }
        for lap in session.get("laps", [])
        if lap.get("lap_time_ms") is not None
    ][:20]
    context = session.get("context", session.get("context_json", {})) or {}
    return EvidenceBundle(
        session={
            "session_id": session["id"],
            "game": session.get("game_label", "F1 2021"),
            "track": session.get("track_name", context.get("track_name", "Unknown track")),
            "session_type": session.get("session_type", context.get("session_type", "Unknown")),
            "car": context.get("team_name", session.get("car_id", "Unknown car")),
            "formula": context.get("formula"),
            "performance_mode": session.get("performance_mode", "unknown"),
            "performance_mode_source": session.get("performance_mode_source", "unknown"),
            "input_device": session.get("input_device", "unknown"),
            "assist_profile": context.get("assist_profile", {}),
        },
        laps=laps,
        priority_losses=losses,
        zones=zones,
        consistency={
            k: pace.get(k)
            for k in (
                "clean_laps",
                "best_lap_ms",
                "median_lap_ms",
                "consistency_score",
                "pace_degradation_ms_per_lap",
            )
        },
        driver_profile={
            k: (profile or {}).get(k) for k in ("experience_level", "input_device", "coaching_goal")
        },
        evidence=evidence,
    )


def evidence_hash(bundle: EvidenceBundle) -> str:
    return hashlib.sha256(
        json.dumps(bundle.model_dump(), sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def coach_strict_schema() -> dict[str, Any]:
    schema = to_strict_json_schema(AICoachOutput)
    assert_strict_json_schema(schema, expected_hash=COACH_STRICT_SCHEMA_HASH)
    return schema


def coach_schema_hash() -> str:
    return canonical_json_hash(coach_strict_schema())


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
    schema = coach_strict_schema()
    request: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": COACH_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": "Create the debrief from this compact Evidence Bundle v1:\n"
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


def build_openrouter_json_object_request(
    bundle: EvidenceBundle,
    *,
    model: str,
    max_tokens: int,
    routing: dict[str, Any],
    endpoint_family: EndpointFamily = DIRECT_OPENAI_ENDPOINT,
) -> dict[str, Any]:
    request: dict[str, Any] = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": COACH_SYSTEM_PROMPT + " Return exactly one JSON object.",
            },
            {
                "role": "user",
                "content": "Create the debrief from this compact Evidence Bundle v1:\n"
                + bundle.model_dump_json(),
            },
        ],
        "stream": False,
        "tools": [],
        "reasoning_effort": "low",
        "response_format": {"type": "json_object"},
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


def validate_output(output: AICoachOutput, bundle: EvidenceBundle) -> AICoachOutput:
    known = {item["id"] for item in bundle.evidence}
    supplied = {
        evidence_id for action in output.priority_actions for evidence_id in action.evidence_ids
    }
    if output.priority_actions and (not supplied or not supplied.issubset(known)):
        raise ProviderFailure(
            "evidence_validation_error",
            "The model referenced evidence that was not supplied.",
            diagnostics=ProviderDiagnostics(
                failure_stage="evidence_validation",
                error_message="The structured response referenced unavailable evidence.",
            ),
        )
    allowed_locations = {"Measured session zone"}
    for item in bundle.evidence:
        for key in ("corner_name", "location", "zone_name", "track_location"):
            value = item.get(key)
            if isinstance(value, str) and value.strip():
                allowed_locations.add(value.strip())
    unsupported_locations = {
        action.location
        for action in output.priority_actions
        if action.location not in allowed_locations
    }
    if unsupported_locations:
        raise ProviderFailure(
            "evidence_validation_error",
            "The model supplied a location that was not present in the evidence.",
            diagnostics=ProviderDiagnostics(
                failure_stage="evidence_validation",
                error_message="The structured response invented an unavailable location.",
            ),
        )
    forbidden = re.compile(
        r"\b(?:gain|save|worth)\s+(?:about\s+)?\d+(?:\.\d+)?\s*(?:s|sec|seconds)\b", re.I
    )
    text = " ".join(
        [
            output.summary,
            output.positive,
            *(a.reason + " " + a.instruction for a in output.priority_actions),
        ]
    )
    if forbidden.search(text):
        raise ProviderFailure(
            "evidence_validation_error",
            "The model supplied an unsupported time-gain claim.",
            diagnostics=ProviderDiagnostics(
                failure_stage="evidence_validation",
                error_message="The structured response contained an unsupported numeric claim.",
            ),
        )
    mode = bundle.session.get("performance_mode")
    if mode == "unknown" and re.search(r"\b(equal|realistic) performance\b", text, re.I):
        raise ProviderFailure(
            "evidence_validation_error",
            "The model invented the car performance mode.",
            diagnostics=ProviderDiagnostics(
                failure_stage="evidence_validation",
                error_message="The structured response invented unavailable session context.",
            ),
        )
    return output


def usage_cost_usd(usage: Any | None) -> float | None:
    """Read OpenRouter's optional cost extension without exposing billing metadata."""
    if usage is None:
        return None
    extra = getattr(usage, "model_extra", None) or {}
    raw_cost = extra.get("cost")
    if raw_cost is None:
        return None
    try:
        cost = float(raw_cost)
    except (TypeError, ValueError):
        return None
    return cost if 0 <= cost <= 1 else None


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
        actions = []
        for index, loss in enumerate(bundle.priority_losses[:3]):
            actions.append(
                PriorityAction(
                    priority=index + 1,
                    title=loss["title"],
                    location="Measured session zone",
                    instruction=loss["instruction"],
                    reason="Deterministic analysis identified this as a priority.",
                    evidence_ids=loss["evidence_ids"],
                    confidence=loss["confidence"],
                    expected_gain_seconds=None,
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
        settings = get_settings()
        attempts = 0
        while True:
            try:
                completion = await self.client.chat.completions.parse(
                    model=self.model,
                    max_tokens=max_tokens,
                    reasoning_effort="low",
                    response_format=AICoachOutput,
                    tools=[],
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are LapSignal's bounded race engineer. Use only the supplied deterministic evidence. "
                                "Never invent a corner, lap, delta, car, track, performance mode, or setup value. Never claim causation or an exact time gain. "
                                "Return one to three calm, constructive, controller-aware actions and cite only supplied evidence IDs. "
                                "Use 'Measured session zone' when no named corner is supplied. Acknowledge uncertainty."
                            ),
                        },
                        {
                            "role": "user",
                            "content": "Create the debrief from this compact Evidence Bundle v1:\n"
                            + bundle.model_dump_json(),
                        },
                    ],
                    extra_body=self._extra_body(),
                )
                parsed = completion.choices[0].message.parsed
                if parsed is None:
                    raise ProviderFailure("invalid_response", "Structured output was not returned.")
                if completion.model != self.model:
                    raise ProviderFailure(
                        "model_mismatch", "AI provider resolved a different model than requested."
                    )
                validate_output(parsed, bundle)
                usage = completion.usage
                _STATUS.update(
                    reachable=True,
                    last_error_category=None,
                    last_successful_request_time=datetime.now(UTC).isoformat(),
                )
                return ProviderResult(
                    output=parsed,
                    requested_model=self.model,
                    resolved_model=completion.model,
                    input_tokens=usage.prompt_tokens if usage else None,
                    output_tokens=usage.completion_tokens if usage else None,
                    cost_usd=usage_cost_usd(usage),
                )
            except ProviderFailure as failure:
                _STATUS.update(reachable=False, last_error_category=failure.category)
                raise
            except Exception as exc:
                failure = failure_from_exception(exc, retry_count=attempts)
                _STATUS.update(reachable=False, last_error_category=failure.category)
                transient = failure.category in {
                    "timeout",
                    "rate_limited",
                    "routing_error",
                    "upstream_provider_error",
                }
                if not transient or attempts >= settings.ai_max_retries:
                    raise failure from exc
                attempts += 1
                await asyncio.sleep(
                    failure.retry_after if failure.retry_after is not None else min(2**attempts, 4)
                )


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
        settings = get_settings()
        attempts = 0
        while True:
            stage = "local_request_construction"
            raw_response = None
            caught_failure: ProviderFailure | None = None
            try:
                parameters = {key: value for key, value in request.items() if key != "provider"}
                stage = "request_transport"
                raw_response = await self.client.chat.completions.with_raw_response.create(
                    **parameters,
                    extra_body={"provider": request["provider"]},
                )
                stage = "response_parse"
                payload = raw_response.http_response.json()
                if not isinstance(payload, dict):
                    raise ValueError("Chat Completions response was not a JSON object.")
                response_ids = classified_response_ids(raw_response.headers, payload)
                if isinstance(payload.get("error"), dict):
                    raise failure_from_payload(
                        payload,
                        http_status=raw_response.status_code,
                        headers=raw_response.headers,
                        streaming=False,
                        retry_count=attempts,
                        sensitive_values=sensitive_values,
                    )
                if raw_response.status_code != 200:
                    raise ProviderFailure(
                        "upstream_provider_error",
                        "OpenRouter returned a non-success generation status.",
                        diagnostics=ProviderDiagnostics(
                            failure_stage="response_parse",
                            http_status=raw_response.status_code,
                            **response_ids,
                            error_message="OpenRouter returned a non-success generation status.",
                            streaming=False,
                            error_in_http_200=False,
                            retry_count=attempts,
                        ),
                    )
                completion = raw_response.parse()
                if not completion.choices:
                    raise IndexError("Chat Completions response had no choices.")
                choice = completion.choices[0]
                finish_reason = choice.finish_reason
                usage = completion.usage
                if finish_reason == "length":
                    raise ProviderFailure(
                        "response_parse_error",
                        "The structured response reached the token limit.",
                        diagnostics=ProviderDiagnostics(
                            failure_stage="structured_output_parse",
                            http_status=raw_response.status_code,
                            **response_ids,
                            error_message="The structured response reached the token limit.",
                            finish_reason="length",
                            streaming=False,
                            usage_returned=usage is not None,
                            retry_count=attempts,
                        ),
                    )
                if finish_reason != "stop":
                    raise ProviderFailure(
                        "response_parse_error",
                        "The structured response did not finish normally.",
                        diagnostics=ProviderDiagnostics(
                            failure_stage="structured_output_parse",
                            http_status=raw_response.status_code,
                            **response_ids,
                            error_message="The structured response did not finish normally.",
                            finish_reason=finish_reason,
                            streaming=False,
                            usage_returned=usage is not None,
                            retry_count=attempts,
                        ),
                    )
                if usage is None:
                    raise ProviderFailure(
                        "response_parse_error",
                        "The provider response did not include usage information.",
                        diagnostics=ProviderDiagnostics(
                            failure_stage="response_parse",
                            http_status=raw_response.status_code,
                            **response_ids,
                            error_message="The provider response did not include usage information.",
                            finish_reason=finish_reason,
                            streaming=False,
                            usage_returned=False,
                            retry_count=attempts,
                        ),
                    )
                content = choice.message.content
                if not isinstance(content, str) or not content.strip():
                    raise ValueError("Chat Completions response did not contain text content.")
                stage = "schema_validation"
                parsed = AICoachOutput.model_validate_json(content)
                if completion.model != self.model:
                    raise ProviderFailure(
                        "routing_error",
                        "AI provider resolved a different model than requested.",
                        diagnostics=ProviderDiagnostics(
                            failure_stage="openrouter_routing",
                            http_status=raw_response.status_code,
                            **response_ids,
                            error_message="OpenRouter resolved a different model than requested.",
                            finish_reason=finish_reason,
                            streaming=False,
                            usage_returned=usage is not None,
                            retry_count=attempts,
                        ),
                    )
                stage = "evidence_validation"
                validate_output(parsed, bundle)
                _STATUS.update(
                    reachable=True,
                    last_error_category=None,
                    last_successful_request_time=datetime.now(UTC).isoformat(),
                )
                return ProviderResult(
                    output=parsed,
                    requested_model=self.model,
                    resolved_model=completion.model,
                    input_tokens=usage.prompt_tokens if usage else None,
                    output_tokens=usage.completion_tokens if usage else None,
                    cost_usd=usage_cost_usd(usage),
                    diagnostics=ProviderDiagnostics(
                        failure_stage="accepted",
                        http_status=raw_response.status_code,
                        **response_ids,
                        finish_reason=finish_reason,
                        streaming=False,
                        error_in_http_200=False,
                        usage_returned=True,
                        retry_count=attempts,
                        schema_validation_state="passed",
                        evidence_validation_state="passed",
                        accepted_by_lapsignal=True,
                    ),
                )
            except ProviderFailure as failure:
                caught_failure = failure
                caught_failure.diagnostics.retry_count = attempts
            except Exception as exc:
                caught_failure = failure_from_exception(
                    exc,
                    stage=stage,
                    retry_count=attempts,
                    sensitive_values=sensitive_values,
                )
                if raw_response is not None:
                    response_ids = classified_response_ids(raw_response.headers)
                    caught_failure.diagnostics.http_status = raw_response.status_code
                    for key, value in response_ids.items():
                        setattr(caught_failure.diagnostics, key, value)
                    caught_failure.diagnostics.error_in_http_200 = raw_response.status_code == 200
            if caught_failure is None:
                raise RuntimeError("OpenRouter failure handling lost the original exception.")
            _STATUS.update(reachable=False, last_error_category=caught_failure.category)
            transient = caught_failure.category in {
                "timeout",
                "rate_limited",
                "routing_error",
                "upstream_provider_error",
            }
            if not transient or attempts >= settings.ai_max_retries:
                raise caught_failure
            attempts += 1
            await asyncio.sleep(
                caught_failure.retry_after
                if caught_failure.retry_after is not None
                else min(2**attempts, 4)
            )


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
        run.status = "failed"
        run.error_category = failure.category
        run.validation_result = "failed"
        run.response_json = {
            "developer_diagnostics": failure.diagnostics.model_dump(exclude_none=True)
        }
        run.ended_at = datetime.now(UTC)
        run.latency_ms = int((time.perf_counter() - started) * 1000)
        db.commit()
        fallback = await RuleBasedProvider().generate_session_debrief(bundle)
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
        "id": f"report-{bundle.session['session_id']}-{provider}",
        "session_id": bundle.session["session_id"],
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
                metadata["reachable"] = latest.status == "success"
                metadata["last_error_category"] = latest.error_category
                if isinstance(latest.response_json, dict):
                    diagnostics = latest.response_json.get("developer_diagnostics")
                    if isinstance(diagnostics, dict):
                        metadata["last_diagnostics"] = diagnostics
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
        "streaming": False,
        "sdk_max_retries": 0,
        "configured_retry_limit": settings.ai_max_retries,
    }
