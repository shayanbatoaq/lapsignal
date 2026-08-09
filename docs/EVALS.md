# Coach evaluations

The default evaluation suite is deterministic, offline, and safe for CI. `services/api/tests/test_coach_evals.py` creates twelve named scenarios from the fixed seed:

1. early braking
2. late braking with poor exit
3. inconsistent brake release
4. late throttle pickup
5. excessive throttle modulation
6. consistent but slow laps
7. one anomalous clean lap
8. invalid-lap contamination
9. controller input noise
10. stint degradation
11. missing tyre data
12. insufficient clean laps

Each case re-runs analytics, builds the fallback report, and asserts that priorities are capped at three, priority evidence is non-empty, report IDs exist in the deterministic finding set, controller output contains no wheel-specific instruction, guaranteed gains are absent, and missing or insufficient data produces limitations. The Pydantic API/report paths provide additional schema validation.

`test_knowledge.py` verifies all required internally authored topics and deterministic bounded retrieval. API tests verify fallback behavior without a key.

Real-model evaluation is deliberately opt-in and excluded from CI. A future gated suite should use a separate non-production project, recorded input evidence, schema/evidence validators, cost ceilings, and human review. It must never upload raw captures or silently replace deterministic expected values with LLM judgments.
