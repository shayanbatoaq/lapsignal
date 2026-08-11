# LapSignal brand identity

The approved LapSignal identity combines the red `LS` racing-line symbol, an amber timing point, and the forward LapSignal wordmark. The supplied raster package is the visual source of truth.

## Palette

| Role | Name | Value |
| --- | --- | --- |
| Primary background | Carbon Black | `#080A0D` |
| Secondary dark | Graphite | `#15191F` |
| Primary accent | Signal Red | `#F23849` |
| Primary light | Bone White | `#F4F1E8` |
| Timing accent | Warm Amber | `#F2B84B` |

Warm Amber is limited to timing-point details. It must not compete with Signal Red or become a large background colour.

## Approved variants and backgrounds

- Use `lapsignal-horizontal-transparent.png` on Carbon Black, Graphite, or another quiet dark surface.
- Use `lapsignal-horizontal-light.png` on light surfaces. This is the approved flattened light-background asset; the source package does not include a transparent horizontal lockup for light surfaces.
- Use `lapsignal-horizontal-dark.png` when an approved self-contained dark-background lockup is required.
- Use `lapsignal-symbol-transparent.png` for compact navigation, browser icons, app icons, loading states, and avatars.
- Monochrome light and dark treatments are approved in the source reference sheets, but clean standalone monochrome files are not included. Do not crop those sheets or manufacture recoloured derivatives. The web component accepts `variant="monochrome"` but deliberately preserves the approved full-colour dark-surface lockup as a disclosed fallback until a standalone master is supplied. No current product placement requires monochrome reproduction.

Use the horizontal lockup at `120px` wide or larger. Use the standalone symbol at `24px` wide or larger. Product defaults are 172px in the desktop landing header, 142px in the expanded app sidebar, 46px for the collapsed sidebar symbol, 42px in the mobile product header, and 148px in the landing footer.

## Clear space and accessibility

Maintain clear space of at least one symbol stroke width on every side. Do not let containers clip the visible mark or change its aspect ratio. Use meaningful alternative text when the image conveys identity without a labelled link. Use an empty `alt` and `aria-hidden` when the logo is decorative or when a containing link already has the accessible name “LapSignal home.”

The full-colour horizontal logo must not sit on red, orange, busy photography, or another low-contrast surface. The standalone symbol may use Carbon Black as a square icon background. Maskable icons keep the complete supplied symbol canvas within the platform safe zone.

## Prohibited treatments

Do not redraw, trace, crop, stretch, rotate, recolour, outline, bevel, add a glow or shadow, put the logo inside a decorative badge/card, alter symbol-to-wordmark spacing, animate the logo geometry, or add motorsport and publisher marks. A restrained whole-logo opacity or 2–4px entrance may be used only when it respects reduced-motion preferences; the current implementation is static.

## Repository locations

- Optimized web assets: `apps/web/public/brand/lapsignal/`
- Reusable component: `apps/web/components/Logo.tsx`
- Browser/PWA manifest: `apps/web/app/manifest.ts`
- Metadata integration: `apps/web/app/layout.tsx`
- High-resolution source archive and original package README: `docs/brand/assets/`

The source archive contains high-resolution raster artwork, not a precision vector master. Before large-format print, manufacturing, or trademark filing, create and separately approve a true vector master with the wordmark converted to outlines. Do not auto-trace the raster files.
