# Landing and brand asset sources

This register covers the visual assets used by the LapSignal public landing page in `v0.1.0-alpha.4`. No stock photography, publisher artwork, game logos, racing-series marks, sponsor graphics, manufacturer marks, or recognizable vehicle liveries are used.

## Approved LapSignal identity

| Project files | Origin | Transformation | Usage status |
| --- | --- | --- | --- |
| `docs/brand/assets/*` | Final `LapSignal-Logo-System.zip` supplied and approved by the project owner on 2026-08-11. | Byte-preserved archive copies of all seven PNG files and the package README. | Project-approved identity source; keep as the raster visual reference. |
| `apps/web/public/brand/lapsignal/lapsignal-horizontal-*.png` and `lapsignal-symbol-transparent.png` | Approved package masters. | Aspect-ratio-preserving Lanczos resize and lossless PNG optimization. No crop, trace, recolour, redraw, or geometry change. | Production web identity assets. |
| `apps/web/public/brand/lapsignal/favicon*`, `apple-touch-icon-180.png`, and `pwa-*.png` | Approved standalone transparent symbol. | Proportional resize of the complete source canvas, centred on Carbon Black. The maskable version uses additional safe padding. | Browser, Apple touch, and PWA assets. |
| `apps/web/public/brand/lapsignal/lapsignal-social-card-1200x630.png` | Approved transparent horizontal logo and the existing “Every lap has a signal.” tagline. | Composed at 1200×630 on Carbon Black with a Graphite grid, Signal Red rule, and one Warm Amber timing point. The logo itself is only proportionally resized. | Open Graph and X/Twitter card. |

The package contains monochrome examples only in reference sheets. Those sheets are archived for guidance and are not cropped into production assets. See `docs/BRAND_IDENTITY.md` for the disclosed full-colour fallback and future vector-master recommendation.

## Generated campaign imagery

| Project files | Origin | Transformation | License / usage status |
| --- | --- | --- | --- |
| `apps/web/public/media/hero-rig.webp` | Original image generated for LapSignal with OpenAI's built-in image generation on 2026-08-10. The prompt required fictional, unbranded sim-racing hardware, vehicle, circuit, and game visuals. | Cropped and encoded as a 960×960 WebP at quality 88. | Project-owned output as between the user and OpenAI to the extent permitted by applicable law under the [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/). Not sourced from a third-party photo library. |
| `apps/web/public/media/workflow-wheel.webp` | Center panel of the same original generated campaign image. | Cropped and encoded as a 960×960 WebP at quality 88. | Same status as the generated source above. |
| `apps/web/public/media/setup-hardware.webp` | Right panel of the same original generated campaign image. | Cropped and encoded as a 960×960 WebP at quality 88. | Same status as the generated source above. |

The campaign-generation prompt explicitly prohibited third-party logos, trademarks, liveries, circuit names, publisher branding, and watermarks.

## Code-native and package assets

| Asset | Origin | License / usage status |
| --- | --- | --- |
| `data/circuit-maps/source/f1db/*.svg` and generated `data/circuit-maps/maps/*.json` | Selected historical-layout SVGs from [F1DB](https://github.com/f1db/f1db) by Jules Roy and F1DB contributors, pinned to commit `21d0bc8ae4a9dc1b26a0852bc0cd4ff12096adbf`. | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Deterministically arc-length sampled, racing-direction normalized where required, and aspect-fitted to the LapSignal map view box. Exact source URLs, source hashes, layout versions, and transforms are preserved in every generated asset. No runtime network access. |
| Telemetry traces, carbon weave, chassis cuts, grids, and markers | Original code-native project artwork in the repository. | First-party project assets; no external visual source. |
| Spa-Francorchamps circuit outline in `apps/web/app/page.tsx` | Will Pittenger, [Spa-Francorchamps of Belgium](https://commons.wikimedia.org/wiki/File:Spa-Francorchamps_of_Belgium.svg), via Wikimedia Commons. | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Adapted by stripping map annotations, normalizing the centerline to the shared telemetry canvas, simplifying path points, recolouring, and adding the animated marker. The adapted path remains available under CC BY-SA 3.0. |
| Red Bull Ring circuit outline in `apps/web/app/page.tsx` | Pitlane02 and Wikimedia contributors, [Circuit Red Bull Ring](https://commons.wikimedia.org/wiki/File:Circuit_Red_Bull_Ring.svg), via Wikimedia Commons. | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Adapted by stripping map annotations, normalizing the centerline to the shared telemetry canvas, simplifying path points, recolouring, and adding the animated marker. The adapted path remains available under CC BY-SA 3.0. |
| Monza circuit outline in `apps/web/app/page.tsx` | Will Pittenger and Wikimedia contributors, [Monza track map](https://commons.wikimedia.org/wiki/File:Monza_track_map.svg), via Wikimedia Commons. | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Adapted by stripping map annotations, normalizing the centerline to the shared telemetry canvas, simplifying path points, recolouring, and adding the animated marker. The adapted path remains available under CC BY-SA 3.0. |
| Manrope | Loaded through `next/font/google`; upstream files in the [Google Fonts Manrope directory](https://github.com/google/fonts/tree/main/ofl/manrope). | SIL Open Font License 1.1. |
| Barlow Condensed | Loaded through `next/font/google`; upstream project is [jpt/barlow](https://github.com/jpt/barlow). | SIL Open Font License 1.1. |
| Geist Mono | Loaded through `next/font/google`; upstream project is [vercel/geist-font](https://github.com/vercel/geist-font). | SIL Open Font License 1.1. |
| Lucide UI icons | Imported from the pinned `lucide-react` package. | [ISC License](https://github.com/lucide-icons/lucide/blob/main/LICENSE). No Lucide brand-logo icons are used. |

This file records source and stated upstream license status; it is not legal advice. Preserve this register when replacing or adding landing imagery.
