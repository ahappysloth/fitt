# Fitt platform

Fitt uses vinext, React 19, and Tailwind CSS v4. The Cloudflare Vite plugin builds its App Router routes directly for Workers. Device-only training remains available; optional accounts add Neon storage, passwordless auth, offline sync, and realtime revision notifications. The migration's verified and pending checks are tracked in [vinext migration validation](vinext-migration.md).

## Rendering and styling

`src/app/layout.tsx` supplies metadata, the PWA manifest, and local font/style imports. The server renders a small loading shell. `src/app/FittClient.tsx` loads the interactive application on the client so browser storage is never accessed while rendering on the server. Route errors offer a retry without clearing saved data.

`src/app/globals.css` exposes semantic Tailwind v4 tokens. `src/styles.css` and the component styles implement the approved neutral charcoal/electric lime design. The standalone HTML exporter remains a separate Vite configuration for review artifacts without a server runtime.

## Commands

| Command                       | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `npm run dev`                 | Vite/vinext development server on port 5173                    |
| `npm run typecheck`           | Strict TypeScript check                                        |
| `npm test`                    | Domain, storage, and offline-cache tests                       |
| `npm run build`               | Production Worker, static assets, and versioned service worker |
| `npm run preview`             | Run the built Worker in local workerd on port 4173             |
| `npm run build:preview`       | Self-contained HTML review artifact                            |
| `npm run build:worker`        | Alias for the production build                                 |
| `npm run dev:worker`          | Alias for the local Worker preview                             |
| `npm run check:deploy`        | Build and validate a Worker deployment without publishing      |
| `npm run check:compatibility` | Scan App Router compatibility with the pinned vinext version   |
| `npm run deploy`              | Build and publish the production `fitt` Worker                 |

The production Worker entry is `worker.ts`, which delegates ordinary HTTP requests to `vinext/server/app-router-entry`. Vite emits its server module graph in `dist/server/`, hashed client assets under `dist/client/_next/static/`, and copied public assets in `dist/client/`. Wrangler preview, dry run, and deployment use the generated `dist/server/wrangler.json`; the source `wrangler.jsonc` declares assets, authentication origins, and the SQLite-backed `WORKSPACE_DO` and `RATE_LIMIT_DO` bindings (migration tags `v1` and `v2`). The custom entry authenticates `/api/realtime` upgrades and exports `WorkspaceDO` and `RateLimitDO`. There is no OpenNext bundle or Worker self-reference service.

`cloudflare:workers` supplies native bindings and `waitUntil`. The request bridge creates an email adapter for each request, and services own their database pools until all request background work settles. The `next` package is not installed: vinext provides the application runtime and the supported `next/*` imports, and `tsconfig.json` loads `vinext/types` for their declarations. (`scripts/next-env-types.d.ts` restores the `@next/env` `loadEnvConfig` type that vinext's fallback declarations hide; `@next/env` itself remains a development dependency of the migration script.)

## Offline and updates

The build registers `/sw.js` with Vite before bundling, then `scripts/build-service-worker.mjs` gathers immutable client chunks, stylesheets, and local fonts from `dist/client/`. It writes the finished service worker to `public/sw.js` and `dist/client/sw.js`, with a version derived from `dist/server/BUILD_ID`, the worker template, and asset URLs. The preparation placeholder cannot install. The finished worker installs only when the generic root page and all required local resources have been cached successfully, with credentials omitted from precache requests.

Offline navigation uses the complete cached version. A newer online page cannot overwrite that cached HTML independently of its matching assets. API, authentication, private Admin, mutation, external, and RSC requests bypass the worker cache. The existing `fitt-shell-` cache prefix and `/_next/static/` asset paths are preserved. Activation retains one previous complete cache so an open tab can still load its cached Next.js chunks during the vinext transition.

`usePwa()` exposes installation support, online/offline status, offline readiness, and an explicit update action. A waiting worker activates only after that action; the app reloads after the controller changes. Saved active workouts can resume after updating. Unsaved routine/set edits and storage failures block the update with an explanation. If another tab already activated the worker, the action reloads the current document; sibling tabs are never forced to reload. An interrupted cache installation reports that offline setup did not finish instead of claiming offline readiness.

Service workers are enabled only in a production build on a secure HTTP origin. Localhost is supported for testing. The standalone exporter defines `NEXT_PUBLIC_STANDALONE=true`, which disables worker registration and all PWA setup requests in the review artifact.

## Account services

Neon Postgres + Drizzle use `@turnal-io/db/serverless` and the WebSocket driver. Each request owns its pool. Worker background work is drained before pool cleanup through native `waitUntil`; Node test/tooling paths wait for cleanup directly. Node preserves configured HTTPS proxies and TLS trust through a `ws` adapter. Worker requests use the runtime WebSocket implementation. Shared database pools are not cached globally.

Better Auth is constructed per request through the framework-free root entry of `@turnal-io/auth` (3.x) with magic link and Google sign-in; `src/server/auth.ts` holds the whole configuration (`fittAuthConfig`). Fitt uses the root entry, not `@turnal-io/auth/next`, because no server action or server component sets an auth cookie: every sign-in, callback and sign-out goes through the `/api/auth/[...all]` route handler, whose response carries Better Auth's own `Set-Cookie` headers, and server code only reads sessions. Server endpoints are private/no-store, mutations validate the exact origin, and session-derived ownership is required for every training operation.

The package's secure defaults apply. Its construction checks run in CI (`src/server/auth-config.test.ts` calls `assertAuthConfig` with the production values from `wrangler.jsonc`), because a refused configuration would otherwise surface as a 503 on every account request:

- **Rate limits.** Better Auth's per-client rules are enforced through the shared `RATE_LIMIT_DO` Durable Object (`createDurableObjectRateLimiter` from `@turnal-io/ratelimit`; `src/server/rate-limit-do.ts`): sign-in 3 per 10 seconds, magic-link requests and verification 5 per minute, every other auth route 100 per 10 seconds, per client IP from Cloudflare's `cf-connecting-ip`. Bucket keys are HMAC'd with the auth secret before they reach the Durable Object, so no IP address is stored, and an hourly alarm deletes idle buckets. Fitt's own Postgres limiter still runs first for sign-in POSTs (20 per source and 5 magic-link requests per address per 10 minutes). If the Durable Object fails or takes longer than 1.5 seconds, sign-in and callback routes answer 429 while session reads continue. A pre-auth request without a client IP header is refused off localhost; behind Cloudflare the header is always present. The binding is required off localhost: without it construction fails.
- **Sign-up.** Magic-link sign-up stays open (`allowSignUp: true`). Links are valid for five minutes and are stored hashed.
- **Origins and cookies.** `BETTER_AUTH_URL` and `TRUSTED_ORIGINS` are canonicalised (`trustedOrigins` in `src/server/env.ts`: whitespace, a trailing slash, upper case and default ports are normalised; wildcards, paths and non-local `http:` are dropped), and the same list drives Better Auth's origin/CSRF checks and Fitt's request policy. Session cookies are host-only, HttpOnly, SameSite=Lax and `__Secure-` on HTTPS; sessions last 7 days and refresh daily.
- **Logs.** Better Auth logging stays disabled and API errors are replaced by a constant log line and a generic 500, as before; the package's redacting logger sits underneath if logging is ever enabled. Fitt logs `@turnal-io/auth` construction errors by message (they contain no secret values).
- **Writes.** Sign-up and OAuth user creation run in a database transaction. Fitt's `databaseHooks` only clear provider tokens and never query the database.

Realtime upgrades pre-check the session cookie's signature with the package's `verifySessionCookie` (`src/server/realtime/session-cookie.ts`), then require a live, unexpired session row; the signature alone never authorises a channel. Better Auth 1.6.30+ creates its request-scoped `AsyncLocalStorage` singletons race-free, so Fitt no longer initialises them eagerly at isolate start. A queued write also carries its expected account ID, preventing a changed browser cookie from redirecting an old account's queued data into another account. Google provider tokens are not retained for ongoing API access.

Training sync uses an atomic per-account revision and bounded idempotency receipts. The server normalizes completed workouts and set facts, routines, and profile/preferences under account-scoped keys. Active workouts and generated plans stay local. Realtime sends revision hints only; authenticated HTTP remains the source of truth. Durable Object sockets have bounded lifetimes, origin checks, per-account routing, and hibernation-compatible expiry alarms. HTTP polling/focus refresh works when realtime is unavailable.

See [accounts](accounts.md) for deployment variables, migrations, import/merge behavior, and hosted-validation limits.
