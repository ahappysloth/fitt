# Fitt platform

Fitt uses Next.js 16 App Router, React 19, and Tailwind CSS v4. OpenNext adapts the production build to Cloudflare Workers. This release keeps workout data on the device; database, authentication, account synchronization, and realtime services are intentionally deferred.

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

The production Worker entry is `.open-next/worker.js`; static assets are in `.open-next/assets`. `wrangler.jsonc` configures the asset and Worker self-reference bindings. The OpenNext adapter is responsible for the Worker implementation; application components remain ordinary Next/React code.

## Offline and updates

After each Next production build, `scripts/build-service-worker.mjs` gathers every immutable client chunk, stylesheet, and local font. It generates `public/sw.js` with a version derived from the build and cache manifest. The worker installs only when the generic root page and all required local resources have been cached successfully.

Offline navigation uses the complete cached version. A newer online page cannot overwrite that cached HTML independently of its matching assets. API, authentication, mutation, external, and RSC requests bypass the worker cache. One previous cache is retained for another open tab that has not reloaded yet.

`usePwa()` exposes installation support, online/offline status, offline readiness, and an explicit update action. A waiting worker activates only after that action; the app reloads after the controller changes. Saved workout state remains in application storage. An interrupted cache installation reports that offline setup did not finish instead of claiming offline readiness.

Service workers are enabled only in a production build on a secure HTTP origin. Localhost is supported for testing. The standalone exporter defines `NEXT_PUBLIC_STANDALONE=true`, which disables worker registration and all PWA setup requests in the review artifact.

## Future server integrations

The deployment target remains Neon Postgres + Drizzle through `@turnal-io/db/serverless`, using the WebSocket driver and per-request pools released with `ctx.waitUntil(pool.end())`; passwordless Better Auth through `@turnal-io/auth` with magic link and Google sign-in; and workspace-scoped realtime through a `WorkspaceDO` Durable Object using WebSocket Hibernation.

Those integrations require the real Turnal package interfaces and an explicit synchronization design that preserves existing device history. No substitute package APIs or placeholder authenticated endpoints are included in this release.
