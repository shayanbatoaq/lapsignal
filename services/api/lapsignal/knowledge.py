from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class KnowledgeNote:
    tag: str
    title: str
    text: str
    related: tuple[str, ...] = ()


# Short, original notes written for LapSignal. They are principles, not substitute evidence.
NOTES = (
    KnowledgeNote(
        "braking",
        "Repeatable braking",
        "Choose a visible marker, build pressure deliberately, and change only one part of the braking event between comparison runs.",
        ("consistency", "wheel", "controller"),
    ),
    KnowledgeNote(
        "brake_release",
        "Brake release",
        "A progressive release preserves load transfer and makes the transition to steering easier to repeat than an abrupt release.",
        ("braking", "trail_braking"),
    ),
    KnowledgeNote(
        "trail_braking",
        "Trail-braking fundamentals",
        "Reduce brake pressure as steering demand rises; treat overlap as a measured transition, not a target to maximize in every corner.",
        ("brake_release", "corner_exit"),
    ),
    KnowledgeNote(
        "throttle",
        "Throttle application",
        "Reconnect after minimum speed with one progressive application, adding modulation only when the available grip requires it.",
        ("corner_exit", "tyre_management"),
    ),
    KnowledgeNote(
        "corner_exit",
        "Corner exit",
        "Prioritize an unwindable steering path and a repeatable throttle pickup before chasing one unusually fast exit.",
        ("throttle", "consistency"),
    ),
    KnowledgeNote(
        "consistency",
        "Consistency",
        "A controlled block of clean laps reveals technique more reliably than one isolated peak lap; keep the task and reference stable.",
        ("endurance", "braking"),
    ),
    KnowledgeNote(
        "controller",
        "Controller inputs",
        "Expect small high-frequency stick corrections and assess them with device-aware thresholds; smooth the intent without demanding wheel-like traces.",
        ("consistency", "throttle"),
    ),
    KnowledgeNote(
        "wheel",
        "Wheel inputs",
        "Look for a deliberate steering build and unwind, while avoiding unnecessary reversals that are not supported by the corner or grip state.",
        ("consistency", "corner_exit"),
    ),
    KnowledgeNote(
        "tyre_management",
        "Tyre management",
        "Judge management from sustained pace and measured wear or temperature channels; do not infer tyre condition from lap time alone.",
        ("endurance", "throttle"),
    ),
    KnowledgeNote(
        "fuel_management",
        "Fuel management",
        "Only compare fuel-corrected pace when fuel quantity and enough comparable laps are present; label strategic lift-and-coast separately from hesitation.",
        ("endurance", "throttle"),
    ),
    KnowledgeNote(
        "endurance",
        "Endurance mindset",
        "Protect decision quality late in a stint with repeatable references, then review opening, middle, and closing phases after the run.",
        ("consistency", "multiclass"),
    ),
    KnowledgeNote(
        "multiclass",
        "Multiclass traffic",
        "Plan predictable placement and exits before an overtake; separate traffic-contaminated laps when the relative-car evidence supports that label.",
        ("endurance", "corner_exit"),
    ),
)


def search_knowledge(query: str, limit: int = 3) -> list[dict[str, object]]:
    """Deterministic tag-and-text retrieval; no embeddings or external content."""
    terms = {term for term in query.lower().replace("-", "_").split() if term}
    ranked: list[tuple[int, KnowledgeNote]] = []
    for note in NOTES:
        haystack = f"{note.tag} {note.title} {note.text} {' '.join(note.related)}".lower()
        score = sum(3 if term == note.tag else 1 for term in terms if term in haystack)
        if score:
            ranked.append((score, note))
    if not ranked:
        ranked = [(1, next(note for note in NOTES if note.tag == "consistency"))]
    ranked.sort(key=lambda item: (-item[0], item[1].tag))
    return [
        {"tag": note.tag, "title": note.title, "text": note.text, "related": list(note.related)}
        for _, note in ranked[: max(1, min(limit, 3))]
    ]
