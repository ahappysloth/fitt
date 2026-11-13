/**
 * Starts the actual Wrangler dry-run bundle in workerd with synthetic bindings.
 * Run bun run check:deploy first, then node --test scripts/test-worker-account.mjs.
 * These guest/origin checks never connect to a database or send email.
 */
import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { convertV4MiniflareOptions, Log, LogLevel, Miniflare } from 'miniflare'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function builtWorker() {
  // Use the generated deployment config rather than assuming the Vite entry's
  // name or the relative location of its copied public assets.
  const configPath = resolve(root, 'dist/server/wrangler.json')
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  assert.equal(typeof config.main, 'string', 'The built Worker must have an entry module')
  assert.equal(typeof config.assets?.directory, 'string', 'The built Worker must have assets')
  assert.equal(config.assets.binding, 'ASSETS')
  const workspace = config.durable_objects?.bindings?.find(
    (binding) => binding.name === 'WORKSPACE_DO',
  )
  assert.equal(workspace?.class_name, 'WorkspaceDO', 'The realtime binding must remain configured')
  const rateLimit = config.durable_objects?.bindings?.find(
    (binding) => binding.name === 'RATE_LIMIT_DO',
  )
  assert.equal(
    rateLimit?.class_name,
    'RateLimitDO',
    'The auth rate-limit binding must be configured',
  )
  const bundle = resolve(root, '.wrangler/dry-run', basename(config.main))
  const assetsDirectory = resolve(dirname(configPath), config.assets.directory)
  await Promise.all([access(bundle), access(assetsDirectory)])
  return { bundle, assetsDirectory, config }
}

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? filesIn(path) : path
    }),
  )
  return nested.flat()
}

test(
  'built Worker preserves account, realtime, and private Admin boundaries',
  { timeout: 30_000 },
  async (t) => {
    const { bundle, assetsDirectory, config } = await builtWorker()
    // Vinext emits an ESM graph. Miniflare 5's V4 adapter registers only the
    // entry for `modules: true`, so provide every emitted JS module explicitly.
    const moduleFiles = (await filesIn(dirname(bundle))).filter(
      (file) => file !== bundle && /\.m?js$/.test(file),
    )
    const modules = [bundle, ...moduleFiles].map((path) => ({ type: 'ESModule', path }))
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
        modules,
        modulesRoot: dirname(bundle),
        compatibilityDate: config.compatibility_date,
        compatibilityFlags: config.compatibility_flags,
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
          FITT_ADMIN_EMAILS: 'owner@example.test',
        },
        durableObjects: {
          WORKSPACE_DO: { className: 'WorkspaceDO', useSQLite: true },
          RATE_LIMIT_DO: { className: 'RateLimitDO', useSQLite: true },
        },
        assets: {
          directory: assetsDirectory,
          binding: config.assets.binding,
          run_worker_first: config.assets.run_worker_first,
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
    await runtime.ready

    await t.test('exposes account availability with the Worker email adapter', async () => {
      const response = await runtime.dispatchFetch('https://fitt.example/api/account')
      assert.equal(response.status, 200)
      assert.match(response.headers.get('cache-control'), /no-store/)
      assert.deepEqual(await response.json(), {
        user: null,
        providers: { google: true, magicLink: true },
        realtime: true,
      })
    })

    await t.test(
      'rejects cross-origin mutations before opening database or SMTP connections',
      async () => {
        for (const path of ['/api/auth/sign-in/magic-link', '/api/training']) {
          const denied = await runtime.dispatchFetch(`https://fitt.example${path}`, {
            method: path === '/api/training' ? 'PUT' : 'POST',
            headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'athlete@example.test' }),
          })
          assert.equal(denied.status, 403, path)
          assert.match(denied.headers.get('cache-control'), /no-store/)
        }
      },
    )

    await t.test(
      'builds production-shaped auth and limits it through the shared Durable Object',
      async () => {
        // No database or email: /ok and a callback without OAuth state answer
        // before any query. (Miniflare adds CF-Connecting-IP to every request,
        // so the refusal of requests without one is pinned by the package's
        // own workerd test, not here.)
        const auth = (path, ip, headers = {}) =>
          runtime.dispatchFetch(`https://fitt.example/api/auth/${path}`, {
            headers: { ...(ip ? { 'cf-connecting-ip': ip } : {}), ...headers },
            redirect: 'manual',
          })
        const ok = await auth('ok', '198.51.100.1')
        assert.equal(ok.status, 200)
        assert.deepEqual(await ok.json(), { ok: true })
        const callback = await auth('callback/google', '198.51.100.2')
        assert.equal(callback.status, 302)
        assert.match(callback.headers.get('location'), /^https:\/\/fitt\.example\/\?account=return/)
        // The OAuth callback is a pre-auth route, so Better Auth's default
        // rule (100 per 10 s per client, a token bucket refilling 10 per
        // second) is enforced through the sharded RATE_LIMIT_DO. A refused
        // browser navigation returns to the account controls with
        // error=rate_limited; a fetch keeps the JSON 429. Another client keeps
        // its own bucket.
        // A browser navigation's Accept header. (Node's fetch overwrites
        // Sec-Fetch-Mode, so dispatchFetch cannot send the other signal.)
        const navigate = { Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' }
        let allowed = 0
        let limited
        for (let index = 0; index < 400 && !limited; index += 1) {
          const response = await auth('callback/google', '198.51.100.3', navigate)
          await response.arrayBuffer()
          const location = new URL(response.headers.get('location') ?? '', 'https://fitt.example')
          if (location.searchParams.get('error') === 'rate_limited') limited = response
          else allowed += 1
        }
        assert.equal(limited?.status, 302)
        assert.equal(
          limited.headers.get('location'),
          'https://fitt.example/?account=return&error=rate_limited',
        )
        assert.ok(allowed >= 100 && allowed < 400, `allowed ${allowed}`)
        // A burst, not one request: the bucket refills a token every 100 ms,
        // so on a slow runner a single follow-up request can find a fresh one.
        const burst = await Promise.all(
          Array.from({ length: 20 }, () => auth('callback/google', '198.51.100.3')),
        )
        await Promise.all(burst.map((response) => response.arrayBuffer()))
        const fetched = burst.find((response) => response.status === 429)
        assert.ok(fetched, `no 429 in burst: ${burst.map((response) => response.status)}`)
        assert.ok(fetched.headers.get('x-retry-after'))
        assert.ok(burst.every((response) => response.status === 429 || response.status === 302))
        const other = await auth('callback/google', '198.51.100.4', navigate)
        assert.equal(other.status, 302)
        assert.doesNotMatch(other.headers.get('location'), /rate_limited/)
      },
    )

    await t.test(
      'protects native Admin documents and RSC requests without caching them',
      async () => {
        const access = await runtime.dispatchFetch('https://fitt.example/api/admin/access')
        assert.equal(access.status, 200)
        assert.match(access.headers.get('cache-control'), /no-store/)
        assert.deepEqual(await access.json(), { allowed: false })
        for (const path of [
          '/admin',
          '/admin/components',
          '/%61dmin',
          '/%61dmin/components',
          '//admin',
        ]) {
          for (const headers of [{}, { RSC: '1', Accept: 'text/x-component' }]) {
            const response = await runtime.dispatchFetch(`https://fitt.example${path}`, {
              headers,
              redirect: 'manual',
            })
            assert.equal(response.status, 303, path)
            assert.equal(
              response.headers.get('location'),
              'https://fitt.example/settings?admin=restricted',
            )
            assert.match(response.headers.get('cache-control'), /private, no-store/)
          }
        }
        for (const path of [
          '/api/admin/previews/form',
          '/api/admin/previews/components',
          '/preview/fitt-form-studio.html',
          '/preview/fitt-redesign.html',
          '/.generated/admin-previews.json',
        ]) {
          const response = await runtime.dispatchFetch(`https://fitt.example${path}`)
          assert.equal(response.status, 404, path)
        }
      },
    )

    await t.test(
      'routes realtime through origin and session checks before the Durable Object',
      async () => {
        const request = (headers) =>
          runtime.dispatchFetch('https://fitt.example/api/realtime', { headers })
        const notAnUpgrade = await request({ Origin: 'https://fitt.example' })
        assert.equal(notAnUpgrade.status, 426)
        const crossOrigin = await request({
          Origin: 'https://attacker.example',
          Upgrade: 'websocket',
        })
        assert.equal(crossOrigin.status, 403)
        const unsigned = await request({
          Origin: 'https://fitt.example',
          Upgrade: 'websocket',
          'x-fitt-realtime-user': 'forged-user',
        })
        assert.equal(unsigned.status, 401)
        assert.match(unsigned.headers.get('cache-control'), /no-store/)
      },
    )

    await t.test(
      'sets security headers on every Worker response, with a report-only CSP',
      async () => {
        const enforced = {
          'strict-transport-security': 'max-age=63072000; includeSubDomains',
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'DENY',
          'referrer-policy': 'strict-origin-when-cross-origin',
          'permissions-policy': 'camera=(), microphone=(), geolocation=()',
        }
        const requests = [
          ['/', {}],
          ['/workout', {}],
          ['/workout', { RSC: '1', Accept: 'text/x-component' }],
          ['/not-a-fitt-page', {}],
          ['/sw.js', {}],
          ['/manifest.webmanifest', {}],
          ['/api/account', {}],
          ['/api/training', {}],
          ['/api/auth/ok', {}],
          // Answered by worker.ts itself, never by vinext.
          ['/admin', {}],
          ['/api/realtime', { Origin: 'https://fitt.example' }],
          ['/api/csp-report', {}],
        ]
        for (const [path, headers] of requests) {
          const response = await runtime.dispatchFetch(`https://fitt.example${path}`, {
            headers,
            redirect: 'manual',
          })
          await response.arrayBuffer()
          for (const [name, value] of Object.entries(enforced))
            assert.equal(response.headers.get(name), value, `${path} ${name}`)
          assert.equal(response.headers.get('content-security-policy'), null, path)
          const policy = response.headers.get('content-security-policy-report-only') ?? ''
          assert.match(policy, /frame-ancestors 'none'/, path)
          assert.match(policy, /connect-src 'self' wss:\/\/fitt\.example;/, path)
          assert.match(policy, /report-uri \/api\/csp-report$/, path)
        }
        const report = await runtime.dispatchFetch('https://fitt.example/api/csp-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/csp-report' },
          body: JSON.stringify({
            'csp-report': {
              'document-uri': 'https://fitt.example/workout',
              'effective-directive': 'script-src-elem',
              'blocked-uri': 'inline',
            },
          }),
        })
        assert.equal(report.status, 204)
        const oversized = await runtime.dispatchFetch('https://fitt.example/api/csp-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/csp-report' },
          body: 'x'.repeat(16 * 1024 + 1),
        })
        assert.equal(oversized.status, 413)
      },
    )

    await t.test('serves the shell, client chunks, and noncacheable service worker', async () => {
      for (const path of ['/', '/workout', '/journey', '/library', '/settings', '/builder']) {
        const shell = await runtime.dispatchFetch(`https://fitt.example${path}`)
        assert.equal(shell.status, 200, path)
        assert.match(await shell.text(), /Fitt/)
      }
      const missing = await runtime.dispatchFetch('https://fitt.example/not-a-fitt-page')
      assert.equal(missing.status, 404)
      const clientScript = (await filesIn(assetsDirectory)).find(
        (file) =>
          relative(assetsDirectory, file).startsWith(`_next${sep}static${sep}`) &&
          file.endsWith('.js'),
      )
      assert.ok(clientScript, 'The build must produce a client script')
      const clientUrl = '/' + relative(assetsDirectory, clientScript).split(sep).join('/')
      const asset = await runtime.dispatchFetch(`https://fitt.example${clientUrl}`)
      assert.equal(asset.status, 200)
      assert.match(asset.headers.get('content-type'), /javascript/)
      const serviceWorker = await runtime.dispatchFetch('https://fitt.example/sw.js')
      assert.equal(serviceWorker.status, 200)
      assert.match(serviceWorker.headers.get('cache-control'), /no-store/)
      assert.equal(serviceWorker.headers.get('service-worker-allowed'), '/')
    })
  },
)
