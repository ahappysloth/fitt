/**
 * Runs Fitt's native binding bridge and real request cleanup in workerd.
 * Only DB/auth resources are fixtures: no database or email is contacted.
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { convertV4MiniflareOptions, Log, LogLevel, Miniflare } from 'miniflare'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test(
  'native Worker context keeps each pool alive until its background work ends',
  {
    timeout: 30_000,
  },
  async (t) => {
    const temporary = await mkdtemp(join(tmpdir(), 'fitt-worker-context-'))
    let runtime
    t.after(async () => {
      try {
        await runtime?.dispose()
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    })
    const modules = {
      'fixture-state': `export const state = {
      next: 0, opened: [], completed: [], disposed: [],
    };`,
      db: `import { state } from 'fixture-state';
      export async function createRequestDb() {
        const id = ++state.next;
        state.opened.push(id);
        return { db: { id }, dispose: async () => { state.disposed.push(id); } };
      }`,
      auth: `export function buildRequestAuth() { return {}; }`,
    }
    const bundled = await build({
      stdin: {
        contents: `
        import { state } from 'fixture-state';
        import { getServerContext } from './src/server/env';
        import { withRequestServices } from './src/server/request';
        export default {
          async fetch(request) {
            const url = new URL(request.url);
            if (url.pathname === '/status') return Response.json({
              opened: state.opened, completed: state.completed, disposed: state.disposed,
            });
            const context = getServerContext();
            if (context.env.DATABASE_URL !== 'worker-context-fixture-db')
              return new Response('Native bindings were not resolved', { status: 500 });
            if (typeof context.env.__FITT_SEND_EMAIL !== 'function')
              return new Response('Native email adapter was not resolved', { status: 500 });
            return withRequestServices(request, async ({ db, waitUntil }) => {
              // The asynchronous work belongs to its originating request,
              // as real SMTP/DB I/O does. Do not resolve promises from a
              // different fetch context: workerd deliberately forbids that.
              const pending = new Promise(resolve => setTimeout(resolve, db.id === 1 ? 1000 : 3000));
              waitUntil(pending.then(() => { state.completed.push(db.id); }));
              return Response.json({ id: db.id });
            });
          },
        };
      `,
        resolveDir: root,
        sourcefile: 'context-test-worker.ts',
        loader: 'ts',
      },
      plugins: [
        {
          name: 'fixture-request-resources',
          setup(builder) {
            builder.onResolve({ filter: /^fixture-state$/ }, () => ({
              path: 'fixture-state',
              namespace: 'request-fixture',
            }))
            builder.onResolve({ filter: /^\.\/(?:db|auth)$/ }, (args) => {
              if (args.importer !== resolve(root, 'src/server/request.ts')) return
              return { path: args.path.split('/').at(-1), namespace: 'request-fixture' }
            })
            builder.onLoad({ filter: /.*/, namespace: 'request-fixture' }, (args) => ({
              contents: modules[args.path],
              loader: 'js',
            }))
          },
        },
      ],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      conditions: ['workerd', 'worker', 'browser'],
      external: ['cloudflare:*', 'node:*'],
      define: { 'process.env.NODE_ENV': '"production"' },
      target: 'es2022',
      write: false,
    })
    runtime = new Miniflare({
      ...convertV4MiniflareOptions({
        host: '127.0.0.1',
        port: 0,
        modules: true,
        script: bundled.outputFiles[0].text,
        compatibilityDate: '2026-10-30',
        compatibilityFlags: ['nodejs_compat'],
        bindings: {
          DATABASE_URL: 'worker-context-fixture-db',
          BETTER_AUTH_SECRET: 'test-only-secret-with-at-least-thirty-two-characters',
          BETTER_AUTH_URL: 'https://fitt.example',
          TRUSTED_ORIGINS: 'https://fitt.example',
          SMTP_HOST: 'smtp.example.test',
          SMTP_USER: 'fixture',
          SMTP_PASS: 'fixture',
          EMAIL_FROM: 'Fitt <fitt@example.test>',
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
    const start = async () => {
      const response = await runtime.dispatchFetch('https://fitt.example/start', {
        signal: AbortSignal.timeout(2_000),
      })
      assert.equal(response.status, 200)
      return (await response.json()).id
    }
    const status = async () => (await runtime.dispatchFetch('https://fitt.example/status')).json()
    const [first, second] = (await Promise.all([start(), start()])).sort((a, b) => a - b)
    assert.notEqual(first, second)
    assert.deepEqual((await status()).disposed, [])
    const expectDisposed = async (expected) => {
      const deadline = Date.now() + 5_000
      let current
      do {
        current = await status()
        if (current.disposed.length === expected.length) break
        await new Promise((resolve) => setTimeout(resolve, 20))
      } while (Date.now() < deadline)
      assert.deepEqual(current.completed, expected)
      assert.deepEqual(current.disposed, expected)
    }
    await expectDisposed([first])
    await expectDisposed([first, second])
  },
)
