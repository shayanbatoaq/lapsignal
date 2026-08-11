from __future__ import annotations

import asyncio
import hashlib
import json
import re
from collections.abc import Mapping
from typing import Any

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    ContentFilterFinishReasonError,
    LengthFinishReasonError,
)
from pydantic import BaseModel, Field, ValidationError


class ProviderDiagnostics(BaseModel):
    failure_stage: str
    http_status: int | None = None
    request_id: str | None = None
    cloudflare_ray_id: str | None = None
    openrouter_request_id: str | None = None
    x_request_id: str | None = None
    generation_id: str | None = None
    provider_slug: str | None = None
    resolved_model: str | None = None
    sdk_exception_type: str | None = None
    error_code: int | str | None = None
    error_message: str | None = None
    provider_message: str | None = None
    provider_message_state: str = "absent"
    provider_message_length: int | None = Field(default=None, ge=0)
    provider_message_sha256: str | None = None
    error_type: str | None = None
    provider_code: int | str | None = None
    routing_metadata: dict[str, Any] | None = None
    finish_reason: str | None = None
    streaming: bool = False
    refusal_returned: bool = False
    error_in_http_200: bool = False
    usage_returned: bool = False
    prompt_tokens: int | None = Field(default=None, ge=0)
    completion_tokens: int | None = Field(default=None, ge=0)
    reasoning_tokens: int | None = Field(default=None, ge=0)
    total_tokens: int | None = Field(default=None, ge=0)
    reported_cost_usd: float | None = Field(default=None, ge=0, le=1)
    transport_latency_ms: int | None = Field(default=None, ge=0)
    retry_count: int = Field(default=0, ge=0)
    endpoint_path: str = "/api/v1/chat/completions"
    base_contract_schema_hash: str | None = None
    request_schema_hash: str | None = None
    schema_validation_state: str = "not_run"
    evidence_validation_state: str = "not_run"
    accepted_by_lapsignal: bool = False
    provider_transport_verified: bool = False
    structured_output_verified: bool = False
    grounded_output_accepted: bool = False
    safe_fallback_verified: bool = False


class ProviderFailure(Exception):
    def __init__(
        self,
        category: str,
        message: str,
        *,
        retry_after: float | None = None,
        diagnostics: ProviderDiagnostics | None = None,
    ):
        super().__init__(message)
        self.category = category
        self.retry_after = retry_after
        self.diagnostics = diagnostics or ProviderDiagnostics(
            failure_stage="unknown",
            error_message=message,
        )


_SAFE_PARAMETER_NAMES = (
    "verbosity",
    "reasoning_effort",
    "response_format",
    "max_completion_tokens",
    "max_tokens",
    "messages",
    "model",
    "provider",
    "stream",
    "tools",
    "tool_choice",
)

_ERROR_TYPE_CATEGORIES = {
    "authentication": "authentication_error",
    "permission_denied": "authentication_error",
    "payment_required": "insufficient_credits",
    "rate_limit_exceeded": "rate_limited",
    "provider_overloaded": "upstream_provider_error",
    "provider_unavailable": "upstream_provider_error",
    "server": "upstream_provider_error",
    "unmapped": "upstream_provider_error",
    "timeout": "timeout",
    "invalid_request": "invalid_request",
    "invalid_prompt": "invalid_request",
    "not_found": "invalid_request",
    "precondition_failed": "invalid_request",
    "payload_too_large": "invalid_request",
    "unprocessable": "invalid_request",
    "context_length_exceeded": "invalid_request",
    "max_tokens_exceeded": "response_parse_error",
    "token_limit_exceeded": "response_parse_error",
    "string_too_long": "invalid_request",
    "content_policy_violation": "invalid_request",
    "refusal": "invalid_request",
}

_HTTP_CATEGORIES = {
    400: "invalid_request",
    401: "authentication_error",
    402: "insufficient_credits",
    403: "authentication_error",
    408: "timeout",
    409: "invalid_request",
    412: "invalid_request",
    413: "invalid_request",
    422: "invalid_request",
    429: "rate_limited",
    500: "upstream_provider_error",
    502: "upstream_provider_error",
    503: "routing_error",
    504: "timeout",
}


def _safe_identifier(value: Any) -> int | str | None:
    if isinstance(value, int):
        return value
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value[:80] if value and re.fullmatch(r"[A-Za-z0-9_.:/-]+", value) else None


def _header(headers: Mapping[str, str] | None, name: str) -> Any:
    if not headers:
        return None
    direct = headers.get(name)
    if direct is not None:
        return direct
    lowered = name.lower()
    return next((value for key, value in headers.items() if key.lower() == lowered), None)


def classified_response_ids(
    headers: Mapping[str, str] | None,
    payload: Any = None,
    *,
    explicit_x_request_id: Any = None,
) -> dict[str, str | None]:
    cloudflare_ray_id = _safe_identifier(_header(headers, "cf-ray"))
    openrouter_request_id = next(
        (
            value
            for value in (
                _safe_identifier(_header(headers, "x-openrouter-request-id")),
                _safe_identifier(_header(headers, "x-openrouter-trace-id")),
                _safe_identifier(_header(headers, "x-trace-id")),
                _safe_identifier(_header(headers, "trace-id")),
            )
            if isinstance(value, str)
        ),
        None,
    )
    x_request_id = _safe_identifier(explicit_x_request_id) or _safe_identifier(
        _header(headers, "x-request-id")
    )
    generation_id = _safe_identifier(_header(headers, "x-generation-id"))
    if generation_id is None and isinstance(payload, dict):
        generation_id = _safe_identifier(payload.get("id"))
    if not isinstance(generation_id, str) or not generation_id.startswith("gen-"):
        generation_id = None
    request_id = openrouter_request_id or (x_request_id if isinstance(x_request_id, str) else None)
    return {
        "request_id": request_id,
        "cloudflare_ray_id": (cloudflare_ray_id if isinstance(cloudflare_ray_id, str) else None),
        "openrouter_request_id": openrouter_request_id,
        "x_request_id": x_request_id if isinstance(x_request_id, str) else None,
        "generation_id": generation_id,
    }


def safe_request_id(headers: Mapping[str, str] | None, explicit: Any = None) -> str | None:
    """Backward-compatible canonical request ID; Cloudflare Ray IDs are deliberately excluded."""
    return classified_response_ids(headers, explicit_x_request_id=explicit)["request_id"]


def _unsupported_parameter(message: Any) -> str | None:
    if not isinstance(message, str):
        return None
    lowered = message.lower()
    if not any(word in lowered for word in ("unsupported", "not supported", "unknown parameter")):
        return None
    return next((name for name in _SAFE_PARAMETER_NAMES if name in lowered), None)


def _safe_error_message(category: str, raw_message: Any) -> str:
    parameter = _unsupported_parameter(raw_message)
    if parameter:
        return f"Unsupported request parameter: {parameter}."
    messages = {
        "authentication_error": "OpenRouter authentication failed.",
        "insufficient_credits": "OpenRouter reported insufficient credits.",
        "invalid_request": "OpenRouter rejected the request parameters.",
        "unsupported_parameter": "OpenRouter rejected an unsupported request parameter.",
        "routing_error": "OpenRouter found no compatible provider route.",
        "upstream_provider_error": "The upstream provider reported an error.",
        "rate_limited": "The provider rate-limited the request.",
        "timeout": "The provider request timed out.",
        "stream_error": "The provider stream ended with an error.",
        "response_parse_error": "The provider response could not be parsed safely.",
        "schema_validation_error": "The structured response failed schema validation.",
        "integration_error": "The AI integration failed before producing a valid response.",
    }
    return messages.get(category, "The AI provider request failed.")


_GENERIC_PROVIDER_MESSAGES = {
    "bad request",
    "invalid request",
    "internal server error",
    "provider error",
    "request failed",
}
_SENSITIVE_MESSAGE_PATTERN = re.compile(
    r"(?:authorization|bearer\s+|api[_ -]?key|secret|sk-or-v1-|\bsk-[A-Za-z0-9_-]{12,}|"
    r"evidence bundle|system prompt|raw telemetry|messages\s*[:=]\s*\[)",
    re.I,
)


def _overlaps_sensitive_values(message: str, sensitive_values: tuple[str, ...]) -> bool:
    lowered = message.lower()
    for sensitive in sensitive_values:
        if not sensitive:
            continue
        normalized = sensitive.lower()
        if len(lowered) >= 16 and lowered in normalized:
            return True
        words = re.findall(r"\S+", normalized)
        for index in range(max(0, len(words) - 3)):
            phrase = " ".join(words[index : index + 4]).strip(".,:;\"'{}[]()")
            if len(phrase) >= 20 and phrase in lowered:
                return True
    return False


def sanitize_provider_message(
    raw_message: Any, *, sensitive_values: tuple[str, ...] = ()
) -> dict[str, int | str | None]:
    if not isinstance(raw_message, str):
        return {
            "provider_message": None,
            "provider_message_state": "absent",
            "provider_message_length": None,
            "provider_message_sha256": None,
        }
    length = len(raw_message)
    digest = hashlib.sha256(raw_message.encode()).hexdigest()
    contains_control = any(
        ord(character) < 32 and character not in "\t\r\n" for character in raw_message
    )
    unsafe = (
        length > 2_000
        or contains_control
        or _SENSITIVE_MESSAGE_PATTERN.search(raw_message) is not None
        or _overlaps_sensitive_values(raw_message, sensitive_values)
    )
    if unsafe:
        safe_message = f"[redacted provider message; length={length}; sha256={digest}]"
        state = "redacted"
    else:
        safe_message = raw_message
        state = (
            "generic" if raw_message.strip().lower() in _GENERIC_PROVIDER_MESSAGES else "safe_exact"
        )
    return {
        "provider_message": safe_message,
        "provider_message_state": state,
        "provider_message_length": length,
        "provider_message_sha256": digest,
    }


def _safe_routing_metadata(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    safe: dict[str, Any] = {}
    for key in ("requested", "strategy", "region", "attempt", "is_byok"):
        if key not in value:
            continue
        item = value.get(key)
        if isinstance(item, (str, int, bool)) or item is None:
            safe[key] = item
    endpoints = value.get("endpoints")
    if isinstance(endpoints, dict):
        safe_endpoints: dict[str, Any] = {}
        if isinstance(endpoints.get("total"), int):
            safe_endpoints["total"] = endpoints["total"]
        available = endpoints.get("available")
        if isinstance(available, list):
            safe_endpoints["available"] = [
                {
                    key: item[key]
                    for key in ("provider", "model", "selected")
                    if key in item and isinstance(item[key], (str, bool))
                }
                for item in available[:8]
                if isinstance(item, dict)
            ]
        if safe_endpoints:
            safe["endpoints"] = safe_endpoints
    attempts = value.get("attempts")
    if isinstance(attempts, list):
        safe["attempts"] = [
            {
                key: item[key]
                for key in ("provider", "model", "status")
                if key in item and isinstance(item[key], (str, int))
            }
            for item in attempts[:8]
            if isinstance(item, dict)
        ]
    pipeline = value.get("pipeline")
    if isinstance(pipeline, list):
        safe["pipeline"] = [
            {
                key: item[key]
                for key in ("type", "name")
                if key in item and isinstance(item[key], str)
            }
            for item in pipeline[:8]
            if isinstance(item, dict)
        ]
    return safe or None


def _finish_reason(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        return None
    return _safe_identifier(choices[0].get("finish_reason"))  # type: ignore[return-value]


def _failure_stage(category: str, *, streaming: bool, http_status: int | None) -> str:
    if streaming:
        return "response_stream"
    if category in {"authentication_error", "insufficient_credits"}:
        return "openrouter_authentication"
    if category in {"invalid_request", "unsupported_parameter"}:
        return "openrouter_request_validation"
    if category == "routing_error":
        return "openrouter_routing"
    if category in {"upstream_provider_error", "rate_limited"}:
        return "upstream_provider_processing"
    if category == "timeout":
        return "request_transport"
    return "response_parse"


def failure_from_payload(
    payload: Any,
    *,
    http_status: int,
    headers: Mapping[str, str] | None = None,
    streaming: bool = False,
    sdk_exception_type: str | None = None,
    retry_count: int = 0,
    sensitive_values: tuple[str, ...] = (),
    explicit_x_request_id: Any = None,
) -> ProviderFailure:
    error = payload.get("error") if isinstance(payload, dict) else None
    error = error if isinstance(error, dict) else {}
    metadata = error.get("metadata")
    metadata = metadata if isinstance(metadata, dict) else {}
    error_type = _safe_identifier(metadata.get("error_type"))
    if error_type is None and isinstance(payload, dict):
        error_type = _safe_identifier(payload.get("error_type"))
    error_code = _safe_identifier(error.get("code"))
    effective_status = error_code if isinstance(error_code, int) else http_status
    raw_message = error.get("message")
    category = _ERROR_TYPE_CATEGORIES.get(str(error_type), _HTTP_CATEGORIES.get(effective_status))
    category = category or ("stream_error" if streaming else "upstream_provider_error")
    if _unsupported_parameter(raw_message):
        category = "unsupported_parameter"
    if streaming:
        category = "stream_error"
    finish_reason = _finish_reason(payload)
    identifiers = classified_response_ids(
        headers,
        payload,
        explicit_x_request_id=explicit_x_request_id,
    )
    provider_message = sanitize_provider_message(raw_message, sensitive_values=sensitive_values)
    diagnostics = ProviderDiagnostics(
        failure_stage=_failure_stage(category, streaming=streaming, http_status=http_status),
        http_status=http_status,
        **identifiers,
        sdk_exception_type=sdk_exception_type,
        error_code=error_code,
        error_message=_safe_error_message(category, raw_message),
        **provider_message,
        error_type=error_type,
        provider_code=_safe_identifier(metadata.get("provider_code")),
        routing_metadata=_safe_routing_metadata(
            payload.get("openrouter_metadata") if isinstance(payload, dict) else None
        ),
        finish_reason=finish_reason,
        streaming=streaming,
        error_in_http_200=http_status == 200,
        usage_returned=isinstance(payload, dict) and payload.get("usage") is not None,
        retry_count=retry_count,
    )
    retry_value = headers.get("retry-after") if headers else None
    try:
        retry_after = min(float(retry_value), 10.0) if retry_value else None
    except (TypeError, ValueError):
        retry_after = None
    return ProviderFailure(
        category,
        diagnostics.error_message or "The AI provider request failed.",
        retry_after=retry_after,
        diagnostics=diagnostics,
    )


def failure_from_exception(
    exc: Exception,
    *,
    stage: str = "request_transport",
    streaming: bool = False,
    retry_count: int = 0,
    sensitive_values: tuple[str, ...] = (),
) -> ProviderFailure:
    exception_type = type(exc).__name__
    if isinstance(exc, APIStatusError):
        payload = exc.body if isinstance(exc.body, dict) else {}
        if exc.response is not None:
            try:
                response_payload = exc.response.json()
            except (json.JSONDecodeError, UnicodeDecodeError):
                response_payload = None
            if isinstance(response_payload, dict):
                payload = response_payload
        if "error" not in payload and any(
            key in payload for key in ("code", "message", "metadata")
        ):
            payload = {"error": payload}
        failure = failure_from_payload(
            payload,
            http_status=exc.status_code,
            headers=exc.response.headers if exc.response else None,
            streaming=streaming,
            sdk_exception_type=exception_type,
            retry_count=retry_count,
            sensitive_values=sensitive_values,
            explicit_x_request_id=getattr(exc, "request_id", None),
        )
        return failure
    if isinstance(exc, (APITimeoutError, asyncio.TimeoutError)):
        category, safe_stage = "timeout", stage
    elif isinstance(exc, APIConnectionError):
        category, safe_stage = "upstream_provider_error", "request_transport"
    elif isinstance(exc, LengthFinishReasonError):
        category, safe_stage = "response_parse_error", "structured_output_parse"
    elif isinstance(exc, ContentFilterFinishReasonError):
        category, safe_stage = "response_parse_error", "structured_output_parse"
    elif isinstance(exc, ValidationError):
        category, safe_stage = "schema_validation_error", "schema_validation"
    elif isinstance(exc, (json.JSONDecodeError, UnicodeDecodeError, IndexError)):
        category, safe_stage = "response_parse_error", "response_parse"
    elif isinstance(exc, (TypeError, ValueError)):
        category, safe_stage = "integration_error", "local_request_construction"
    else:
        category, safe_stage = "integration_error", stage
    diagnostics = ProviderDiagnostics(
        failure_stage=safe_stage,
        sdk_exception_type=exception_type,
        error_message=_safe_error_message(category, str(exc)),
        finish_reason=(
            "length"
            if isinstance(exc, LengthFinishReasonError)
            else "content_filter"
            if isinstance(exc, ContentFilterFinishReasonError)
            else None
        ),
        streaming=streaming,
        retry_count=retry_count,
    )
    return ProviderFailure(
        category, diagnostics.error_message or "AI provider failure.", diagnostics=diagnostics
    )
