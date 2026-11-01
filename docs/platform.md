# Fitt platform

Fitt uses Next.js 16 App Router, React 19, and Tailwind CSS v4. OpenNext adapts the production build to Cloudflare Workers. Device-only training remains available; optional accounts add Neon storage, passwordless auth, offline sync, and realtime revision notifications.

## Rendering and styling

`src/app/layout.tsx` supplies metadata, the PWA manifest, and local font/style imports. The server renders a small loading shell. `src/app/FittClient.tsx` loads the interactive application on the client so browser storage is never accessed while rendering on the server. Route errors offer a retry without clearing saved data.

`src/app/globals.css` exposes semantic Tailwind v4 tokens. `src/styles.css` and the component styles implement the approved neutral charcoal/electric lime design. The standalone HTML exporter remains a separate review tool; Vite is used only for that exporter and unit tests.

## Commands

| Command                 | Purpose                                                   |
| ----------------------- | --------------------------------------------------------- |
| `npm run dev`           | Next development server on port 5173                      |
| `npm run typecheck`     | Strict TypeScript check                                   |
| `npm test`              | Domain, storage, and offline-cache tests                  |
| `npm run build`         | Production Next build and versioned service worker        |
| `npm run preview`       | Serve that production build on port 4173                  |
| `npm run build:preview` | Self-contained HTML review artifact                       |
| `npm run build:worker`  | Build the OpenNext Worker and static assets               |
| `npm run dev:worker`    | Preview the built Worker locally                          |
| `npm run check:deploy`  | Build and validate a Worker deployment without publishing |

The production Worker entry is `worker.ts`, which delegates normal requests to `.open-next/worker.js`; static assets are in `.open-next/assets`. `wrangler.jsonc` configures assets, the Worker self-reference, and a SQLite-backed `WORKSPACE_DO` binding. The custom entry authenticates `/api/realtime` upgrades and exports `WorkspaceDO`; application components remain ordinary Next/React code.

## Offline and updates

After each Next production build, `scripts/build-service-worker.mjs` gathers every immutable client chunk, stylesheet, and local font. It generates `public/sw.js` with a version derived from the build and cache manifest. The worker installs only when the generic root page and all required local resources have been cached successfully.

Offline navigation uses the complete cached version. A newer online page cannot overwrite that cached HTML independently of its matching assets. API, authentication, mutation, external, and RSC requests bypass the worker cache. One previous cache is retained for another open tab that has not reloaded yet.

`usePwa()` exposes installation support, online/offline status, offline readiness, and an explicit update action. A waiting worker activates only after that action; the app reloads after the controller changes. Saved workout state remains in application storage. An interrupted cache installation reports that offline setup did not finish instead of claiming offline readiness.

Service workers are enabled only in a production build on a secure HTTP origin. Localhost is supported for testing. The standalone exporter defines `NEXT_PUBLIC_STANDALONE=true`, which disables worker registration and all PWA setup requests in the review artifact.

## Account services

Neon Postgres + Drizzle use `@turnal-io/db/serverless` and the WebSocket driver. Each request owns its pool. Worker background work is drained before pool cleanup through `ctx.waitUntil`; Node waits for cleanup directly. Node development preserves configured HTTPS proxies and TLS trust through a `ws` adapter. Worker requests use the runtime WebSocket implementation. Shared database pools are not cached globally.

Better Auth is constructed through `@turnal-io/auth` with magic link and Google sign-in. Server endpoints are private/no-store, mutations validate the exact origin, and session-derived ownership is required for every training operation. A queued write also carries its expected account ID, preventing a changed browser cookie from redirecting an old account's queued data into another account. Google provider tokens are not retained for ongoing API access.

Training sync uses an atomic per-account revision and bounded idempotency receipts. The server normalizes completed workouts and set facts, routines, and profile/preferences under account-scoped keys. Active workouts and generated plans stay local. Realtime sends revision hints only; authenticated HTTP remains the source of truth. Durable Object sockets have bounded lifetimes, origin checks, per-account routing, and hibernation-compatible expiry alarms. HTTP polling/focus refresh works when realtime is unavailable.

See [accounts](accounts.md) for deployment variables, migrations, import/merge behavior, and hosted-validation limits.
