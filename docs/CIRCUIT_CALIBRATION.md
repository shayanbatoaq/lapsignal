# F1 2021 circuit maps and calibration

LapSignal treats a circuit map as immediately useful product infrastructure, not a reward for setting a valid lap. All 24 full F1 2021 circuits have a complete local geometry source: eight telemetry-derived seeds and sixteen licensed packaged static centrelines. A complete map appears as soon as the Session packet identifies a matching track ID and plausible game-reported length.

Telemetry-derived maps are driven centrelines. They are not surveyed track boundaries, official circuit artwork, or a measurement of exact circuit width.

## Identity and source hierarchy

Live calibration artifacts are keyed by the exact layout fingerprint:

`game_id:packet_format:numeric_track_id:rounded_track_length_m`

For F1 2021, identity comes from the Session packet. UI names are descriptive only and are never used to guess a map. Static entries use the numeric ID plus an explicitly bounded expected-length tolerance; telemetry seeds and local calibration require an exact rounded length. A game, packet format, numeric ID, or length mismatch is rejected.

Display geometry and marker positioning are separate decisions.

Display geometry is selected in this order:

1. One of the eight matching telemetry-derived seeds. These are the highest-quality built-in maps.
2. A matching packaged static full-circuit map.
3. A complete local telemetry refinement only after it clears the deterministic quality threshold and is strictly eligible to replace that circuit's static display.
4. A truthful unavailable state.

Marker positioning is selected independently:

1. Exact local world transform on an accepted complete local geometry.
2. Seed world transform on a matching telemetry seed.
3. Normalized lap-distance projection along a complete seed or static centreline.
4. Static circuit with no marker when no usable position signal exists.

Progressive partial geometry remains a calibration diagnostic. It never replaces, clips, or hides a complete packaged circuit. There is no generic loop, partial-map presentation, cross-circuit fallback, or runtime map request.

## Built-in seed catalogue

Approved seeds live in `data/circuit-seeds/` and ship with the repository. The current F1 2021 catalogue contains:

| Circuit | Track ID | Length | Coverage |
| --- | ---: | ---: | ---: |
| Shanghai | 2 | 5,441 m | 100% |
| Sakhir | 3 | 5,408 m | 100% |
| Catalunya | 4 | 4,650 m | 100% |
| Monaco | 5 | 3,323 m | 100% |
| Circuit of the Americas | 15 | 5,514 m | 100% |
| Baku | 20 | 5,994 m | 100% |
| Imola | 27 | 4,910 m | 100% |
| Portimão | 28 | 4,650 m | 100% |

A seed contains only normalized path points, start/finish anchor, reversible world-to-SVG transform, exact layout identity, quality data, checksum, and sanitized technical provenance. It contains no session UID, session timestamp, player or car data, lap time, capture path, machine path, or raw packet content.

## Packaged static catalogue

The manifest at `data/circuit-maps/manifest.json` completes the F1 2021 full-circuit pack. Each static JSON asset contains a normalized centreline, start/finish origin, racing direction, layout version, expected length, SHA-256 geometry checksum, upstream SVG checksum, pinned source commit, attribution, and deterministic transform description.

| Track ID | Circuit | F1 2021 layout | Expected game length |
| ---: | --- | --- | ---: |
| 0 | Melbourne | 1996-2019 pre-2022 layout | 5,303 m |
| 1 | Paul Ricard | 2018-2019, 2021-2022 layout | 5,814 m |
| 6 | Montreal | F1 2021 game layout | 4,371 m |
| 7 | Silverstone | Grand Prix layout | 5,896 m |
| 9 | Hungaroring | 2003-present layout | 4,381 m |
| 10 | Spa-Francorchamps | Grand Prix layout | 7,003 m |
| 11 | Monza | 2000-present Grand Prix layout | 5,793 m |
| 12 | Singapore | 2015-2022, pre-2023 layout | 5,063 m |
| 13 | Suzuka | Grand Prix layout used by F1 2021 | 5,807 m |
| 14 | Abu Dhabi | 2009-2020 5.554 km layout represented in F1 2021, not the later redesign | 5,547 m |
| 16 | Interlagos | 1990-present Grand Prix layout | 4,309 m |
| 17 | Red Bull Ring | Grand Prix layout | 4,318 m |
| 18 | Sochi | 2014-2021 Grand Prix layout | 5,848 m |
| 19 | Mexico City | 2015-present Grand Prix layout | 4,304 m |
| 26 | Zandvoort | 2021 Grand Prix layout | 4,259 m |
| 29 | Jeddah | 2021 inaugural Grand Prix layout | 6,176 m |

The source SVGs are the versioned F1DB layouts at commit `21d0bc8ae4a9dc1b26a0852bc0cd4ff12096adbf`, licensed CC BY 4.0 and attributed in `data/circuit-maps/source/f1db/ATTRIBUTION.md`. Build-time source retrieval is complete; the application makes no runtime request to F1DB, OpenStreetMap, Wikimedia, or any other map service.

IDs 8 (Hockenheim), 21-24 (short layouts), and 25 (Hanoi) are explicitly excluded from this full-circuit pack. They remain truthfully unavailable rather than borrowing another layout.

## Immediate map and positioning behavior

When a matching seed or static map is available, the complete path renders before a valid lap exists.

- `Built-in map`: verified geometry is ready but the current position is not.
- `Packaged map`: complete licensed static geometry is ready but position telemetry is not.
- `Distance projected`: `lapDistance / trackLength` is projected by SVG polyline arc length from the start/finish anchor.
- `World calibrated`: live X/Z is inside the seed transform's sanity bounds, so the marker upgrades immediately to world positioning and live yaw.
- `Refining map`: reliable live samples are improving local geometry in the background.

The distance-to-world upgrade does not wait for another lap or a lap-time result. Marker updates remain isolated from the whole page so the UI is not forced to rerender at UDP packet frequency.

## Progressive multi-attempt learning

Calibration validity is evaluated per sample. Official lap validity is deliberately not a geometry gate. Valid, invalid, and incomplete attempts can contribute to the same fingerprint across sessions and process restarts.

The default accumulator uses:

- 400 stable lap-distance bins;
- 90% minimum reliable-bin coverage for a complete usable calibration;
- no unknown circular gap larger than 8 bins (2% of the lap);
- interpolation only for gaps at or below that 8-bin limit;
- up to 12 candidates per bin and no more than 4 candidates from one session per bin;
- weighted-median X/Z aggregation;
- a 120 m baseline impossible-jump limit, expanded from elapsed time, speed, and lap-distance movement;
- a 30-sample quarantine after a flashback or backward discontinuity;
- atomic progress writes, batched after each 100 newly accepted samples, plus final flush.

Partial segments are persisted for calibration diagnostics, but are not presented as the normal live circuit when a packaged full map exists. Large unknown gaps are never visually closed. A complete local artifact becomes display-eligible only after the deterministic quality threshold; a partial artifact never becomes display geometry.

The score prioritizes coverage, useful sample count, session diversity, rejected-sample ratio, maximum gap, and start/finish closure. Candidate storage and persistence are bounded.

## Per-sample acceptance and recovery

A sample must have the exact fingerprint, finite and plausible lap distance, finite X/Z/yaw, continuous movement, and a usable surface. Pit-lane or garage samples start a new segment and are rejected without discarding prior bins.

Surface confidence is:

- tarmac: `1.00`;
- kerb: `0.85`;
- tarmac/kerb/concrete mixtures: `0.90`;
- unknown surface: `0.65` or continuity-weighted fallback;
- grass, gravel, sand, and other known off-track surfaces: rejected.

Once a bin has enough evidence, a new point more than the larger of 30 metres or the robust spread threshold is rejected as an excursion. Flashbacks, lap resets, and teleports begin a new trace segment; their quarantine does not erase reliable samples from before or after the event. A restart restores the schema-2 progress snapshot and continues filling the same fingerprint.

Corrupted assets, invalid checksums, malformed progress files, path traversal, and mismatched layouts fail closed. They do not replace a seed or packaged static circuit and do not produce a fake map.

## Invalid-lap coaching policy

Three independent decisions are made:

- official timing validity controls personal bests and clean benchmark comparisons;
- telemetry usefulness controls braking, throttle, steering, consistency, and rule-based coaching;
- geometry usefulness controls circuit calibration.

An invalid attempt with sufficient telemetry is retained and labelled `Invalid lap · coaching available`. Its final time remains excluded from personal-best and clean comparison calculations, while supported technique findings remain available with evidence IDs and an explicit timing limitation. The system does not invent the cause or corner of an invalidation. This path is fully local and has no OpenRouter dependency.

## Settings and local reset

Settings → Circuit maps lists all 24 full circuits with game/format, numeric ID, telemetry-seed/static/local availability, coverage, quality, positioning capability, checksum, selected source, and last local update.

Reset requires the exact confirmation phrase `RESET LOCAL REFINEMENT`. It deletes only the validated local artifact and progress file for the selected fingerprint. It never deletes a telemetry seed, packaged static asset, or anything in `data/captures/`; the API falls back to the matching seed, then static map, then truthful unavailable state.

## Validation and promotion workflow

Use the repository commands from the workspace root:

```powershell
pnpm calibration:list
pnpm calibration:validate
pnpm calibration:promote --track-id 20 --dry-run
pnpm calibration:promote --track-id 20
pnpm circuits:build
pnpm circuits:validate
pnpm circuits:contact-sheet
```

To add another seed:

1. Confirm the local map visually and confirm the Session-packet identity and length.
2. Run `pnpm calibration:validate` and resolve every violation without weakening the validator.
3. Run a dry promotion for the numeric track ID and review the chosen fingerprint, coverage, checksum, and privacy result.
4. Run the real promotion.
5. Re-run validation, unit tests, production builds, desktop/mobile browser QA, and the repository secret audit.
6. Review and approve only the `.seed.json` artifact. Never add a raw capture or local progress file.

Promotion selection is deterministic: exact identity, highest coverage, most useful samples, lowest rejection ratio, tightest closure, stable checksum, then stable filename. Promotion refuses coverage below 90%, gaps above 8 bins, malformed or open geometry, mismatched fingerprints, invalid checksums, and forbidden personal/session/capture content.

## Adding a future game or historical circuit

A future game/layout needs a new game-specific manifest, numeric ID contract, expected reported length, versioned geometry asset, start/finish and racing-direction verification, two reliable silhouette references, attribution, checksum validation, clean-install fixtures, and responsive visual QA. Do not append a future game's IDs to the F1 2021 manifest or match by display name.

A historical venue that is not selectable in F1 2021 belongs in catalogue metadata only. If LapSignal later adds historical browsing, place its licensed geometry in a separate non-runtime catalogue with an explicit era/layout key; do not make it eligible for F1 2021 live ID resolution.

Packaged geometry is a circuit centreline. Distance projection is an approximate position along that centreline. World calibration can improve exact game-coordinate placement and heading. Neither representation claims surveyed track width or boundaries.

## Raw-capture recovery

An existing local `.lsraw` capture can be reprocessed without editing it:

```powershell
pnpm --filter @lapsignal/collector start calibrate "C:\path\to\capture.lsraw" --data-dir "C:\path\to\LapSignal AI\data"
```

The command reports sanitized counts, layout identity, coverage, and checksum. Raw captures remain ignored local artifacts under `data/captures/`.
