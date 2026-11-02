# Vinext migration validation

Vinext release `5aceaaf` replaces the deployed Next.js/OpenNext release `dd1f1b2`. The React application, database schema, saved workout format, account identifiers, and production Durable Object namespace remain compatible. Implementation and local validation used the isolated `migration/vinext` branch before promotion to `main`.

## Status

| Area                                                | Status                                      | Evidence                                                                                                                                                                                                                                         |
| --------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Existing test and deployment assumptions            | Reviewed                                    | Build-path changes are isolated to tooling; browser workflows remain applicable.                                                                                                                                                                 |
| Vinext compatibility, types, and production build   | Passed                                      | Compatibility scan: 14 supported, one partial Strict Mode behavior covered by an explicit React wrapper, zero blockers. Both type checks, production build, and Wrangler dry run passed.                                                         |
| Application unit tests                              | 172 passed; 9 skipped                       | Optional live database checks are tracked separately.                                                                                                                                                                                            |
| Built Worker account and Admin routing              | Passed in real workerd                      | All five smoke subtests pass against the fresh generated artifact, including `/sw.js` routing and cache headers.                                                                                                                                 |
| Native Worker environment and request lifetime      | Passed in real workerd                      | `scripts/test-worker-context.mjs` verifies native bindings, concurrent response completion, and pool disposal after each request's background work.                                                                                              |
| Realtime and Worker email modules                   | Passed in real workerd                      | Five Durable Object checks and one email-module check passed without real email delivery.                                                                                                                                                        |
| Desktop, mobile, model guides, and private previews | 59 passed; 3 skipped                        | Complete Playwright suite passed against the built Cloudflare Worker.                                                                                                                                                                            |
| Live Neon database, auth, and migrations            | 9 passed                                    | Actual Neon transactions, magic-link lifecycle with an in-memory sender, and migration locking/rollback passed; synthetic fixtures were cleaned up.                                                                                              |
| Signed-in Worker account synchronization            | Desktop and mobile passed on production     | Two hosted tests passed: secure sessions, native Worker/Neon access, explicit import, second-device restore, signed-in DO revision frames, offline replay without duplication, isolation, sign-out, and fixture cleanup.                         |
| Next.js to vinext offline upgrade                   | Passed locally and on the production origin | Local saved workouts/routine/preferences survived. A persistent production browser retained its saved workout ID and reps, activated the update, retained the old cache, and opened the 3D guide and logged a set offline with zero page errors. |
| GitHub Actions release                              | Verify and deploy passed                    | Run [41376271663](https://github.com/ahappysloth/fitt/actions/runs/41376271663) deployed commit `5aceaaf`.                                                                                                                                       |
| Production HTTP, assets, and namespace              | Passed                                      | Shell, manifest, client assets, service-worker cache headers, provider metadata, private Admin denials, hidden configuration paths, and realtime upgrade routing passed. The original `WORKSPACE_DO` namespace is unchanged.                     |
| Production promotion and rollback point             | Deployed at 100%; backup retained           | Active version `9f052c97-eeed-4980-951c-0bbec2b54b17`; remote `backup/nextjs-before-vinext` points to `dd1f1b2`; previous Cloudflare version `8a77bb03-b612-40fa-b93c-d62253366322` remains the rollback reference.                              |

The hosted checks use real Worker routing, database connections, signed fixture sessions, and Durable Objects. They do not perform a Google OAuth exchange or deliver mail to a real recipient.

Desktop (1440 px) and mobile (390 px) screenshots were compared with the prior UI using the same 20-minute bodyweight plan. Typography, colors, card geometry, and controls remain consistent; neither viewport has horizontal overflow or page errors. Review captures are in `/tmp/fitt-vinext-ui/`, with the state-matched pair named `desktop-state-matched.png` and `mobile-state-matched.png`. The same-origin offline migration evidence is in `/tmp/fitt-vinext-migration/evidence.json`.

## Local and CI checks

Run formatting and both application and Worker type checks from a clean checkout. The private Admin bundle must be generated before the production build; its absence must not break a standalone type check.

The ordinary suite remains:

```sh
npm run format:check
npm run typecheck
npm run typecheck:worker
npm test
npm run test:realtime
npm run test:email-worker
npm run test:worker-context
npm run check:deploy
npm run test:worker-account
npm run build:preview
npm run build:form-preview
npm run test:e2e
```

The native Worker context check bundles the production environment bridge and request lifecycle with synthetic database/auth resources. The built Worker browser server must use the generated Cloudflare deployment output; a Node-only server does not verify Cloudflare bindings or WebSocket routing. Ordinary browser checks use `http://127.0.0.1:4173`; only the opt-in account fixture suite accepts an explicit hosted origin.

The built Worker smoke test checks these boundaries with synthetic configuration and no database or SMTP connection:

- Account availability sees the native Worker bindings and Worker email adapter.
- Cross-origin mutations fail before opening resources.
- Signed-out Admin requests return private, uncached denials.
- Generated Admin documents are absent from public assets and public URLs.
- Realtime requests reach the application origin, upgrade, and session checks.
- The shell, hashed client scripts, and service worker are served through the production routing configuration, including service-worker cache headers.

## Account and persistence checks

The existing opt-in database and account browser suites create uniquely named synthetic users and remove their own data. They cover magic-link verification and replay/expiry with an in-memory delivery sink, account isolation, concurrent-save protection, two-device restoration, offline synchronization, and sign-out.

```sh
npm run test:db
npm run test:account
```

Use an explicitly selected migrated test database. Do not put credentials, session cookies, or magic-link tokens in logs, screenshots, or committed files. These checks do not prove a real Google OAuth exchange or delivery to a person's mailbox; verify those separately with an authorized user flow.

Local workerd cannot resolve the external Neon WebSocket destination in this managed environment, even though the permitted Node connection succeeds through the configured HTTPS proxy. Preserve the network policy and native production transport; do not bypass the proxy or replace the production WebSocket driver to make a local test pass.

Run the isolated account fixture checks against the existing Worker with the matching database and signing-secret environment:

```sh
FITT_LIVE_TEST_ORIGIN=https://fitt.turnal.workers.dev npm run test:account
```

The script already enables `FITT_RUN_LIVE_DB_TESTS=1`. An external origin requires that opt-in and an exact HTTPS origin; it selects only `account-live.spec.ts` and does not start a local server. HTTPS sessions use the `__Secure-` cookie prefix. Live-account traces are disabled, inherited proxy settings remain in use, and fixture cleanup still runs if a browser context fails to close. The suite checks explicit import, two-device restoration, signed-in Durable Object revision messages, offline replay without duplication, account isolation, and sign-out. Both hosted projects passed against release `5aceaaf` in 30.8 seconds, and their temporary database fixtures were removed.

The request-lifetime checks must establish that per-request database pools remain open until their background work settles and are released through the Worker execution lifetime. Native runtime bindings must not be stored in a mutable module-level request variable.

## Promotion and rollback

The release uses the existing `fitt` Worker at `https://fitt.turnal.workers.dev`. No additional hostname, Google callback, Worker, or Durable Object namespace is required. `backup/nextjs-before-vinext` preserves `dd1f1b2`; the recorded rollback version is listed above and in [deployment instructions](deployment.md). The main workflow builds and deploys the checked commit. Preserve the production `WorkspaceDO` class, binding name, namespace, and existing migration tag.

Before promotion, verify locally that a browser with an existing Next.js offline cache can activate the new service worker and still open a workout offline; confirm the update again on the production origin afterward. Do not cache account, authentication, realtime, RSC, or private Admin responses. Keep one previous static build available to open tabs during the transition.

CI must build the checked commit and keep Cloudflare deployment credentials in the deployment step. Verification on the migration branch must not deploy production. Keep the backup source branch and recorded Cloudflare version available until production smoke checks pass. A rollback restores the previous Worker version and reverts the migration on `main`; it must not reset database records or Durable Objects.
