# Web runtime and data-flow map

LapSignal has one web interface and two explicit server-selected runtime modes. `LAPSIGNAL_SHOWCASE=true` selects the public, read-only provider; every other value selects the local product provider. The browser does not choose the mode.

## Boundary

- `apps/web/lib/runtime-server.ts` resolves the server-only runtime contract.
- `apps/web/lib/data-provider.ts` exposes the shared session, summary, detail, telemetry, report, and featured-session boundary.
- `LocalApiDataProvider` uses only the existing FastAPI DTOs and validators.
- `ShowcaseDataProvider` uses only schema-validated data in `apps/web/lib/showcase-data.ts`.
- `LiveStatusProvider` receives the resolved mode from the root server layout. Local mode polls FastAPI and opens the existing WebSocket. Showcase mode does neither.
- Mode-specific client mutations are disabled at the UI boundary in showcase mode. There is no showcase API route, persistence adapter, collector adapter, or AI provider adapter.

## Page map

| Surface | Local source | Showcase source | Writes |
| --- | --- | --- | --- |
| Overview | Session list and detail REST calls | Three bundled sessions | None |
| Live Session | Collector status REST + `/v1/live` WebSocket | Bounded in-browser playback fixture | Performance mode locally only |
| Sessions | Session summaries REST | Bundled summaries | None |
| Session Detail | Detail and telemetry REST | Bundled detail and traces | Performance mode locally only |
| Compare | Selected session telemetry REST | Featured representative session and traces | None |
| Debrief | Persisted report; optional coach POST | Persisted representative deterministic report | Coach generation locally only |
| Progress | Full session history REST | Three-session representative programme | None |
| Settings | Profile, AI, calibration, health and build reads | Static explanatory state | Profile, export, delete, and calibration reset locally only |
| Onboarding | Browser-local profile preference | Ephemeral unsaved choices | Local browser storage only |
| Report | Persisted report resolved from sessions | Bundled report resolved from sessions | None |

React Query remains installed as shared application infrastructure, but current page data loading uses async server components and the provider boundary. Local API failures, processing responses, invalid contracts, true empty storage, and collector-offline state remain distinct. Showcase data is never a local fallback.
