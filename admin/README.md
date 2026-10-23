# SigMod Admin

React + TypeScript + Vite + shadcn/ui dashboard. The frontend lives in this repository and its production build is served by the existing v5 Express process at `/admin/`. React runs in the browser; no second application process is needed in production.

## Install and build

From the repository root:

```powershell
npm --prefix admin ci
npm --prefix server ci
npm --prefix server run build:all
```

Start the v5 service using its existing environment/start workflow. The dashboard requires `admin/dist/` alongside the server checkout. Starting the service is an operational action and is not performed by the build command.

Configure `ADMIN_ORIGIN` as the browser-facing origin. The Discord application must register `${ADMIN_ORIGIN}/api/v5/admin/auth/discord/callback`; the server derives it unless an explicit matching `DISCORD_ADMIN_REDIRECT_URI` is supplied. Existing `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` and `DISCORD_ADMIN_ID` remain server-only configuration. No browser secret or `VITE_` credential is required.

## Local development

Build once and serve the result from the local backend, or run Vite for hot reload:

```powershell
npm --prefix admin run dev
```

In the separate terminal running the local v5 backend, set `ADMIN_VITE_DEV=true` for development only. Open the backend's `/admin/`, normally `http://localhost:3001/admin/`, matching `ADMIN_ORIGIN`. The backend proxies dashboard HTTP requests to loopback Vite on port 5173, while API requests retain the backend origin. Vite HMR connects directly to localhost:5173. This mode is ignored in production.

Do not open the Vite port as the dashboard's normal browser entry point: it would send a different Origin on protected writes. A local backend needs its normal database and Discord development configuration; the fixture below avoids both for visual tests.

## Modules

- `src/app/`: route definitions, lazy feature loading and responsive shell.
- `src/auth/`: session bootstrap, expiry, recovery and logout.
- `src/theme/`: Fixed dark appearance.
- `src/lib/`: API/CSRF transport, safe content URLs and formatting.
- `src/hooks/`: local editor drafts and saved baselines.
- `src/components/ui/`: shadcn-generated primitives, retained as local source.
- `src/components/`: shared forms, confirmations, change guards, comparisons, uploads and sandboxed previews.
- `src/features/`: one module for each of the nine dashboard sections.

TanStack Query keeps server data in memory. Mutations are not automatically retried; revision conflicts and uncertain save outcomes require deliberate reconciliation. Editor drafts survive failed cached reads and session recovery in the current tab. Closing/reloading the tab discards drafts after the browser's unsaved-change warning. No user records, credentials or drafts are persisted in localStorage or a service worker.

## Checks

```powershell
npm --prefix admin run lint
npm --prefix admin test
npm --prefix admin run build
npm --prefix server test
npm --prefix server run build
```

For isolated browser verification, build both projects, then run from the repository root:

```powershell
node tests/fixtures/admin-preview.cjs
```

Open the printed loopback URL. The separate `/__fixture` control page can simulate expiration, revision conflicts, empty data and a write that succeeds before returning an error. This standalone test process uses synthetic in-memory records and a fixture-only login; it never loads the application server, environment files, MongoDB or Discord. None of that fixture authentication is mounted in the production application. Stop the fixture process after testing.

## Current boundaries

- Sigmally identities are unverified client snapshots, not verified Google identities. Their detail page is read-only.
- SigMod edits cover username, bio, role and avatar reset. They do not grant dashboard access; only the configured Discord owner is authorized. Account PATCH currently lacks revision CAS.
- Stats include current V5 state and persisted aggregate diagnostics. The collector runs every 60 seconds independently of dashboard visits. See [collection, retention and reliability](../docs/server-diagnostics.md). Connections are not unique people; separate V4 services are not monitored. Host CPU, memory, network and disk figures have a different scope from V5 process metrics.
- Settings reports count latest installation snapshots, not historical activity or people. Free-text values are hidden in the dashboard; custom theme definitions and saved names are excluded from collection.
- Announcement dates control ordering, not scheduled publication. List reads currently cap at 100 records. Archiving is supported; stored revision restoration is not.
- Promotions support the menu-card placement, respect user preferences and have no impression/click tracking.
- Translation edits replace an override map, preserve untouched overrides and validate source-key placeholders. Shipped text and overrides are returned separately only by the admin endpoint.
- Mandatory protocol compatibility enforcement is separate from dismissible update notices.

Production routing applies a dashboard-specific CSP, denies framing and keeps admin API authorization independent of the frontend. The server's public game CORS policy does not apply to the dashboard or admin API. Preserve `server/admin-assets/` (relative to the configured server working directory) across future releases and backups. Build outputs and test fixtures do not constitute a deployed dashboard.
