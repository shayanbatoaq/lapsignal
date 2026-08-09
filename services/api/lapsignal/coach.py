from __future__ import annotations

import time
from copy import deepcopy
from datetime import UTC, datetime

from pydantic import BaseModel, Field

from .config import get_settings
from .demo import build_fallback_report
from .knowledge import search_knowledge


class PriorityOutput(BaseModel):
    title: str
    action: str
    confidence: float = Field(ge=0, le=1)
    evidence_ids: list[str] = Field(min_length=1)


class CoachOutput(BaseModel):
    session_summary: str
    top_priorities: list[PriorityOutput] = Field(max_length=3)
    what_improved: str
    what_regressed: str
    next_stint_plan: str
    confidence_summary: str
    limitations: list[str]
    evidence_references: list[str]


def fallback_report(session: dict, extra_limitation: str | None = None) -> dict:
    report = deepcopy(build_fallback_report(session))
    if extra_limitation:
        report["limitations"].append(extra_limitation)
    return report


async def generate_coach_report(session: dict) -> dict:
    settings = get_settings()
    if not settings.openai_api_key:
        return fallback_report(session)

    started = time.perf_counter()
    try:
        from agents import Agent, Runner, function_tool

        compact_summary = {
            "session_id": session["id"],
            "track": session["track_name"],
            "car_class": session["car_class"],
            "input_device": session["input_device"],
            "metrics": session["metrics"],
        }
        findings = session["findings"]

        @function_tool
        def get_session_summary(session_id: str) -> dict:
            """Return compact deterministic metrics for the selected session."""
            return compact_summary if session_id == session["id"] else {"error": "unknown session"}

        @function_tool
        def get_top_findings(session_id: str) -> list[dict]:
            """Return at most three stored findings with evidence."""
            return findings[:3] if session_id == session["id"] else []

        @function_tool
        def get_lap_comparison(session_id: str, lap_a: int, lap_b: int) -> dict:
            """Return stored lap summaries for two lap numbers; never raw telemetry."""
            if session_id != session["id"]:
                return {"error": "unknown session"}
            selected = [
                {key: lap.get(key) for key in ("lap_number", "lap_time_ms", "valid", "quality_score", "sector_times_ms")}
                for lap in session["laps"]
                if lap["lap_number"] in {lap_a, lap_b}
            ]
            return {"laps": selected, "reference": "selected session laps"}

        @function_tool
        def get_finding_evidence(finding_id: str) -> dict:
            """Return evidence for one known deterministic finding."""
            return next(
                (item for item in findings if item["id"] == finding_id),
                {"error": "unknown finding"},
            )

        @function_tool
        def get_stint_analysis(session_id: str) -> dict:
            """Return deterministic stint metrics and limitations."""
            return session["metrics"]["stint"] if session_id == session["id"] else {}

        @function_tool
        def get_driver_progress(session_id: str) -> dict:
            """Return only the within-session development indicators available to this run."""
            if session_id != session["id"]:
                return {"error": "unknown session"}
            return {
                "consistency_score": session["metrics"]["pace"]["consistency_score"],
                "phase_consistency": session["metrics"]["stint"]["phase_consistency"],
                "limitation": "Cross-session progress is not supplied to this report run.",
            }

        @function_tool
        def search_coaching_knowledge(query: str) -> list[dict]:
            """Retrieve up to three short original coaching principles by tag or text."""
            return search_knowledge(query)

        agent = Agent(
            name="LapSignal coach",
            model=settings.openai_coach_model,
            instructions=(
                "You are one evidence-backed sim-racing coach. Use only tool-returned metrics and findings. "
                "Return no more than three priorities. Every claim must reference a valid finding ID. "
                "Never promise lap time, invent a reference, diagnose vehicle balance as fact, or give wheel-specific "
                "advice to a controller user. Preserve units and admit missing data."
            ),
            tools=[
                get_session_summary,
                get_top_findings,
                get_lap_comparison,
                get_finding_evidence,
                get_stint_analysis,
                get_driver_progress,
                search_coaching_knowledge,
            ],
            output_type=CoachOutput,
        )
        result = await Runner.run(
            agent,
            f"Build the post-stint report for session {session['id']}. Retrieve findings and evidence first.",
        )
        output: CoachOutput = result.final_output
        report = output.model_dump()
        valid_ids = {finding["id"] for finding in findings}
        supplied_ids = set(report["evidence_references"])
        if not supplied_ids or not supplied_ids.issubset(valid_ids):
            raise ValueError("coach returned unsupported evidence references")
        report.update(
            {
                "id": f"report-{session['id']}-cloud",
                "session_id": session["id"],
                "mode": "openai",
                "label": "OpenAI-generated coach",
                "provenance": {
                    "fallback_used": False,
                    "model_id": settings.openai_coach_model,
                    "prompt_version": "coach-v1",
                    "analysis_version": "0.1.0",
                    "finding_ids": sorted(supplied_ids),
                    "tool_calls": [
                        "get_session_summary",
                        "get_top_findings",
                        "get_finding_evidence",
                        "get_lap_comparison",
                        "get_stint_analysis",
                        "get_driver_progress",
                        "search_coaching_knowledge",
                    ],
                    "token_usage": None,
                    "latency_ms": int((time.perf_counter() - started) * 1000),
                    "timestamp": datetime.now(UTC).isoformat(),
                    "response_status": "complete",
                    "git_sha": settings.git_sha,
                },
            }
        )
        return report
    except Exception:
        return fallback_report(
            session,
            "Cloud coach was unavailable; this report uses the deterministic evidence fallback.",
        )


def answer_question(session: dict, question: str) -> dict:
    terms = question.lower()
    findings = session["findings"]
    matched = next(
        (
            finding
            for finding in findings
            if any(token in terms for token in finding["type"].split("_"))
        ),
        findings[0] if findings else None,
    )
    if not matched:
        return {
            "answer": "There are not enough clean-lap findings to answer that from this session.",
            "evidence_ids": [],
            "limitations": ["Insufficient clean-lap evidence."],
            "mode": "rule_based",
        }
    return {
        "answer": f"{matched['plain_language']} {matched['recommended_action']}",
        "evidence_ids": [matched["id"]],
        "limitations": matched["limitations"],
        "mode": "rule_based",
    }
