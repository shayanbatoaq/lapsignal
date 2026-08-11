# Built-in circuit seeds

These version-controlled files are approved, normalized telemetry-derived driven centrelines. They are not surveyed circuit boundaries or exact width data.

Every seed must pass `pnpm calibration:validate`. Seeds may include only exact layout identity, normalized SVG geometry, the world-to-SVG transform, start/finish anchor, quality metadata, checksum, and sanitized technical provenance. Session identifiers, timestamps tied to driving, player/car details, lap times, capture references, machine paths, raw packets, and other physical-session data are forbidden.

Use the documented dry-run promotion workflow in `docs/CIRCUIT_CALIBRATION.md`; never copy a raw capture into this directory.
