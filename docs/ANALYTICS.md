# Deterministic analytics

The analytics engine—not the coach—owns every performance calculation. Version `0.1.0` lives in `services/api/lapsignal/analytics.py` and emits compact metrics plus a maximum of three evidence-backed findings.

## Preparation

Laps marked invalid, pit, out, in, incomplete, corrupted, implausibly short, or implausibly long are excluded. Comparable laps are sorted and interpolated onto a distance grid. A gap above 80 m is retained as a quality limitation instead of being silently concealed. Browser telemetry is independently bounded to 50–2500 points per requested trace.

## Metrics

- **Pace:** best, mean, median, population standard deviation, robust consistency from median absolute deviation, theoretical best from best stored sectors, and least-squares lap-time trend.
- **Braking:** contiguous braking-zone detection, onset distance, initial/peak pressure, duration, release smoothness, a labeled trail-braking proxy, and minimum speed.
- **Throttle:** first pickup after minimum speed, time to full throttle, and modulation magnitude.
- **Steering:** derivative-based smoothness, correction count, and abrupt changes with different controller and wheel thresholds. These are input observations, never proof of vehicle balance.
- **Stint:** opening/middle/closing consistency, degradation slope, increasing-error pattern, long-run stability, and tyre-wear correlation only when measured wear is sufficiently populated.

Fuel-corrected pace, traffic classification, exit-speed attribution, and robust oversteer/understeer proxies remain intentionally limited until the required channels and comparison evidence are available. Absence is exposed as `null` or a limitation, not a fabricated estimate. A late-stint pattern is descriptive and never a medical fatigue diagnosis.

## Findings

Every finding has a stable ID, type, priority, severity, 0–1 confidence, plain-language observation, recommended action, evidence rows with units/reference/delta/laps/zone, limitations, and analysis version. Exact distances appear only when a stored comparison supports them. The reference is always identified (for the alpha, usually the driver's best comparable clean lap), never an invented ideal.

## Verification

`services/api/tests/test_analytics.py` covers distance alignment, visible gaps, invalid-lap filtering, theoretical best, robust consistency, braking zones, throttle pickup, degradation, missing channels, low-quality inputs, and grounded findings. The fixed demo seed creates valid, invalid, anomalous, improving, consistent, and degrading examples without claiming real-world performance.
