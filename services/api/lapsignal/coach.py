from __future__ import annotations

from .ai import generate_with_fallback


async def generate_coach_report(db, session: dict, profile: dict, regenerate: bool = False) -> dict:
    return await generate_with_fallback(db, session, profile, regenerate=regenerate)


def answer_question(session: dict, question: str) -> dict:
    terms = question.lower()
    findings = session.get("findings", [])
    matched = next(
        (
            finding
            for finding in findings
            if any(token in terms for token in finding.get("type", "").split("_"))
        ),
        findings[0] if findings else None,
    )
    if not matched:
        return {
            "answer": "There is not enough clean-lap evidence to answer that.",
            "evidence_ids": [],
            "limitations": ["Insufficient clean-lap evidence."],
            "mode": "rule_based",
        }
    return {
        "answer": f"{matched['plain_language']} {matched['recommended_action']}",
        "evidence_ids": [matched["id"]],
        "limitations": matched.get("limitations", []),
        "mode": "rule_based",
    }


def build_rule_based_report(session: dict) -> dict:
    """Build the durable local report from deterministic, stored evidence."""
    findings = session.get("findings", [])[:3]
    best = session.get("metrics", {}).get("pace", {}).get("best_lap_ms")
    consistency = session.get("metrics", {}).get("pace", {}).get("consistency_score")
    finding_ids = [finding["id"] for finding in findings]
    return {
        "id": f"report-{session['id']}",
        "session_id": session["id"],
        "mode": "rule_based",
        "label": "Rule-based coaching",
        "session_summary": (
            f"{len(session['laps'])} attempts were preserved. Invalid lap times remain "
            "excluded from personal-best timing, while usable braking, throttle, and steering "
            "evidence remains available for coaching."
            if best is None
            else f"{len(session['laps'])} laps analyzed; best clean lap {best} ms with a "
            f"{consistency}/100 consistency score."
        ),
        "top_priorities": [
            {
                "title": finding["title"],
                "action": finding["recommended_action"],
                "confidence": finding["confidence"],
                "evidence_ids": [finding["id"]],
            }
            for finding in findings
        ],
        "what_improved": (
            "Technique evidence from invalid attempts remains usable even though official lap "
            "timing is excluded."
            if best is None
            else "The most repeatable clean laps preserve progressive control inputs after "
            "minimum speed."
        ),
        "what_regressed": (
            "The closing phase shows more variation."
            if session["metrics"]["stint"]["increasing_error_frequency"]
            else "No material regression is supported by this stint."
        ),
        "next_stint_plan": (
            "Complete five controlled laps: repeat the same initial brake markers, release "
            "progressively, and review only after the stint."
        ),
        "confidence_summary": (
            "Official timing confidence is intentionally withheld; technique findings use only "
            "directly measured control evidence."
            if best is None
            else "High confidence in recorded lap-time metrics; technique findings use comparable "
            "clean laps and explicitly labelled attempts."
        ),
        "limitations": session["metrics"]["pace"]["limitations"]
        + session["metrics"]["stint"]["limitations"],
        "evidence_references": finding_ids,
        "provenance": {
            "fallback_used": True,
            "model_id": None,
            "prompt_version": "race-engineer-v3",
            "analysis_version": "0.1.0",
            "finding_ids": finding_ids,
            "tool_calls": [],
            "token_usage": None,
            "latency_ms": 0,
            "response_status": "complete",
            "git_sha": "local",
        },
    }
