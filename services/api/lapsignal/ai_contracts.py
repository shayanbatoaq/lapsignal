from __future__ import annotations

import hashlib
import json
from typing import Any

from pydantic import BaseModel, Field

MAX_SCHEMA_PROPERTIES = 5_000
MAX_SCHEMA_NESTING_DEPTH = 10
MAX_SCHEMA_STRING_CHARACTERS = 120_000
MAX_ENUM_VALUES = 1_000
MAX_LARGE_ENUM_STRING_CHARACTERS = 15_000
UNSUPPORTED_COMPOSITION_KEYWORDS = frozenset(
    {"allOf", "oneOf", "not", "dependentRequired", "dependentSchemas", "if", "then", "else"}
)


def canonical_json_hash(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def _escape_pointer(value: str) -> str:
    return value.replace("~", "~0").replace("/", "~1")


def _pointer(path: tuple[str, ...]) -> str:
    return "" if not path else "/" + "/".join(_escape_pointer(item) for item in path)


class SchemaViolation(BaseModel):
    pointer: str
    code: str
    detail: str


class SchemaAudit(BaseModel):
    schema_hash: str
    root_type: str | None
    root_has_any_of: bool
    property_count: int = Field(ge=0)
    max_nesting_depth: int = Field(ge=0)
    enum_value_count: int = Field(ge=0)
    schema_string_characters: int = Field(ge=0)
    violations: list[SchemaViolation]

    @property
    def valid(self) -> bool:
        return not self.violations


class SchemaContractError(ValueError):
    def __init__(self, audit: SchemaAudit):
        self.audit = audit
        summary = ", ".join(
            f"{item.code}@{item.pointer or '<root>'}" for item in audit.violations[:8]
        )
        super().__init__(f"Strict JSON Schema contract failed: {summary}")


def _resolve_local_ref(root: dict[str, Any], ref: str) -> Any:
    if ref == "#":
        return root
    if not ref.startswith("#/"):
        raise ValueError("Only local JSON Pointer references are supported")
    current: Any = root
    for raw_part in ref[2:].split("/"):
        part = raw_part.replace("~1", "/").replace("~0", "~")
        if not isinstance(current, dict) or part not in current:
            raise KeyError(part)
        current = current[part]
    return current


def audit_strict_json_schema(schema: dict[str, Any]) -> SchemaAudit:
    violations: list[SchemaViolation] = []
    property_count = 0
    enum_value_count = 0
    schema_string_characters = 0

    if schema.get("type") != "object":
        violations.append(
            SchemaViolation(
                pointer="/type", code="root_not_object", detail="Root type must be object."
            )
        )
    if "anyOf" in schema:
        violations.append(
            SchemaViolation(
                pointer="/anyOf",
                code="root_any_of_unsupported",
                detail="Root objects must not use anyOf.",
            )
        )

    def walk(node: Any, path: tuple[str, ...] = ()) -> None:
        nonlocal property_count, enum_value_count, schema_string_characters
        if isinstance(node, list):
            for index, item in enumerate(node):
                walk(item, (*path, str(index)))
            return
        if not isinstance(node, dict):
            return

        for keyword in UNSUPPORTED_COMPOSITION_KEYWORDS.intersection(node):
            violations.append(
                SchemaViolation(
                    pointer=_pointer((*path, keyword)),
                    code="unsupported_composition_keyword",
                    detail=f"{keyword} is outside the supported strict-schema subset.",
                )
            )

        properties = node.get("properties")
        is_object = node.get("type") == "object" or isinstance(properties, dict)
        if is_object:
            if not isinstance(properties, dict):
                properties = {}
            required = node.get("required")
            required_values = set(required) if isinstance(required, list) else set()
            property_count += len(properties)
            schema_string_characters += sum(len(str(name)) for name in properties)
            for name in properties:
                if name not in required_values:
                    violations.append(
                        SchemaViolation(
                            pointer=_pointer((*path, "required")),
                            code="property_not_required",
                            detail=f"Property {name!r} must be listed in required.",
                        )
                    )
            if node.get("additionalProperties") is not False:
                violations.append(
                    SchemaViolation(
                        pointer=_pointer((*path, "additionalProperties")),
                        code="additional_properties_not_false",
                        detail="Every object must set additionalProperties to false.",
                    )
                )

        if "default" in node:
            violations.append(
                SchemaViolation(
                    pointer=_pointer((*path, "default")),
                    code="pydantic_default_present",
                    detail="Defaults can make a strict output field optional.",
                )
            )

        definitions = node.get("$defs")
        if isinstance(definitions, dict):
            schema_string_characters += sum(len(str(name)) for name in definitions)

        enum = node.get("enum")
        if isinstance(enum, list):
            enum_value_count += len(enum)
            enum_strings = [item for item in enum if isinstance(item, str)]
            enum_characters = sum(len(item) for item in enum_strings)
            schema_string_characters += enum_characters
            if len(enum) > 250 and enum_characters > MAX_LARGE_ENUM_STRING_CHARACTERS:
                violations.append(
                    SchemaViolation(
                        pointer=_pointer((*path, "enum")),
                        code="large_enum_string_limit_exceeded",
                        detail="An enum with more than 250 values exceeds 15,000 string characters.",
                    )
                )
        const = node.get("const")
        if isinstance(const, str):
            schema_string_characters += len(const)

        ref = node.get("$ref")
        if isinstance(ref, str):
            try:
                _resolve_local_ref(schema, ref)
            except (KeyError, ValueError):
                violations.append(
                    SchemaViolation(
                        pointer=_pointer((*path, "$ref")),
                        code="unresolved_ref",
                        detail=f"Reference {ref!r} does not resolve within $defs.",
                    )
                )

        for key, value in node.items():
            walk(value, (*path, str(key)))

    walk(schema)

    def nesting_depth(
        node: Any,
        depth: int = 0,
        ref_stack: tuple[str, ...] = (),
    ) -> int:
        if not isinstance(node, dict):
            return depth
        ref = node.get("$ref")
        if isinstance(ref, str):
            if ref in ref_stack:
                return depth
            try:
                return nesting_depth(_resolve_local_ref(schema, ref), depth, (*ref_stack, ref))
            except (KeyError, ValueError):
                return depth
        next_depth = depth + 1 if node.get("type") == "object" else depth
        children: list[Any] = []
        properties = node.get("properties")
        if isinstance(properties, dict):
            children.extend(properties.values())
        items = node.get("items")
        if isinstance(items, dict):
            children.append(items)
        any_of = node.get("anyOf")
        if isinstance(any_of, list):
            children.extend(any_of)
        return max(
            [next_depth, *(nesting_depth(child, next_depth, ref_stack) for child in children)]
        )

    max_depth = nesting_depth(schema)
    if property_count > MAX_SCHEMA_PROPERTIES:
        violations.append(
            SchemaViolation(
                pointer="/properties",
                code="property_limit_exceeded",
                detail=f"Schema has {property_count} properties; limit is {MAX_SCHEMA_PROPERTIES}.",
            )
        )
    if max_depth > MAX_SCHEMA_NESTING_DEPTH:
        violations.append(
            SchemaViolation(
                pointer="",
                code="nesting_limit_exceeded",
                detail=f"Schema depth is {max_depth}; limit is {MAX_SCHEMA_NESTING_DEPTH}.",
            )
        )
    if enum_value_count > MAX_ENUM_VALUES:
        violations.append(
            SchemaViolation(
                pointer="",
                code="enum_limit_exceeded",
                detail=f"Schema has {enum_value_count} enum values; limit is {MAX_ENUM_VALUES}.",
            )
        )
    if schema_string_characters > MAX_SCHEMA_STRING_CHARACTERS:
        violations.append(
            SchemaViolation(
                pointer="",
                code="schema_string_limit_exceeded",
                detail=(
                    f"Schema uses {schema_string_characters} counted string characters; "
                    f"limit is {MAX_SCHEMA_STRING_CHARACTERS}."
                ),
            )
        )

    return SchemaAudit(
        schema_hash=canonical_json_hash(schema),
        root_type=schema.get("type") if isinstance(schema.get("type"), str) else None,
        root_has_any_of="anyOf" in schema,
        property_count=property_count,
        max_nesting_depth=max_depth,
        enum_value_count=enum_value_count,
        schema_string_characters=schema_string_characters,
        violations=violations,
    )


def assert_strict_json_schema(
    schema: dict[str, Any], *, expected_hash: str | None = None
) -> SchemaAudit:
    audit = audit_strict_json_schema(schema)
    if expected_hash is not None and audit.schema_hash != expected_hash:
        audit.violations.append(
            SchemaViolation(
                pointer="",
                code="schema_hash_mismatch",
                detail=f"Schema hash {audit.schema_hash} does not match the offline contract.",
            )
        )
    if not audit.valid:
        raise SchemaContractError(audit)
    return audit


class EndpointCapability(BaseModel):
    provider_name: str | None = None
    name: str | None = None
    status: int | str | bool | None = None
    available: bool | None = None
    supported_parameters: frozenset[str] = frozenset()
    max_completion_tokens: int | None = None
    data_policy_compatible: bool | None = None
    zdr_compatible: bool | None = None
    prompt_price_per_token: float | None = None
    completion_price_per_token: float | None = None


def parse_endpoint_metadata(payload: dict[str, Any]) -> list[EndpointCapability]:
    data = payload.get("data")
    endpoints = data.get("endpoints") if isinstance(data, dict) else None
    if not isinstance(endpoints, list):
        return []
    parsed: list[EndpointCapability] = []
    for endpoint in endpoints:
        if not isinstance(endpoint, dict):
            continue
        raw_parameters = endpoint.get("supported_parameters")
        parameters = frozenset(value for value in raw_parameters or [] if isinstance(value, str))
        status = endpoint.get("status")
        available = (
            status in (0, "available", "online", True)
            if isinstance(status, (int, str, bool))
            else None
        )
        policy = endpoint.get("data_policy")
        data_policy_compatible = None
        if isinstance(policy, dict):
            declared = policy.get("data_collection")
            if declared in ("deny", "none", False):
                data_policy_compatible = True
            elif declared in ("allow", "required", True):
                data_policy_compatible = False
        zdr_compatible = next(
            (
                endpoint[key]
                for key in ("zdr", "supports_zdr", "is_zdr", "zdr_compatible")
                if isinstance(endpoint.get(key), bool)
            ),
            None,
        )
        pricing = endpoint.get("pricing")

        def price(name: str, raw_pricing: Any = pricing) -> float | None:
            if not isinstance(raw_pricing, dict):
                return None
            try:
                return float(raw_pricing.get(name))
            except (TypeError, ValueError):
                return None

        parsed.append(
            EndpointCapability(
                provider_name=(
                    endpoint.get("provider_name")
                    if isinstance(endpoint.get("provider_name"), str)
                    else None
                ),
                name=endpoint.get("name") if isinstance(endpoint.get("name"), str) else None,
                status=status if isinstance(status, (int, str, bool)) else None,
                available=available,
                supported_parameters=parameters,
                max_completion_tokens=(
                    endpoint.get("max_completion_tokens")
                    if isinstance(endpoint.get("max_completion_tokens"), int)
                    else None
                ),
                data_policy_compatible=data_policy_compatible,
                zdr_compatible=zdr_compatible,
                prompt_price_per_token=price("prompt"),
                completion_price_per_token=price("completion"),
            )
        )
    return parsed


def required_endpoint_parameters(request: dict[str, Any]) -> frozenset[str]:
    required = {
        key
        for key in (
            "reasoning_effort",
            "max_tokens",
            "max_completion_tokens",
            "temperature",
            "top_p",
            "seed",
        )
        if key in request
    }
    response_format = request.get("response_format")
    if isinstance(response_format, dict):
        required.add("response_format")
        if response_format.get("type") == "json_schema":
            required.add("structured_outputs")
    if request.get("tools"):
        required.add("tools")
    return frozenset(required)


def endpoint_compatibility(request: dict[str, Any], endpoint: EndpointCapability) -> dict[str, Any]:
    required = required_endpoint_parameters(request)
    missing = sorted(required.difference(endpoint.supported_parameters))
    return {
        "provider_name": endpoint.provider_name,
        "available": endpoint.available,
        "required_parameters": sorted(required),
        "missing_parameters": missing,
        "parameter_compatible": not missing,
        "data_policy_compatible": endpoint.data_policy_compatible,
        "zdr_compatible": endpoint.zdr_compatible,
    }
