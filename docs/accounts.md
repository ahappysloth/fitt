# Accounts, storage, and sync

Fitt can be used without signing in. Account features add cloud storage while keeping the workout experience available offline. Google and magic-link auth are passwordless. The single-file ChatGPT preview remains a device-only artifact; use the vinext development server or built Worker to exercise accounts.

## Configuration

Use the ten names in `.env.example`: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `TRUSTED_ORIGINS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM`. Supply credentials through environment settings or ignored local configuration. Use a Fitt-specific signing secret generated with `openssl rand -base64 32` and a pooled Neon development-branch URL. No secret has a `NEXT_PUBLIC_` prefix.

Vite development uses port 5173. `npm run build && npm run preview` runs the built Worker at `http://127.0.0.1:4173`, with both authentication origins explicitly set to that address. Local Wrangler can read the application variables declared in `wrangler.jsonc` from the process environment; `.dev.vars.example` documents optional ignored Worker-local configuration. Package/deployment credentials are not application bindings. Google's authorized callback must be exactly `<BETTER_AUTH_URL>/api/auth/callback/google`. Production origins must use HTTPS; use exact origins, not wildcards. Codex environment variables do not automatically populate a deployed Worker.

The production origin remains `https://fitt.turnal.workers.dev` during the vinext migration. Its two public auth-origin values are declared in `wrangler.jsonc`; the other eight application values must be provisioned on the Worker. The existing Google callback, `https://fitt.turnal.workers.dev/api/auth/callback/google`, remains unchanged. No additional Worker, hostname, or OAuth callback is required. See [deployment setup](deployment.md) for GitHub secret names and release workflow, and [migration validation](vinext-migration.md) for the current verification status.

Private Admin access additionally requires `FITT_ADMIN_EMAILS`, a comma-separated allowlist of verified sign-in email addresses. An absent allowlist denies access. This is a server-only setting, never a client-side permission check.

Private packages come from GitHub Packages through `.npmrc` and `GITHUB_PACKAGES_TOKEN`. The token is install-time tooling, not an application secret. Current compatible versions are `@turnal-io/db` 1.0.1, `@turnal-io/auth` 1.1.0, and Better Auth 1.6.23. Better Auth 1.7 removes an export imported by this Turnal auth version; upgrade the packages together after verifying compatibility. Vitest uses the supported 4.x range rather than bypassing peer dependency checks.

SMTP follows Juno: implicit TLS on port 465 through `@turnal-io/email`, with bounded delivery and sanitized errors. A failed transport is never reported as a sent link. When the managed Node environment only supplies an HTTP proxy, magic-link delivery is reported unavailable; the Google option and guest workflows still work. Public SMTP requires an appropriate network/runtime or a separately chosen HTTPS transport. Tests use in-memory senders and never send real mail.

## Migrations

```sh
npm run db:generate -- --name describe_the_change
npm run db:migrate
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

`worker.ts` handles `/api/realtime` before delegating to `vinext/server/app-router-entry`. It checks the browser origin and signed, unexpired database-backed session. The authenticated account selects its Durable Object; clients cannot select another account. Only internal server writes publish revision hints. WebSocket Hibernation stores bounded attachments; alarms expire connections and force fresh authorization. The channel carries no workout documents and is not required for syncing.

```sh
npm run typecheck
npm run typecheck:worker
npm test
npm run test:realtime
npm run test:email-worker
npm run test:worker-context
npm run test:db
npm run check:deploy
npm run test:worker-account
npm run build:preview
npm run build:form-preview
npm run test:e2e
npm run test:account
```

Live tests require a migrated development database and opt in via `FITT_RUN_LIVE_DB_TESTS=1` (set by `test:db`/`test:account`). Each test creates unique fixture users and removes those users with cascading data cleanup. Browser tests default to the built Worker on `http://127.0.0.1:4173`. For an explicitly authorized hosted check, set `FITT_LIVE_TEST_ORIGIN` to the exact HTTPS origin and use its matching database and signing secret; only the live-account suite runs, without a local server. Short-lived fixture sessions use secure cookies on HTTPS, traces are disabled, and managed proxy settings remain active. The tests do not bypass production auth or add a test-login endpoint.

The built Worker smoke suite uses synthetic configuration to check account availability, origin rejection, signed-out Admin denial, private asset protection, realtime routing, and public assets without connecting to a database or SMTP. The native context suite separately verifies background-work completion and per-request pool cleanup. Full Google provider login, real SMTP delivery, and hosted Worker bindings must still be validated on the authorized environment. A dry-run bundle check is not a deployment. See [migration validation](vinext-migration.md) for the managed environment's local workerd/Neon networking limitation and the prepared hosted check.
