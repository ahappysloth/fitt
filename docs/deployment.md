# Deploying Fitt

Fitt's production Worker is `fitt` in the Cloudflare account whose workers.dev subdomain is `turnal`, at `https://fitt.turnal.workers.dev`. The vinext migration deploys to this existing Worker after local validation. Source configuration in `wrangler.jsonc` declares static assets, the SQLite-backed `WorkspaceDO` binding/migration, authentication origins, and required application secret names. Vite produces the deployable configuration at `dist/server/wrangler.json`; local preview and deployment commands use that generated file.

## Credentials and runtime configuration

Deployment tooling reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Use a token with Workers deployment permissions for the intended account. These credentials and the package-install token do not belong in the Worker's app secrets.

GitHub Actions uses three repository secrets:

| Repository secret       | Purpose                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `GH_PACKAGES_TOKEN`     | Read the private GitHub Packages dependencies; mapped to `GITHUB_PACKAGES_TOKEN` during `npm ci`. |
| `CLOUDFLARE_API_TOKEN`  | Deploy the Worker.                                                                                |
| `CLOUDFLARE_ACCOUNT_ID` | Select its Cloudflare account.                                                                    |

The app needs eight values provisioned separately on the Worker: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM`. Use the Fitt-specific database/auth values already configured for this project. Store all eight as **encrypted Worker secrets**, including `SMTP_HOST` and `EMAIL_FROM`, through Cloudflare's Variables and Secrets settings or Wrangler's secret commands; never commit their values. Worker secrets persist across deployments. Ordinary dashboard variables can be replaced by Wrangler's configured variables on a later deployment. Codex environment variables and GitHub repository secrets do not automatically become Worker bindings.

Private Admin access uses the server-side `FITT_ADMIN_EMAILS` allowlist of verified sign-in addresses. The application denies access when it is empty or absent. This production configuration declares it as a required secret to preserve the existing Admin setup; all nine required secrets were confirmed on the `fitt` Worker before the migration. A deployment that deliberately disables Admin can remove this name from `secrets.required`. Never replace the encrypted allowlist with a public client variable.

The production `BETTER_AUTH_URL` and `TRUSTED_ORIGINS` values are declared in `wrangler.jsonc` as `https://fitt.turnal.workers.dev`. Google's authorized redirect URI remains `https://fitt.turnal.workers.dev/api/auth/callback/google`. The migration does not require a new Worker, hostname, or OAuth callback.

Vite development runs on port 5173. `npm run preview` serves the built Worker at `http://127.0.0.1:4173` and explicitly sets its authentication origins to that address. Wrangler's configured application secret names can read corresponding local environment variables; `.dev.vars.example` documents optional ignored local overrides. The Cloudflare Vite plugin can copy these scoped secrets into ignored `dist/server/.dev.vars` for local preview. Keep server build output private; only `dist/client` is a public asset directory. The runtime allowlist excludes GitHub Packages and Cloudflare deployment credentials.

## Migration release and rollback

1. Preserve the deployed Next.js release `dd1f1b2` in `backup/nextjs-before-vinext` and record the currently deployed Cloudflare version before promotion. The backup branch preserves source; the Cloudflare version identifies the deployed artifact to restore if needed.
2. Confirm the selected Cloudflare account owns the `turnal` workers.dev subdomain and the intended existing Worker is `fitt`. Keep its database, authentication settings, and Durable Object namespace. Migrations remain explicit and are never part of installs, builds, or deployment; this runtime migration does not require schema changes. Automated live checks use uniquely named synthetic fixture accounts in the explicitly selected test database and remove them afterward.
3. Run the [migration validation checks](vinext-migration.md), including `npm run check:deploy` and `npm run test:worker-account`. The dry run does not publish.
4. After local checks pass, merge the migration into `main` and push the authorized release. GitHub Actions verifies and deploys that commit to the existing `fitt` Worker. `npm run deploy` is the manual equivalent when explicitly authorized. Preserve the existing `WORKSPACE_DO` binding, `WorkspaceDO` class, and `v1` migration; do not rename its namespace or reset existing Durable Objects.
5. Perform the hosted checks below. If a material runtime regression requires rollback, restore the recorded Cloudflare version and revert the migration commit on `main` before another automatic deployment. Do not delete saved training data, change schema, or reset the Durable Object namespace as part of a runtime rollback.

The pre-migration production version is `8a77bb03-b612-40fa-b93c-d62253366322`, backed by `backup/nextjs-before-vinext` at `dd1f1b2`. To restore that deployed artifact when a rollback is needed:

```sh
npx wrangler rollback 8a77bb03-b612-40fa-b93c-d62253366322 --name fitt
```

Then revert the migration commits on `main` so the next successful CI run also deploys the restored source. Coordinate this with any running main deployment to avoid immediately overwriting the rollback.

The managed cloud environment uses the existing HTTPS access to `api.cloudflare.com` for deployment and `fitt.turnal.workers.dev` for validation. No migration command publishes the managed environment configuration.

## Continuous deployment

`.github/workflows/ci.yml` checks pull requests and pushes to `main` or `migration/vinext`. It installs the lockfile, generates Worker types, checks formatting/types, runs unit and local workerd tests, validates the full Worker build, and runs desktop/mobile browser tests against the built Worker. Database integration tests remain opt-in; CI does not receive the app's database or mail credentials. Fork pull requests cannot access the private-package repository secret and require a trusted maintainer workflow before their checks can run; this workflow does not use `pull_request_target`.

Only a successful main push or a manual run on main deploys production; migration-branch verification does not deploy. The deploy job rebuilds the same checked commit in a clean checkout, then receives Cloudflare credentials only for `wrangler deploy --config dist/server/wrangler.json`. It does not consume build artifacts or extracted dependencies from pull requests. Main deployments are serialized; PR checks can cancel obsolete PR runs. Actions are pinned to verified release commits.

The workflow starts once it is pushed to GitHub. Adding repository secrets alone does not run it. Do not also enable a second automatic deployment pipeline for this Worker unless you intend to maintain both.

## Hosted checks

Verify the page, manifest, `/sw.js`, hashed client assets, and uncached `/api/account` response. The service worker must have `Cache-Control: no-store` and `Service-Worker-Allowed: /`. With runtime configuration present, the account response should advertise Google, magic-link, and realtime availability. This metadata check does not prove provider login, email delivery, or a database-backed authenticated request. Signed-out private Admin preview requests must remain denied and uncached; generated preview HTML must not be served as a public asset.

Complete Google login and a real magic-link login, then test explicit device-history import and sync between two browsers. In a deployed Worker, verify realtime updates and that an offline workout uploads once after reconnection. Test an existing Next.js offline cache upgrading to the vinext build locally before promotion, then confirm the update on the existing production origin without losing saved training state. Do not send a test email without an explicitly chosen recipient. Keep production testing separate from the opt-in database fixture suites.
