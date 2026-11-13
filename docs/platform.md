# Fitt platform

Fitt uses vinext, React 19, and Tailwind CSS v4. The Cloudflare Vite plugin builds its App Router routes directly for Workers. Device-only training remains available; optional accounts add Neon storage, passwordless auth, offline sync, and realtime revision notifications. The migration's verified and pending checks are tracked in [vinext migration validation](vinext-migration.md).

## Rendering and styling

`src/app/layout.tsx` supplies metadata, the PWA manifest, and local font/style imports. The server renders a small loading shell. `src/app/FittClient.tsx` loads the interactive application on the client so browser storage is never accessed while rendering on the server. Route errors offer a retry without clearing saved data.

`src/app/globals.css` exposes semantic Tailwind v4 tokens. `src/styles.css` and the component styles implement the approved neutral charcoal/electric lime design. The standalone HTML exporter remains a separate Vite configuration for review artifacts without a server runtime.

## Commands

| Command                       | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `bun run dev`                 | Vite/vinext development server on port 5173                    |
| `bun run typecheck`           | Strict TypeScript check                                        |
| `bun run test`                | Domain, storage, and offline-cache tests                       |
| `bun run build`               | Production Worker, static assets, and versioned service worker |
| `bun run preview`             | Run the built Worker in local workerd on port 4173             |
| `bun run build:preview`       | Self-contained HTML review artifact                            |
| `bun run build:worker`        | Alias for the production build                                 |
| `bun run dev:worker`          | Alias for the local Worker preview                             |
| `bun run check:deploy`        | Build and validate a Worker deployment without publishing      |
| `bun run check:compatibility` | Scan App Router compatibility with the pinned vinext version   |
| `bun run deploy`              | Build and publish the production `fitt` Worker                 |

The production Worker entry is `worker.ts`, which delegates ordinary HTTP requests to `vinext/server/app-router-entry`. Vite emits its server module graph in `dist/server/`, hashed client assets under `dist/client/_next/static/`, and copied public assets in `dist/client/`. Wrangler preview, dry run, and deployment use the generated `dist/server/wrangler.json`; the source `wrangler.jsonc` declares assets, authentication origins, and the SQLite-backed `WORKSPACE_DO` and `RATE_LIMIT_DO` bindings (migration tags `v1` and `v2`). The custom entry authenticates `/api/realtime` upgrades and exports `WorkspaceDO` and `RateLimitDO`. There is no OpenNext bundle or Worker self-reference service.

`cloudflare:workers` supplies native bindings and `waitUntil`. The request bridge creates an email adapter for each request, and services own their database pools until all request background work settles. The `next` package is not installed: vinext provides the application runtime and the supported `next/*` imports, and `tsconfig.json` loads `vinext/types` for their declarations. (`scripts/next-env-types.d.ts` restores the `@next/env` `loadEnvConfig` type that vinext's fallback declarations hide; `@next/env` itself remains a development dependency of the migration script.)

## Offline and updates

The build registers `/sw.js` with Vite before bundling, then `scripts/build-service-worker.mjs` gathers immutable client chunks, stylesheets, and local fonts from `dist/client/`. It writes the finished service worker to `public/sw.js` and `dist/client/sw.js`, with a version derived from `dist/server/BUILD_ID`, the worker template, and asset URLs. The preparation placeholder cannot install. The finished worker installs only when the generic root page and all required local resources have been cached successfully, with credentials omitted from precache requests.

Offline navigation uses the complete cached version. A newer online page cannot overwrite that cached HTML independently of its matching assets. API, authentication, private Admin, mutation, external, and RSC requests bypass the worker cache. The existing `fitt-shell-` cache prefix and `/_next/static/` asset paths are preserved. Activation retains one previous complete cache so an open tab can still load its cached Next.js chunks during the vinext transition.

`usePwa()` exposes installation support, online/offline status, offline readiness, and an explicit update action. A waiting worker activates only after that action; the app reloads after the controller changes. Saved active workouts can resume after updating. Unsaved routine/set edits and storage failures block the update with an explanation. If another tab already activated the worker, the action reloads the current document; sibling tabs are never forced to reload. An interrupted cache installation reports that offline setup did not finish instead of claiming offline readiness.

Service workers are enabled only in a production build on a secure HTTP origin. Localhost is supported for testing. The standalone exporter defines `NEXT_PUBLIC_STANDALONE=true`, which disables worker registration and all PWA setup requests in the review artifact.

## Security headers

`worker.ts` sets the security headers from `@turnal-io/security-headers` on every response it returns (`src/server/security-headers.ts`): pages, RSC requests, API routes, public files such as `/sw.js` and the manifest, and the Worker's own realtime and Admin responses. It does this rather than `next.config` `headers()`, because vinext applies those rules only to responses it renders itself; `next.config.ts` keeps only the service-worker and manifest cache rules. Hashed files under `/_next/static/*` are served without running the Worker and keep `public/_headers` (`nosniff`, immutable caching).

HSTS (two years, subdomains), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` and `Permissions-Policy: camera=(), microphone=(), geolocation=()` are enforced. The Content-Security-Policy is sent as `Content-Security-Policy-Report-Only`: the package's `app` preset plus the realtime socket's own `wss:` origin and `data:` fonts. It blocks nothing; enforcing it is a separate change once reports are clean. `tests/security-headers.spec.ts` fails if the app, its 3D guides or the service worker report a violation.

Browsers POST violations to `/api/csp-report` (`src/server/csp-report.ts`). Each is written to the Worker log as one JSON line with `"event":"csp-report"`, the directive, and the blocked, document and source URLs reduced to origin and path (no query strings, fragments or referrers); bodies over 16 KB and anything that is not a JSON report POST are refused. Read them in the Cloudflare dashboard (the `fitt` Worker's Observability logs, filtered on `event = csp-report`; `observability` is enabled in `wrangler.jsonc`) or live with `bunx wrangler tail fitt --format pretty --search csp-report`. Locally, `bun run preview` prints them in its output.

## Account services

Neon Postgres + Drizzle use `@turnal-io/db/serverless` and the WebSocket driver. Each request owns its pool. Worker background work is drained before pool cleanup through native `waitUntil`; Node test/tooling paths wait for cleanup directly. Node preserves configured HTTPS proxies and TLS trust through a `ws` adapter. Worker requests use the runtime WebSocket implementation. Shared database pools are not cached globally.

Better Auth is constructed per request through the framework-free root entry of `@turnal-io/auth` (3.x) with magic link and Google sign-in; `src/server/auth.ts` holds the whole configuration (`fittAuthConfig`). Fitt uses the root entry, not `@turnal-io/auth/next`, because no server action or server component sets an auth cookie: every sign-in, callback and sign-out goes through the `/api/auth/[...all]` route handler, whose response carries Better Auth's own `Set-Cookie` headers, and server code only reads sessions. Server endpoints are private/no-store, mutations validate the exact origin, and session-derived ownership is required for every training operation.

The package's secure defaults apply. Its construction checks run in CI (`src/server/auth-config.test.ts` calls `assertAuthConfig` with the production values from `wrangler.jsonc`), because a refused configuration would otherwise surface as a 503 on every account request:

- **Rate limits.** Better Auth's per-client rules for pre-auth routes are enforced through the shared `RATE_LIMIT_DO` Durable Object (`createDurableObjectRateLimiter(env.RATE_LIMIT_DO)` from `@turnal-io/ratelimit`; `src/server/rate-limit-do.ts`), per client IP from Cloudflare's `cf-connecting-ip`, as token buckets: Google sign-in start (`/sign-in/social`) and magic-link verification 30 per minute (package defaults), magic-link requests 5 per minute, OAuth callbacks 100 per 10 seconds. Signed-in routes (`/get-session`, sign-out) use the same 100 per 10 seconds in a per-isolate bucket (`rateLimiterScope: "pre-auth"`, the package default; every Fitt auth route is a Better Auth core or magic-link route, so none falls outside the package's pre-auth list). The package HMACs Better Auth's bucket key with a key derived from the auth secret before it reaches the limiter, so no IP address is stored; the limiter spreads keys over 16 Durable Object instances (`global`, `shard-1` … `shard-15`). Each take arms an hourly alarm whose `handleRateLimitAlarm` deletes buckets idle for their own window. Fitt's own Postgres limiter still runs first for sign-in POSTs (20 per source and 5 magic-link requests per address per 10 minutes). If the Durable Object fails or takes longer than 1.5 seconds, sign-in and callback routes answer 429 while session reads continue. A refused browser navigation (an OAuth callback or link click) is redirected to `onAPIError.errorURL` with `error=rate_limited`. A pre-auth request without a client IP header is refused off localhost; behind Cloudflare the header is always present. The binding is required off localhost: without it construction fails.
- **Email delivery.** `emailDelivery: "await"`: the magic-link send is awaited, and a rejected send answers 503 `EMAIL_DELIVERY_FAILED`, which the account form reports as an unsent email.
- **Sign-up.** Magic-link sign-up stays open (`allowSignUp: true`). Links are valid for five minutes and are stored hashed.
- **Origins and cookies.** `BETTER_AUTH_URL` and `TRUSTED_ORIGINS` are canonicalised (`trustedOrigins` in `src/server/env.ts`: whitespace, a trailing slash, upper case and default ports are normalised; wildcards, paths and non-local `http:` are dropped), and the same list drives Better Auth's origin/CSRF checks and Fitt's request policy. Session cookies are host-only, HttpOnly, SameSite=Lax and `__Secure-` on HTTPS; sessions last 7 days and refresh daily.
- **Logs.** `logger.log` is `logAuthLine` in `src/server/auth.ts`. Better Auth's own lines stay out of the logs, as before. The package's own lines (prefixed `[turnalbase/auth]`: rate limiter failed, request without a client IP, failed email send, ignored trusted origin) are printed with `console.error`/`console.warn` after the package redacts them. A driver error inside an endpoint is the exception: the package's redacted copy is dropped, and Fitt's `onAPIError` logs a constant line and answers a generic 500, because driver errors can carry SQL parameters that pattern-based redaction may miss. `logger: { disabled: true }` is not used, because it would also silence the package's operational lines. Fitt logs `@turnal-io/auth` construction errors by message (they contain no secret values).
- **Writes.** Sign-up and OAuth user creation run in a database transaction. Fitt's `databaseHooks` only clear provider tokens and never query the database.

Realtime upgrades pre-check the session cookie's signature with the package's `verifySessionCookie` (`src/server/realtime/session-cookie.ts`), then require a live, unexpired session row; the signature alone never authorises a channel. Better Auth 1.6.30+ creates its request-scoped `AsyncLocalStorage` singletons race-free, so Fitt no longer initialises them eagerly at isolate start. A queued write also carries its expected account ID, preventing a changed browser cookie from redirecting an old account's queued data into another account. Google provider tokens are not retained for ongoing API access.

Training sync uses an atomic per-account revision and bounded idempotency receipts. The server normalizes completed workouts and set facts, routines, and profile/preferences under account-scoped keys. Active workouts and generated plans stay local. Realtime sends revision hints only; authenticated HTTP remains the source of truth. Durable Object sockets have bounded lifetimes, origin checks, per-account routing, and hibernation-compatible expiry alarms. HTTP polling/focus refresh works when realtime is unavailable.

See [accounts](accounts.md) for deployment variables, migrations, import/merge behavior, and hosted-validation limits.
