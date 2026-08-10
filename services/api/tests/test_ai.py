from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from openai import APIStatusError, AsyncOpenAI
from openai.lib._pydantic import to_strict_json_schema
from pydantic import BaseModel

import lapsignal.ai as ai_module
from lapsignal.ai import (
    COACH_SCHEMA_NAME,
    COACH_STRICT_SCHEMA_HASH,
    OPENROUTER_CHAT_PATH,
    AICoachOutput,
    OpenAICompatibleProvider,
    OpenRouterProvider,
    PriorityAction,
    ProviderDiagnostics,
    ProviderFailure,
    build_openrouter_chat_request,
    build_openrouter_json_object_request,
    cache_key,
    coach_schema_hash,
    coach_strict_schema,
    evidence_bundle,
    evidence_hash,
    generate_with_fallback,
    get_provider,
    summarize_chat_request,
    usage_cost_usd,
    validate_output,
)
from lapsignal.ai_contracts import (
    SchemaContractError,
    assert_strict_json_schema,
    audit_strict_json_schema,
    endpoint_compatibility,
    parse_endpoint_metadata,
)
from lapsignal.ai_diagnostics import (
    classified_response_ids,
    failure_from_payload,
    sanitize_provider_message,
)
from lapsignal.config import get_settings
from lapsignal.demo import get_demo_sessions


@pytest.fixture(autouse=True)
def offline_provider_settings(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "ai_max_retries", 0)
    ai_module._MODEL_CACHE.clear()


def valid_output(bundle, *, evidence_id: str | None = None):
    return AICoachOutput(
        summary="Measured execution varied.",
        positive="A clean baseline exists.",
        priority_actions=[
            PriorityAction(
                priority=1,
                title="Stabilize release",
                location="Measured session zone",
                instruction="Release the brake progressively.",
                reason="The supplied evidence shows release variation.",
                evidence_ids=[evidence_id or bundle.evidence[0]["id"]],
                confidence=0.8,
                expected_gain_seconds=None,
            )
        ],
        limitations=[],
    )


def completion_payload(
    bundle,
    *,
    model: str = "openai/gpt-5-mini",
    content: str | None = None,
    finish_reason: str = "stop",
    include_usage: bool = True,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": "mock-completion",
        "object": "chat.completion",
        "created": 1,
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": content or valid_output(bundle).model_dump_json(),
                },
                "finish_reason": finish_reason,
            }
        ],
    }
    if include_usage:
        payload["usage"] = {
            "prompt_tokens": 100,
            "completion_tokens": 80,
            "total_tokens": 180,
            "cost": 0.000185,
        }
    return payload


def provider_with_transport(handler):
    model = "openai/gpt-5-mini"

    async def dispatch(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/models"):
            return httpx.Response(
                200,
                json={
                    "object": "list",
                    "data": [{"id": model, "object": "model", "created": 0, "owned_by": "openai"}],
                },
            )
        return await handler(request)

    http_client = httpx.AsyncClient(transport=httpx.MockTransport(dispatch))
    provider = OpenRouterProvider(
        name="openrouter",
        key="mock-key",
        base_url="https://openrouter.invalid/api/v1",
        model=model,
    )
    provider.client = AsyncOpenAI(
        api_key="mock-key",
        base_url="https://openrouter.invalid/api/v1",
        max_retries=0,
        http_client=http_client,
    )
    return provider, http_client


def run_provider(handler, *, bundle=None, max_tokens: int = 1500):
    provider, http_client = provider_with_transport(handler)
    selected_bundle = bundle or evidence_bundle(get_demo_sessions()[0])

    async def execute():
        try:
            return await provider.generate_session_debrief(selected_bundle, max_tokens=max_tokens)
        finally:
            await http_client.aclose()

    return asyncio.run(execute())


def test_openrouter_configuration_and_custom_url(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "openrouter_api_key", None)
    monkeypatch.setattr(settings, "openrouter_base_url", "https://router.invalid/v1")
    provider = get_provider("openrouter")
    assert isinstance(provider, OpenRouterProvider)
    assert provider.is_configured() is False
    assert str(provider.client.base_url) == "https://router.invalid/v1/"
    assert provider.provider_metadata()["configured"] is False


def test_openrouter_headers_and_privacy_routing(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "openrouter_api_key", "synthetic")
    monkeypatch.setattr(settings, "openrouter_zdr", True)
    provider = get_provider("openrouter")
    assert provider.client.default_headers["HTTP-Referer"] == settings.openrouter_app_url
    assert provider.client.default_headers["X-OpenRouter-Title"] == "LapSignal"
    assert provider.client.default_headers["X-OpenRouter-Metadata"] == "enabled"
    assert provider._extra_body()["provider"] == {
        "data_collection": "deny",
        "require_parameters": True,
        "zdr": True,
    }
    assert "synthetic" not in str(provider.provider_metadata())


def test_evidence_is_compact_stable_and_redacted():
    bundle = evidence_bundle(get_demo_sessions()[0], {"experience_level": "intermediate"})
    text = bundle.model_dump_json()
    assert '"telemetry"' not in text and "api_key" not in text and "file_path" not in text
    assert evidence_hash(bundle) == evidence_hash(bundle)
    assert cache_key("a", "openrouter", "m", "m") == cache_key("a", "openrouter", "m", "m")


def test_structured_validation_rejects_unknown_evidence_and_gain():
    bundle = evidence_bundle(get_demo_sessions()[0])
    output = valid_output(bundle)
    assert validate_output(output, bundle) == output
    output.priority_actions[0].evidence_ids = ["EV-NOT-SUPPLIED"]
    with pytest.raises(ProviderFailure, match="not supplied") as evidence_failure:
        validate_output(output, bundle)
    assert evidence_failure.value.category == "evidence_validation_error"
    assert evidence_failure.value.diagnostics.failure_stage == "evidence_validation"
    output = valid_output(bundle)
    output.priority_actions[0].reason = "This will save 0.4 seconds."
    with pytest.raises(ProviderFailure, match="unsupported") as claim_failure:
        validate_output(output, bundle)
    assert claim_failure.value.category == "evidence_validation_error"


def test_structured_validation_rejects_an_invented_track_location():
    bundle = evidence_bundle(get_demo_sessions()[0])
    output = valid_output(bundle)
    output.priority_actions[0].location = "Copse"
    with pytest.raises(ProviderFailure, match="not present") as location_failure:
        validate_output(output, bundle)
    assert location_failure.value.category == "evidence_validation_error"
    assert location_failure.value.diagnostics.failure_stage == "evidence_validation"


@pytest.mark.parametrize(
    "status,error_type,category",
    [
        (400, "invalid_request", "invalid_request"),
        (401, "authentication", "authentication_error"),
        (402, "payment_required", "insufficient_credits"),
        (429, "rate_limit_exceeded", "rate_limited"),
        (500, "server", "upstream_provider_error"),
    ],
)
def test_http_error_transport_classification(status, error_type, category):
    async def handler(_request):
        return httpx.Response(
            status,
            headers={"x-request-id": f"req-{status}", "retry-after": "2"},
            json={
                "error": {
                    "code": status,
                    "message": "Malformed request" if status == 400 else "Provider failure",
                    "metadata": {
                        "error_type": error_type,
                        "provider_code": "safe_provider_code",
                    },
                }
            },
        )

    with pytest.raises(ProviderFailure) as exc_info:
        run_provider(handler)
    failure = exc_info.value
    assert failure.category == category
    assert failure.diagnostics.http_status == status
    assert failure.diagnostics.request_id == f"req-{status}"
    assert failure.diagnostics.sdk_exception_type
    assert failure.diagnostics.error_type == error_type
    assert failure.diagnostics.provider_code == "safe_provider_code"
    assert failure.diagnostics.streaming is False
    assert failure.diagnostics.error_in_http_200 is False
    assert failure.diagnostics.retry_count == 0


def test_http_400_unsupported_parameter_is_not_generic():
    response = httpx.Response(
        400,
        request=httpx.Request("POST", "https://openrouter.invalid/api/v1/chat/completions"),
        json={
            "error": {
                "code": 400,
                "message": "Parameter 'verbosity' is not supported",
                "metadata": {"error_type": "invalid_request"},
            }
        },
    )
    failure = OpenAICompatibleProvider._failure(
        APIStatusError("failure", response=response, body=response.json())
    )
    assert failure.category == "unsupported_parameter"
    assert failure.diagnostics.failure_stage == "openrouter_request_validation"
    assert failure.diagnostics.error_message == "Unsupported request parameter: verbosity."


def test_exact_top_level_400_retains_a_safe_provider_message():
    message = (
        "Invalid schema for response_format 'lap_signal_coaching': "
        "additionalProperties must be false."
    )
    failure = failure_from_payload(
        {"error": {"code": 400, "message": message, "metadata": {}}},
        http_status=400,
        headers={"cf-ray": "a29192af1e38a07f-KHI"},
    )
    diagnostics = failure.diagnostics
    assert failure.category == "invalid_request"
    assert diagnostics.provider_message == message
    assert diagnostics.provider_message_state == "safe_exact"
    assert diagnostics.provider_message_length == len(message)
    assert diagnostics.provider_message_sha256 == hashlib.sha256(message.encode()).hexdigest()
    assert diagnostics.request_id is None
    assert diagnostics.cloudflare_ray_id == "a29192af1e38a07f-KHI"


def test_provider_message_is_redacted_when_it_overlaps_prompt_or_secret_content():
    prompt = "Synthetic private evidence bundle with measured release timing"
    message = f"Invalid request: {prompt} secret-token"
    sanitized = sanitize_provider_message(message, sensitive_values=(prompt,))
    assert sanitized["provider_message_state"] == "redacted"
    assert prompt not in str(sanitized["provider_message"])
    assert sanitized["provider_message_length"] == len(message)
    assert sanitized["provider_message_sha256"] == hashlib.sha256(message.encode()).hexdigest()


def test_response_identifiers_are_classified_without_collapsing_cloudflare_ray():
    identifiers = classified_response_ids(
        {
            "cf-ray": "a29192af1e38a07f-KHI",
            "x-openrouter-request-id": "or-trace-123",
            "x-request-id": "req-456",
            "x-generation-id": "gen-header-789",
        },
        {"id": "gen-body-unused"},
    )
    assert identifiers == {
        "request_id": "or-trace-123",
        "cloudflare_ray_id": "a29192af1e38a07f-KHI",
        "openrouter_request_id": "or-trace-123",
        "x_request_id": "req-456",
        "generation_id": "gen-header-789",
    }


def test_non_streaming_http_200_embedded_error_preserves_safe_diagnostics():
    async def handler(_request):
        return httpx.Response(
            200,
            headers={"x-openrouter-request-id": "or-embedded-1"},
            json={
                "error": {
                    "code": 502,
                    "message": "Provider returned an empty response",
                    "metadata": {
                        "error_type": "provider_unavailable",
                        "provider_code": "empty_response",
                    },
                },
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": ""},
                        "finish_reason": "error",
                    }
                ],
                "usage": {"prompt_tokens": 100, "completion_tokens": 0, "total_tokens": 100},
                "openrouter_metadata": {
                    "requested": "openai/gpt-5-mini",
                    "strategy": "direct",
                    "attempt": 1,
                    "is_byok": False,
                    "summary": "must not be persisted",
                    "attempts": [{"provider": "OpenAI", "model": "gpt-5-mini", "status": 502}],
                },
            },
        )

    with pytest.raises(ProviderFailure) as exc_info:
        run_provider(handler)
    diagnostics = exc_info.value.diagnostics
    assert exc_info.value.category == "upstream_provider_error"
    assert diagnostics.http_status == 200
    assert diagnostics.error_in_http_200 is True
    assert diagnostics.finish_reason == "error"
    assert diagnostics.usage_returned is True
    assert diagnostics.request_id == "or-embedded-1"
    assert diagnostics.routing_metadata == {
        "requested": "openai/gpt-5-mini",
        "strategy": "direct",
        "attempt": 1,
        "is_byok": False,
        "attempts": [{"provider": "OpenAI", "model": "gpt-5-mini", "status": 502}],
    }


def test_streaming_sse_error_envelope_is_classified_without_streaming_request():
    failure = failure_from_payload(
        {
            "error": {
                "code": 429,
                "message": "Rate limit exceeded",
                "metadata": {
                    "error_type": "rate_limit_exceeded",
                    "provider_code": "rate_limited",
                },
            },
            "choices": [{"index": 0, "delta": {"content": ""}, "finish_reason": "error"}],
        },
        http_status=200,
        headers={"x-request-id": "sse-1"},
        streaming=True,
    )
    assert failure.category == "stream_error"
    assert failure.diagnostics.failure_stage == "response_stream"
    assert failure.diagnostics.finish_reason == "error"
    assert failure.diagnostics.error_in_http_200 is True
    assert failure.diagnostics.error_type == "rate_limit_exceeded"


def test_malformed_json_is_response_parse_error():
    async def handler(_request):
        return httpx.Response(
            200,
            headers={"content-type": "application/json", "x-request-id": "malformed-1"},
            content=b"{not-valid-json",
        )

    with pytest.raises(ProviderFailure) as exc_info:
        run_provider(handler)
    assert exc_info.value.category == "response_parse_error"
    assert exc_info.value.diagnostics.failure_stage == "response_parse"
    assert exc_info.value.diagnostics.http_status == 200
    assert exc_info.value.diagnostics.request_id == "malformed-1"


def test_valid_json_that_fails_pydantic_schema():
    bundle = evidence_bundle(get_demo_sessions()[0])

    async def handler(_request):
        return httpx.Response(
            200,
            json=completion_payload(bundle, content=json.dumps({"summary": "Incomplete"})),
        )

    with pytest.raises(ProviderFailure) as exc_info:
        run_provider(handler, bundle=bundle)
    assert exc_info.value.category == "schema_validation_error"
    assert exc_info.value.diagnostics.failure_stage == "schema_validation"


def test_length_finish_reason_records_truncation_before_schema_validation():
    bundle = evidence_bundle(get_demo_sessions()[0])

    async def handler(_request):
        return httpx.Response(
            200,
            headers={"x-request-id": "length-1"},
            json=completion_payload(bundle, finish_reason="length"),
        )

    with pytest.raises(ProviderFailure) as exc_info:
        run_provider(handler, bundle=bundle)
    diagnostics = exc_info.value.diagnostics
    assert exc_info.value.category == "response_parse_error"
    assert diagnostics.failure_stage == "structured_output_parse"
    assert diagnostics.finish_reason == "length"
    assert diagnostics.usage_returned is True
    assert diagnostics.request_id == "length-1"


def test_non_stop_finish_reason_is_rejected_before_schema_validation():
    bundle = evidence_bundle(get_demo_sessions()[0])

    async def handler(_request):
        return httpx.Response(
            200,
            headers={"x-request-id": "filtered-1"},
            json=completion_payload(bundle, finish_reason="content_filter"),
        )

    with pytest.raises(ProviderFailure) as exc_info:
        run_provider(handler, bundle=bundle)
    diagnostics = exc_info.value.diagnostics
    assert exc_info.value.category == "response_parse_error"
    assert diagnostics.finish_reason == "content_filter"
    assert diagnostics.schema_validation_state == "not_run"


def test_missing_usage_is_rejected_before_schema_validation():
    bundle = evidence_bundle(get_demo_sessions()[0])

    async def handler(_request):
        return httpx.Response(
            200,
            headers={"x-request-id": "usage-1"},
            json=completion_payload(bundle, include_usage=False),
        )

    with pytest.raises(ProviderFailure) as exc_info:
        run_provider(handler, bundle=bundle)
    diagnostics = exc_info.value.diagnostics
    assert exc_info.value.category == "response_parse_error"
    assert diagnostics.usage_returned is False
    assert diagnostics.request_id == "usage-1"


def test_success_records_only_sanitized_acceptance_diagnostics():
    bundle = evidence_bundle(get_demo_sessions()[0])

    async def handler(_request):
        return httpx.Response(
            200,
            headers={"x-request-id": "accepted-1"},
            json=completion_payload(bundle),
        )

    result = run_provider(handler, bundle=bundle)
    assert result.diagnostics is not None
    assert result.diagnostics.http_status == 200
    assert result.diagnostics.request_id == "accepted-1"
    assert result.diagnostics.finish_reason == "stop"
    assert result.diagnostics.retry_count == 0
    assert result.diagnostics.schema_validation_state == "passed"
    assert result.diagnostics.evidence_validation_state == "passed"
    assert result.diagnostics.accepted_by_lapsignal is True


def test_valid_schema_with_unsupported_evidence_reference():
    bundle = evidence_bundle(get_demo_sessions()[0])
    content = valid_output(bundle, evidence_id="NOT-SUPPLIED").model_dump_json()

    async def handler(_request):
        return httpx.Response(200, json=completion_payload(bundle, content=content))

    with pytest.raises(ProviderFailure) as exc_info:
        run_provider(handler, bundle=bundle)
    assert exc_info.value.category == "evidence_validation_error"
    assert exc_info.value.diagnostics.failure_stage == "evidence_validation"


def test_timeout_is_sanitized_and_not_retried():
    calls = 0

    async def handler(request):
        nonlocal calls
        calls += 1
        raise httpx.ReadTimeout("synthetic timeout", request=request)

    with pytest.raises(ProviderFailure) as exc_info:
        run_provider(handler)
    assert calls == 1
    assert exc_info.value.category == "timeout"
    assert exc_info.value.diagnostics.retry_count == 0
    assert exc_info.value.diagnostics.sdk_exception_type == "APITimeoutError"


@pytest.mark.parametrize(
    "category",
    [
        "authentication_error",
        "insufficient_credits",
        "invalid_request",
        "unsupported_parameter",
        "routing_error",
        "upstream_provider_error",
        "rate_limited",
        "timeout",
        "stream_error",
        "response_parse_error",
        "schema_validation_error",
        "evidence_validation_error",
    ],
)
def test_safe_rule_fallback_for_every_provider_failure(monkeypatch, category):
    class FailingProvider:
        name = "openrouter"

        def is_configured(self):
            return True

        def provider_metadata(self):
            return {"coach_model": "openai/gpt-5-mini"}

        async def generate_session_debrief(self, _bundle, *, max_tokens=500):
            raise ProviderFailure(
                category,
                "Safe provider failure.",
                diagnostics=ProviderDiagnostics(
                    failure_stage="mocked_failure",
                    error_message="Safe provider failure.",
                ),
            )

    class FakeDB:
        def __init__(self):
            self.added = []

        def add(self, value):
            self.added.append(value)

        def commit(self):
            return None

    monkeypatch.setattr(ai_module, "get_provider", lambda _name=None: FailingProvider())
    db = FakeDB()
    result = asyncio.run(
        generate_with_fallback(
            db,
            get_demo_sessions()[0],
            {"ai_consent": True, "cloud_ai_enabled": True},
            regenerate=True,
        )
    )
    assert result["mode"] == "rule_based"
    assert result["priority_actions"]
    assert db.added[0].status == "failed"
    assert db.added[0].error_category == category
    assert db.added[0].response_json["developer_diagnostics"]["failure_stage"] == ("mocked_failure")


def test_sanitized_diagnostics_contain_no_key_prompt_or_raw_metadata(caplog):
    secret = "test-secret-value-never-log"
    prompt = "Create the debrief from private telemetry evidence"
    failure = failure_from_payload(
        {
            "error": {
                "code": 400,
                "message": f"Invalid request {secret}: {prompt}",
                "metadata": {
                    "error_type": "invalid_request",
                    "provider_code": "invalid_payload",
                    "raw_body": prompt,
                },
            },
            "openrouter_metadata": {
                "requested": "openai/gpt-5-mini",
                "strategy": "direct",
                "data": {"authorization": secret, "prompt": prompt},
            },
        },
        http_status=400,
        headers={"authorization": f"Bearer {secret}", "x-request-id": "safe-id"},
    )
    serialized = json.dumps(failure.diagnostics.model_dump())
    assert secret not in serialized
    assert prompt not in serialized
    assert "authorization" not in serialized.lower()
    assert secret not in caplog.text and prompt not in caplog.text


def test_exact_chat_completions_wire_serialization_is_offline_and_not_mixed():
    bundle = evidence_bundle(get_demo_sessions()[0])
    captured: dict[str, Any] = {}

    async def handler(request):
        captured["path"] = request.url.path
        captured["method"] = request.method
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json=completion_payload(bundle))

    result = run_provider(handler, bundle=bundle)
    body = captured["body"]
    summary = summarize_chat_request(body)
    assert result.resolved_model == "openai/gpt-5-mini"
    assert captured["path"] == OPENROUTER_CHAT_PATH
    assert captured["method"] == "POST"
    assert summary == {
        "endpoint_path": OPENROUTER_CHAT_PATH,
        "http_method": "POST",
        "parameter_names": [
            "max_tokens",
            "messages",
            "model",
            "provider",
            "reasoning_effort",
            "response_format",
            "stream",
        ],
        "requested_model": "openai/gpt-5-mini",
        "streaming_mode": False,
        "structured_output_mode": "json_schema",
        "tool_count": 0,
        "schema_name": COACH_SCHEMA_NAME,
        "schema_hash": coach_schema_hash(),
        "token_budget_fields": {"max_tokens": 1500},
        "optional_routing_field_names": ["data_collection", "require_parameters"],
    }
    assert body["response_format"] == {
        "type": "json_schema",
        "json_schema": {
            "name": COACH_SCHEMA_NAME,
            "strict": True,
            "schema": coach_strict_schema(),
        },
    }
    assert body["stream"] is False
    assert "verbosity" not in body
    assert "tools" not in body and "tool_choice" not in body
    assert "input" not in body and "text" not in body and "text_format" not in body


def test_request_builder_has_no_responses_api_fields():
    request = build_openrouter_chat_request(
        evidence_bundle(get_demo_sessions()[0]),
        model="openai/gpt-5-mini",
        max_tokens=1500,
        routing={"data_collection": "deny", "require_parameters": True},
    )
    assert request["response_format"]["type"] == "json_schema"
    assert "text" not in request and "input" not in request
    assert summarize_chat_request(request)["endpoint_path"].endswith("/chat/completions")


def test_official_client_strict_schema_is_the_runtime_contract():
    schema = coach_strict_schema()
    audit = assert_strict_json_schema(schema, expected_hash=COACH_STRICT_SCHEMA_HASH)
    assert schema == to_strict_json_schema(AICoachOutput)
    assert coach_schema_hash() == COACH_STRICT_SCHEMA_HASH
    assert audit.valid
    assert audit.root_type == "object"
    assert audit.root_has_any_of is False
    assert audit.property_count == 12
    assert audit.max_nesting_depth == 2
    assert audit.enum_value_count == 0


def test_invalid_strict_schema_reports_every_json_pointer():
    invalid = {
        "type": "object",
        "properties": {
            "optional": {"type": ["string", "null"], "default": None},
            "nested": {
                "type": "object",
                "properties": {"value": {"type": "string"}},
                "required": ["value"],
            },
        },
        "required": ["nested"],
        "allOf": [],
    }
    with pytest.raises(SchemaContractError) as exc_info:
        assert_strict_json_schema(invalid)
    pointers = {(item.pointer, item.code) for item in exc_info.value.audit.violations}
    assert ("/required", "property_not_required") in pointers
    assert ("/additionalProperties", "additional_properties_not_false") in pointers
    assert ("/properties/optional/default", "pydantic_default_present") in pointers
    assert (
        "/properties/nested/additionalProperties",
        "additional_properties_not_false",
    ) in pointers
    assert ("/allOf", "unsupported_composition_keyword") in pointers


def test_optional_pydantic_field_fails_manually_but_official_helper_makes_it_required_nullable():
    class OptionalOutput(BaseModel):
        value: str | None = None

    manual = audit_strict_json_schema(OptionalOutput.model_json_schema())
    assert {item.code for item in manual.violations} >= {
        "property_not_required",
        "additional_properties_not_false",
        "pydantic_default_present",
    }
    strict = to_strict_json_schema(OptionalOutput)
    assert assert_strict_json_schema(strict).valid
    assert strict["required"] == ["value"]
    assert {branch.get("type") for branch in strict["properties"]["value"]["anyOf"]} == {
        "string",
        "null",
    }


def test_schema_contract_fails_before_provider_health_or_generation():
    calls = {"health": 0}

    class InvalidContractProvider(OpenRouterProvider):
        def build_request(self, _bundle, *, max_tokens):
            assert_strict_json_schema(
                {"type": "object", "properties": {"value": {"type": "string"}}}
            )
            raise AssertionError("unreachable")

        async def health_check(self):
            calls["health"] += 1
            return {"reachable": True}

    provider = InvalidContractProvider(
        name="openrouter",
        key="synthetic",
        base_url="https://example.invalid/api/v1",
        model="openai/gpt-5-mini",
    )
    with pytest.raises(SchemaContractError):
        asyncio.run(provider.generate_session_debrief(evidence_bundle(get_demo_sessions()[0])))
    assert calls["health"] == 0


def test_endpoint_metadata_parsing_and_exact_parameter_compatibility():
    endpoints = parse_endpoint_metadata(
        {
            "data": {
                "endpoints": [
                    {
                        "provider_name": "OpenAI",
                        "name": "OpenAI | openai/gpt-5-mini-2025-08-07",
                        "status": 0,
                        "max_completion_tokens": 128000,
                        "supported_parameters": [
                            "max_tokens",
                            "reasoning_effort",
                            "response_format",
                            "structured_outputs",
                        ],
                        "pricing": {"prompt": "0.00000025", "completion": "0.000002"},
                    }
                ]
            }
        }
    )
    assert len(endpoints) == 1
    endpoint = endpoints[0]
    assert endpoint.provider_name == "OpenAI"
    assert endpoint.available is True
    assert endpoint.max_completion_tokens == 128000
    assert endpoint.data_policy_compatible is None
    assert endpoint.zdr_compatible is None

    strict_request = build_openrouter_chat_request(
        evidence_bundle(get_demo_sessions()[0]),
        model="openai/gpt-5-mini",
        max_tokens=1500,
        routing={"data_collection": "deny", "require_parameters": True},
    )
    assert endpoint_compatibility(strict_request, endpoint)["parameter_compatible"] is True
    incompatible = {**strict_request}
    incompatible["max_completion_tokens"] = incompatible.pop("max_tokens")
    comparison = endpoint_compatibility(incompatible, endpoint)
    assert comparison["parameter_compatible"] is False
    assert comparison["missing_parameters"] == ["max_completion_tokens"]


def test_json_object_candidate_is_explicit_and_keeps_local_validation_contract():
    request = build_openrouter_json_object_request(
        evidence_bundle(get_demo_sessions()[0]),
        model="openai/gpt-5-mini",
        max_tokens=1500,
        routing={"data_collection": "deny", "require_parameters": True},
    )
    summary = summarize_chat_request(request)
    assert request["response_format"] == {"type": "json_object"}
    assert summary["structured_output_mode"] == "json_object"
    assert summary["schema_hash"] == COACH_STRICT_SCHEMA_HASH
    assert "max_tokens" in request and "max_completion_tokens" not in request
    assert "JSON object" in request["messages"][0]["content"]


def test_disabled_cloud_gate_returns_safe_fallback_without_provider_call(monkeypatch):
    class GuardProvider:
        name = "openrouter"

        def is_configured(self):
            return True

        def provider_metadata(self):
            return {"coach_model": "openai/gpt-5-mini"}

        async def generate_session_debrief(self, _bundle, *, max_tokens=500):
            raise AssertionError("Cloud provider must not be called while its gate is disabled")

    class NoopDB:
        pass

    monkeypatch.setattr(ai_module, "get_provider", lambda _name=None: GuardProvider())
    result = asyncio.run(
        generate_with_fallback(
            NoopDB(),
            get_demo_sessions()[0],
            {"ai_consent": True, "cloud_ai_enabled": False},
        )
    )
    assert result["mode"] == "rule_based"
    assert result["explanation"] == "Cloud AI requires both consent controls."


def test_invalid_model_is_actionable(monkeypatch):
    provider = OpenRouterProvider(
        name="openrouter",
        key="synthetic",
        base_url="https://example.invalid/v1",
        model="missing/model",
    )

    class Models:
        async def list(self):
            return type("Response", (), {"data": []})()

    monkeypatch.setattr(provider.client, "models", Models())
    with pytest.raises(ProviderFailure, match="model slug") as exc_info:
        asyncio.run(provider.health_check())
    assert exc_info.value.category == "invalid_request"
    assert exc_info.value.diagnostics.failure_stage == "model_validation"


def test_openrouter_usage_cost_is_sanitized():
    assert usage_cost_usd(SimpleNamespace(model_extra={"cost": "0.00314"})) == 0.00314
    assert usage_cost_usd(SimpleNamespace(model_extra={"cost": "not-a-number"})) is None
    assert usage_cost_usd(SimpleNamespace(model_extra={"cost": 5})) is None
    assert usage_cost_usd(None) is None


def test_resolved_model_mismatch_is_rejected_without_retry():
    bundle = evidence_bundle(get_demo_sessions()[0])

    async def handler(_request):
        return httpx.Response(
            200,
            json=completion_payload(bundle, model="different/model"),
        )

    with pytest.raises(ProviderFailure, match="different model") as exc_info:
        run_provider(handler, bundle=bundle)
    assert exc_info.value.category == "routing_error"
    assert exc_info.value.diagnostics.retry_count == 0


def test_diagnostic_timestamp_inputs_never_require_prompt_data():
    diagnostics = ProviderDiagnostics(
        failure_stage="response_parse",
        request_id="safe-request-id",
        error_message="Safe diagnostic.",
    )
    record = {
        "recorded_at": datetime.now(UTC).isoformat(),
        "diagnostics": diagnostics.model_dump(exclude_none=True),
    }
    assert "messages" not in json.dumps(record)
