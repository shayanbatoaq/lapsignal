from lapsignal.knowledge import NOTES, search_knowledge


def test_knowledge_base_covers_required_topics():
    assert {note.tag for note in NOTES} == {
        "braking",
        "brake_release",
        "trail_braking",
        "throttle",
        "corner_exit",
        "consistency",
        "controller",
        "wheel",
        "tyre_management",
        "fuel_management",
        "endurance",
        "multiclass",
    }


def test_knowledge_search_is_bounded_and_deterministic():
    first = search_knowledge("controller consistency")
    assert first == search_knowledge("controller consistency")
    assert 1 <= len(first) <= 3
    assert any(result["tag"] == "controller" for result in first)
