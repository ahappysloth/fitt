/**
 * Starts the actual Wrangler dry-run bundle in workerd with synthetic bindings.
 * Run npm run check:deploy first, then node --test scripts/test-worker-account.mjs.
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
        durableObjects: { WORKSPACE_DO: { className: 'WorkspaceDO', useSQLite: true } },
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

    await t.test('keeps private Admin documents behind uncached route handlers', async () => {
      const access = await runtime.dispatchFetch('https://fitt.example/api/admin/access')
      assert.equal(access.status, 200)
      assert.match(access.headers.get('cache-control'), /no-store/)
      assert.deepEqual(await access.json(), { allowed: false })
      for (const kind of ['form', 'components']) {
        const response = await runtime.dispatchFetch(
          `https://fitt.example/api/admin/previews/${kind}`,
        )
        assert.equal(response.status, 401, kind)
        assert.match(response.headers.get('cache-control'), /no-store/)
        assert.doesNotMatch(await response.text(), /__FITT_ADMIN_PREVIEW__/)
      }
      for (const path of [
        '/preview/fitt-form-studio.html',
        '/preview/fitt-redesign.html',
        '/.generated/admin-previews.json',
      ]) {
        const response = await runtime.dispatchFetch(`https://fitt.example${path}`)
        assert.equal(response.status, 404, path)
        assert.doesNotMatch(await response.text(), /__FITT_ADMIN_PREVIEW__/)
      }
      for (const file of await filesIn(assetsDirectory)) {
        if (!/\.(?:js|css|html|json|map)$/.test(file)) continue
        assert.doesNotMatch(
          await readFile(file, 'utf8'),
          /__FITT_ADMIN_PREVIEW__/,
          `Private preview source leaked into ${relative(assetsDirectory, file)}`,
        )
      }
    })

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

    await t.test('serves the shell, client chunks, and noncacheable service worker', async () => {
      const shell = await runtime.dispatchFetch('https://fitt.example/')
      assert.equal(shell.status, 200)
      assert.match(await shell.text(), /Fitt/)
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
