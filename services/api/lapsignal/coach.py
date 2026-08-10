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
