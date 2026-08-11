# F1DB circuit-map source

The SVG centreline sources in this directory are selected historical layouts from
[F1DB](https://github.com/f1db/f1db), authored by Jules Roy and F1DB contributors.
They are redistributed and transformed under the Creative Commons Attribution 4.0
International license included as `LICENSE-CC-BY-4.0.txt`.

- Source commit: `21d0bc8ae4a9dc1b26a0852bc0cd4ff12096adbf`
- Retrieved: 2026-08-11
- Transform: deterministic arc-length sampling, direction normalization where
  required, then aspect-preserving normalization into LapSignal's local SVG view box.
- Runtime behavior: the application reads only the generated local JSON assets. It
  does not contact F1DB or any map service at runtime.

The individual generated map assets preserve their exact source URL, source SVG
SHA-256, layout version, direction treatment, and transformation description.
