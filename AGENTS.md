Fitt runs on vinext with the Cloudflare Vite plugin. `bun run dev` starts Vite;
`bun run build` creates `dist/server` and `dist/client`; `bun run preview` runs
the built Worker in workerd. The `next` package is not installed: vinext
implements the supported `next/*` imports, and its fallback declarations
(`vinext/types` in `tsconfig.json`) type them. Do not restore the Next CLI,
the `next` package, or OpenNext.

Check vinext's installed documentation and source (`node_modules/vinext/`,
`node_modules/@vinext/types/`) for runtime behavior and the supported App
Router API surface; it may differ from the Next.js you know. Auth is built with
the framework-free root entry of `@turnal-io/auth` (see `docs/platform.md`).

## Stack basics

- The [Turnal stack guide](https://github.com/turnal-io/turnalbase/blob/main/docs/stack-guide.html) is the
  cross-repo reference for the shared stack, packages, deploys and secrets.
- Deploy: a push to `main` runs `.github/workflows/ci.yml`; once `verify` passes, the `deploy` job builds
  and publishes the `fitt` Worker. No repo variable gates it; PRs only verify. Roll back with
  `bunx wrangler rollback <version-id> --name fitt`, but Cloudflare refuses a rollback past a Durable
  Object migration (`v1` `WorkspaceDO`, `v2` `RateLimitDO`), so fix forward then. See
  [docs/deployment.md](docs/deployment.md).
- Package manager: Bun 1.4.4, pinned by `packageManager` in `package.json` (CI reads it). Install with
  `bun install --frozen-lockfile` and `GITHUB_PACKAGES_TOKEN` set for the private `@turnal-io/*`
  packages (CI maps the `GH_PACKAGES_TOKEN` secret onto it).
- `@turnal-io/*` packages:
  - `auth`: the Better Auth factory (root entry) and `verifySessionCookie` for realtime upgrades.
  - `db`: `/serverless`, the per-request Neon WebSocket pool behind Drizzle.
  - `email`: magic-link mail; `/workerd` sends it from the Worker over SMTP (port 465).
  - `ratelimit`: the auth rate limiter's Durable Object token bucket (`RATE_LIMIT_DO`).
- Worker secrets: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `FITT_ADMIN_EMAILS`. Vars: `BETTER_AUTH_URL`,
  `TRUSTED_ORIGINS`. Bindings: `ASSETS`, `WORKSPACE_DO`, `RATE_LIMIT_DO`.
- Gotchas:
  - Run `bun run test`, never `bun test`: the tests are Vitest, and `bun test` starts Bun's own runner.
  - Bun installs and launches scripts, but Vite, Vitest, Wrangler and `node --test` still run on Node
    22.12+, so keep Node installed.
  - `DATABASE_URL` must be a Neon `-pooler` host; `src/server/db.ts` refuses anything else.
  - Builds and deploys never touch the schema: run `bun run db:migrate` yourself (docs/accounts.md).
  - Type checks regenerate the ignored `cloudflare-env.d.ts`; rerun `bun run cf:typegen` after editing
    `wrangler.jsonc`.
