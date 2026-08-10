# Landing asset sources

This register covers the visual assets used by the LapSignal public landing page in `v0.1.0-alpha.3`. No stock photography, publisher artwork, game logos, racing-series marks, sponsor graphics, manufacturer marks, or recognizable vehicle liveries are used.

## Generated campaign imagery

| Project files | Origin | Transformation | License / usage status |
| --- | --- | --- | --- |
| `apps/web/public/og.png` | Original image generated for LapSignal with OpenAI's built-in image generation on 2026-08-10. The prompt required fictional, unbranded sim-racing hardware, vehicle, circuit, and game visuals. | Resized to 1200×630 for Open Graph and X cards. | Project-owned output as between the user and OpenAI to the extent permitted by applicable law under the [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/). Not sourced from a third-party photo library. |
| `apps/web/public/media/hero-rig.webp` | Left panel of the same original generated campaign image. | Cropped and encoded as a 960×960 WebP at quality 88. | Same status as the generated source above. |
| `apps/web/public/media/workflow-wheel.webp` | Center panel of the same original generated campaign image. | Cropped and encoded as a 960×960 WebP at quality 88. | Same status as the generated source above. |
| `apps/web/public/media/setup-hardware.webp` | Right panel of the same original generated campaign image. | Cropped and encoded as a 960×960 WebP at quality 88. | Same status as the generated source above. |

Final generation prompt summary: a premium 1.91:1 LapSignal social card with a carbon title band, the exact text “LapSignal” and “Every lap has a signal.”, and a three-panel photorealistic home sim-racing scene showing a driver, wheel/pedals, and controller-plus-wheel context. The prompt explicitly prohibited third-party logos, trademarks, liveries, circuit names, publisher branding, and watermarks.

## Code-native and package assets

| Asset | Origin | License / usage status |
| --- | --- | --- |
| LapSignal timing-line logo, circuit paths, telemetry traces, carbon weave, chassis cuts, grids, and markers | Original code-native project artwork in the repository. | First-party project assets; no external visual source. Circuit shapes are intentionally illustrative and are not represented as official track maps. |
| Manrope | Loaded through `next/font/google`; upstream files in the [Google Fonts Manrope directory](https://github.com/google/fonts/tree/main/ofl/manrope). | SIL Open Font License 1.1. |
| Barlow Condensed | Loaded through `next/font/google`; upstream project is [jpt/barlow](https://github.com/jpt/barlow). | SIL Open Font License 1.1. |
| Geist Mono | Loaded through `next/font/google`; upstream project is [vercel/geist-font](https://github.com/vercel/geist-font). | SIL Open Font License 1.1. |
| Lucide UI icons | Imported from the pinned `lucide-react` package. | [ISC License](https://github.com/lucide-icons/lucide/blob/main/LICENSE). No Lucide brand-logo icons are used. |

This file records source and stated upstream license status; it is not legal advice. Preserve this register when replacing or adding landing imagery.
