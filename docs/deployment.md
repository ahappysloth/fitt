# Deploying Fitt

Fitt's configured Worker is `fitt` in the Cloudflare account whose workers.dev subdomain is `turnal`. The target URL is `https://fitt.turnal.workers.dev`. `wrangler.jsonc` also declares the static assets, `WORKER_SELF_REFERENCE` service, SQLite `WorkspaceDO` migration, and deployed auth origins. The first deployment creates the Worker and Durable Object namespace.

## Credentials and runtime configuration

Deployment tooling reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Use a token with Workers deployment permissions for the intended account. These credentials and the package-install token do not belong in the Worker's app secrets.

GitHub Actions uses three repository secrets:

| Repository secret       | Purpose                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `GH_PACKAGES_TOKEN`     | Read the private GitHub Packages dependencies; mapped to `GITHUB_PACKAGES_TOKEN` during `npm ci`. |
| `CLOUDFLARE_API_TOKEN`  | Deploy the Worker.                                                                                |
| `CLOUDFLARE_ACCOUNT_ID` | Select its Cloudflare account.                                                                    |

The app needs eight values provisioned separately on the Worker: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM`. Use the Fitt-specific database/auth values already configured for this project. Store all eight as **encrypted Worker secrets**, including `SMTP_HOST` and `EMAIL_FROM`, through Cloudflare's Variables and Secrets settings or Wrangler's secret commands; never commit their values. Worker secrets persist across deployments. Ordinary dashboard variables can be replaced by Wrangler's configured variables on a later deployment. Codex environment variables and GitHub repository secrets do not automatically become Worker bindings.

The public `BETTER_AUTH_URL` and `TRUSTED_ORIGINS` values are declared in `wrangler.jsonc` as `https://fitt.turnal.workers.dev`. Google's authorized redirect URI must be exactly `https://fitt.turnal.workers.dev/api/auth/callback/google`. Local Next development continues to use localhost; local Worker preview uses the ignored `.dev.vars` overrides described in `.dev.vars.example`.

## First deployment

1. Confirm the selected Cloudflare account owns the `turnal` workers.dev subdomain and that an existing Worker named `fitt`, if any, is the intended app. Inspect an existing Worker before replacing its code.
2. Confirm the intended Neon database has the reviewed Fitt migrations. Migrations remain explicit and are never part of the deployment workflow. The development database used during implementation already has the two initial migrations; a different database needs its own migration step.
3. Run `npm run check:deploy` and `npm run test:worker-account` to validate locally. The dry run does not publish.
4. Run `npm run deploy` from an authorized shell with deployment credentials. A first deployment without app secrets supports device-only training. Provision the eight Worker values to enable accounts, then check the deployed account endpoint and perform hosted auth/sync validation.

The managed cloud environment must allow HTTPS to `api.cloudflare.com` for deployment and to `fitt.turnal.workers.dev` for validation. Adding those destinations to a saved configuration draft does not apply them to the running environment; publish the saved changes first.

## Continuous deployment

`.github/workflows/ci.yml` checks pull requests and main pushes. It installs the lockfile, generates types, checks formatting/types, runs unit and local workerd tests, validates the full Worker build, and runs desktop/mobile browser tests. Database integration tests remain opt-in; CI does not receive the app's database or mail credentials. Fork pull requests cannot access the private-package repository secret and require a trusted maintainer workflow before their checks can run; this workflow does not use `pull_request_target`.

Only a successful main push or a manual run on main deploys. The deploy job rebuilds the same checked commit in a clean checkout, then receives Cloudflare credentials only for deployment. It does not consume build artifacts or extracted dependencies from pull requests. Main deployments are serialized; PR checks can cancel obsolete PR runs. Actions are pinned to verified release commits.

The workflow starts once it is pushed to GitHub. Adding repository secrets alone does not run it. Do not also enable a second automatic deployment pipeline for this Worker unless you intend to maintain both.

## Hosted checks

Verify the page, manifest, and uncached `/api/account` response. With runtime configuration present, that response should advertise Google, magic-link, and realtime availability. This metadata check does not prove provider login, email delivery, or a database-backed authenticated request.

Complete Google login and a real magic-link login, then test explicit device-history import and sync between two browsers. In a deployed Worker, verify realtime updates and that an offline workout uploads once after reconnection. Do not send a test email without an explicitly chosen recipient. Keep production testing separate from the opt-in database fixture suites.
