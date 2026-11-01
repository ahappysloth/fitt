/**
 * Starts the actual Wrangler dry-run bundle in workerd with synthetic bindings.
 * Run npm run check:deploy first, then node --test scripts/test-worker-account.mjs.
 * These guest/origin checks never connect to a database or send email.
 */
import assert from 'node:assert/strict'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { convertV4MiniflareOptions, Log, LogLevel, Miniflare } from 'miniflare'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test(
  'built Worker exposes account availability with request-local SMTP',
  { timeout: 30_000 },
  async (t) => {
    const bundle = join(root, '.wrangler/dry-run/worker.js')
    await access(bundle)
    const temporary = await mkdtemp(join(tmpdir(), 'fitt-worker-account-'))
    let runtime
    t.after(async () => {
      try {
        await runtime?.dispose()
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    })

    runtime = new Miniflare({
      ...convertV4MiniflareOptions({
        name: 'fitt-account-smoke',
        host: '127.0.0.1',
        port: 0,
        modules: true,
        scriptPath: bundle,
        compatibilityDate: '2026-10-30',
        compatibilityFlags: ['nodejs_compat', 'global_fetch_strictly_public'],
        bindings: {
          DATABASE_URL: 'postgresql://fixture:fixture@ep-fixture-pooler.example.neon.tech/test',
          BETTER_AUTH_SECRET: 'test-only-secret-with-at-least-thirty-two-characters',
          BETTER_AUTH_URL: 'https://fitt.example',
          TRUSTED_ORIGINS: 'https://fitt.example',
          GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com',
          GOOGLE_CLIENT_SECRET: 'fixture-google-secret',
          SMTP_HOST: 'smtp.example.test',
          SMTP_USER: 'fixture-smtp-user',
          SMTP_PASS: 'fixture-smtp-password',
          EMAIL_FROM: 'Fitt <fitt@example.test>',
        },
        durableObjects: { WORKSPACE_DO: { className: 'WorkspaceDO', useSQLite: true } },
        serviceBindings: { WORKER_SELF_REFERENCE: 'fitt-account-smoke' },
        assets: {
          directory: join(root, '.open-next/assets'),
          binding: 'ASSETS',
          run_worker_first: true,
          routerConfig: { has_user_worker: true },
        },
        log: new Log(LogLevel.ERROR),
        cf: false,
        telemetry: { enabled: false },
        resourcePersistencePath: join(temporary, 'persistent'),
        isolatedResourcePersistencePath: join(temporary, 'isolated'),
        resourceTmpPath: join(temporary, 'runtime'),
      }),
      enableDevRegistry: false,
    })

    const response = await runtime.dispatchFetch('https://fitt.example/api/account')
    assert.equal(response.status, 200)
    assert.match(response.headers.get('cache-control'), /no-store/)
    assert.deepEqual(await response.json(), {
      user: null,
      providers: { google: true, magicLink: true },
      realtime: true,
    })

    const denied = await runtime.dispatchFetch('https://fitt.example/api/auth/sign-in/magic-link', {
      method: 'POST',
      headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'athlete@example.test' }),
    })
    assert.equal(denied.status, 403)
  },
)
