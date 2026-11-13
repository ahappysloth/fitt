# Accounts, storage, and sync

Fitt can be used without signing in. Account features add cloud storage while keeping the workout experience available offline. Google and magic-link auth are passwordless. The single-file ChatGPT preview remains a device-only artifact; use the vinext development server or built Worker to exercise accounts.

## Configuration

Use the ten names in `.env.example`: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `TRUSTED_ORIGINS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM`. Supply credentials through environment settings or ignored local configuration. Use a Fitt-specific signing secret generated with `openssl rand -base64 32` and a pooled Neon development-branch URL. `@turnal-io/auth` refuses a secret shorter than 32 characters, an obvious placeholder, or a low-variety string, in every environment including tests. Do not set `BETTER_AUTH_SECRETS` or `BETTER_AUTH_TRUSTED_ORIGINS` in the environment: Better Auth reads them by itself, and the package refuses the first and validates the second. No secret has a `NEXT_PUBLIC_` prefix.

Vite development uses port 5173. `bun run build && bun run preview` runs the built Worker at `http://127.0.0.1:4173`, with both authentication origins explicitly set to that address. Local Wrangler can read the application variables declared in `wrangler.jsonc` from the process environment; `.dev.vars.example` documents optional ignored Worker-local configuration. Package/deployment credentials are not application bindings. Google's authorized callback must be exactly `<BETTER_AUTH_URL>/api/auth/callback/google`. Production origins must use HTTPS; use exact origins, not wildcards. Fitt canonicalises `BETTER_AUTH_URL` and the comma-separated `TRUSTED_ORIGINS` (surrounding whitespace, a trailing slash, upper case and default ports are fine) and drops entries that can never match a browser origin (wildcards, paths, `http:` other than `localhost`/`127.0.0.1`/`[::1]`). The development origin `http://localhost:5173` and preview origin `http://127.0.0.1:4173` count as localhost. Codex environment variables do not automatically populate a deployed Worker.

The production origin remains `https://fitt.turnal.workers.dev` during the vinext migration. Its two public auth-origin values are declared in `wrangler.jsonc`; the other eight application values must be provisioned on the Worker. `wrangler.jsonc` also declares the `RATE_LIMIT_DO` Durable Object binding (class `RateLimitDO`, migration tag `v2`) that holds Better Auth's rate-limit buckets; account services refuse to start on a non-localhost origin without it. It needs no secret or variable. The existing Google callback, `https://fitt.turnal.workers.dev/api/auth/callback/google`, remains unchanged. No additional Worker, hostname, or OAuth callback is required. See [deployment setup](deployment.md) for GitHub secret names and release workflow, and [migration validation](vinext-migration.md) for the current verification status.

Private Admin access additionally requires `FITT_ADMIN_EMAILS`, a comma-separated allowlist of verified sign-in email addresses. An absent allowlist denies access. This is a server-only setting, never a client-side permission check.

Private packages come from GitHub Packages through `.npmrc` and `GITHUB_PACKAGES_TOKEN`. The token is install-time tooling, not an application secret. Current compatible versions, all pinned exactly, are `@turnal-io/db` 1.1.1, `@turnal-io/email` 2.2.3, `@turnal-io/auth` 4.0.0, `@turnal-io/ratelimit` 1.1.1, and Better Auth 1.7.23 with `@better-auth/mcp` 1.7.23 (the auth package supports `>=1.7.23 <1.8.0` and requires `@better-auth/mcp` at the same version as a peer; Fitt has no MCP server and never imports it). Upgrade them together after verifying compatibility; `src/server/auth-config.test.ts` runs the package's construction checks against the production configuration and `assertAuthSchema` against the Drizzle schema (Better Auth 1.7 checks the schema on the first auth request and answers every auth request with a 500 on a mismatch). Vitest uses the supported 4.x range rather than bypassing peer dependency checks. `@turnal-io/db` requires `pg` and `@neondatabase/serverless` as peers: Fitt imports only `/serverless`, and declares `pg` as a development dependency for `drizzle-kit`. `@turnal-io/email` no longer lists `worker-mailer` as a peer, so Fitt keeps it pinned exactly (1.2.1) in its own dependencies for the Worker SMTP transport.

SMTP follows Juno: implicit TLS on port 465 through `@turnal-io/email`, with bounded delivery and sanitized errors. A failed transport is never reported as a sent link. When the managed Node environment only supplies an HTTP proxy, magic-link delivery is reported unavailable; the Google option and guest workflows still work. Public SMTP requires an appropriate network/runtime or a separately chosen HTTPS transport. Tests use in-memory senders and never send real mail.

## Sign-in behavior

- Google and magic-link sign-in create an account on first use. Magic links last five minutes and are single-use; the database stores only a hash of each link's token.
- Sessions last seven days and are extended once a day while in use. The session cookie is host-only, HttpOnly, SameSite=Lax, and `__Secure-` prefixed on HTTPS.
- Sign-in requests are limited twice. Fitt's Postgres limiter allows 20 sign-in requests per source and 5 magic-link requests per email address every 10 minutes. Better Auth's rules, shared across Worker isolates through `RATE_LIMIT_DO`, apply per client IP as token buckets (a burst of the full amount, then an even refill): 30 Google sign-in starts and 30 magic-link verifications per minute, 5 magic-link requests per minute, and 100 OAuth callbacks per 10 seconds. Session reads and sign-out keep Better Auth's 100 per 10 seconds, counted per Worker isolate rather than shared, so they never wait on the Durable Object. A limited fetch receives 429: the magic-link form asks the user to wait and Google sign-in shows its generic retry message. A limited link click or OAuth callback (a browser navigation) returns to `/?account=return&error=rate_limited`, where the account controls say there were too many sign-in attempts and to wait a moment.
- If the rate-limit Durable Object is unavailable or slow (over 1.5 seconds), sign-in, magic-link verification, and OAuth callbacks are refused with 429 until it recovers; signed-in session reads and syncing continue.
- A magic-link email the mail transport rejects answers 503 (`EMAIL_DELIVERY_FAILED`) instead of a success, and the form says the email could not be sent.

## Migrations

```sh
bun run db:generate --name describe_the_change
bun run db:migrate
```

Generation is offline and produces reviewable SQL under `drizzle/`. Applying migrations is explicit, uses the configured database, and is not part of builds, installs, or app startup. One database transaction acquires a transaction-scoped PostgreSQL advisory lock before creating or re-reading the journal; it then applies pending SQL and journal entries before committing. This keeps one PostgreSQL backend pinned through Neon's transaction pooler and releases the lock automatically on commit or rollback. The runner uses Drizzle's migration-file reader without nesting Drizzle's own transaction-owning migrator. The journal format remains isolated under `fitt_meta`; app tables use the `fitt_` prefix. Every applied timestamp and hash must match a local migration file; older or diverged checkouts stop before applying new SQL. Keep migration SQL transaction-safe (no `BEGIN`/`COMMIT` or concurrent index creation), keep applied files immutable, and add a new migration for schema changes. Use a development branch before production migrations.

## Ownership and local data

- Guest state retains the existing `form.training.v1` key and backup format.
- Account state and its immutable pending write are saved atomically under a key containing the account ID. The local account pointer is only an offline-display hint, never authentication.
- Signing in does not upload guest history. **Import device progress** asks for confirmation, unions completed workouts/routines by ID, and keeps account preferences. Conflicting same-ID contents require a choice rather than silent replacement.
- Guest history remains available after sign-out. Active workouts remain scoped to the current device/account; account switching is blocked until the active workout is finished or discarded.
- Backups remain available. A confirmed restore or reset while signed in changes account data and will sync that change; the UI explicitly describes that scope.

## Sync protocol

`GET /api/training` returns a consistent `{revision,data}` snapshot. Data includes completed history, routines, profile, and preferences, but excludes active workouts and generated plans. `PUT /api/training` accepts `{mutationId,baseRevision,data}` with an expected-account header. The session is authoritative; a mismatched header is rejected before accessing another account's data.

The first version sends bounded snapshots (10 MB maximum), updating only changed rows inside a transaction. A per-account row lock serializes changes. A stale base revision produces a conflict instead of overwriting a newer snapshot. Idempotency receipts make retries safe; replaying an acknowledged request returns the current authoritative snapshot. Reusing a mutation ID with another payload is rejected. Receipts are bounded, and revision comparison still protects older retries after receipt pruning.

The browser saves an immutable outbox before sending. It merges independent additions and fields against its baseline, preserving edits made while a request is in flight. Conflicting edits/deletions pause sync and expose both choices plus a backup. Network reconnection, focus, manual sync, and polling retry pending work. Storage failures pause writes instead of discarding the queue. Rewards remain derived from unique completed sessions, so retry/import does not grant XP twice.

## Realtime and validation

`worker.ts` handles `/api/realtime` before delegating to `vinext/server/app-router-entry`. It checks the browser origin, pre-checks the session cookie's signature with `@turnal-io/auth`'s `verifySessionCookie`, and then requires an unexpired session row for that token; a signed-out or expired session's cookie still has a valid signature, so the database lookup is what authorises the channel. The authenticated account selects its Durable Object; clients cannot select another account. Only internal server writes publish revision hints. WebSocket Hibernation stores bounded attachments; alarms expire connections and force fresh authorization. The channel carries no workout documents and is not required for syncing.

```sh
bun run typecheck
bun run typecheck:worker
bun run test
bun run test:realtime
bun run test:email-worker
bun run test:worker-context
bun run test:db
bun run check:deploy
bun run test:worker-account
bun run build:preview
bun run build:form-preview
bun run test:e2e
bun run test:account
```

Live tests require a migrated development database and opt in via `FITT_RUN_LIVE_DB_TESTS=1` (set by `test:db`/`test:account`). Each test creates unique fixture users and removes those users with cascading data cleanup. Browser tests default to the built Worker on `http://127.0.0.1:4173`. For an explicitly authorized hosted check, set `FITT_LIVE_TEST_ORIGIN` to the exact HTTPS origin and use its matching database and signing secret; only the live-account suite runs, without a local server. Short-lived fixture sessions use secure cookies on HTTPS, traces are disabled, and managed proxy settings remain active. The tests do not bypass production auth or add a test-login endpoint.

The built Worker smoke suite uses synthetic configuration to check account availability, origin rejection, signed-out Admin denial, private asset protection, realtime routing, and public assets without connecting to a database or SMTP. The native context suite separately verifies background-work completion and per-request pool cleanup. Full Google provider login, real SMTP delivery, and hosted Worker bindings must still be validated on the authorized environment. A dry-run bundle check is not a deployment. See [migration validation](vinext-migration.md) for the managed environment's local workerd/Neon networking limitation and the prepared hosted check.
