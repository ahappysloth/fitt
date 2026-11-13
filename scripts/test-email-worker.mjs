/**
 * Exercises the real ESM SMTP module and Turnal renderer inside workerd.
 * WorkerMailer.connect is replaced only in this test Worker, before any send,
 * so no SMTP socket, email, or real credentials leave the process.
 * Run: node --test scripts/test-email-worker.mjs
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

test('Worker SMTP adapter loads and renders in real workerd', { timeout: 30_000 }, async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'fitt-email-worker-'))
  let runtime
  t.after(async () => {
    try {
      await runtime?.dispose()
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  })

  const bundled = await build({
    stdin: {
      contents: `
        import { createElement } from 'react';
        import { WorkerMailer } from 'worker-mailer';
        import { createWorkerMailSender } from './src/server/email-worker';
        export default {
          async fetch() {
            let connection;
            let message;
            let closed = false;
            WorkerMailer.connect = async (options) => {
              connection = options;
              return {
                async send(value) { message = value; },
                async close() { closed = true; },
              };
            };
            const sender = createWorkerMailSender({
              SMTP_HOST: 'smtp.example.test',
              SMTP_USER: 'test-user',
              SMTP_PASS: 'test-password',
              EMAIL_FROM: 'Fitt <fitt@example.test>',
            });
            await sender({
              to: 'athlete@example.test',
              subject: 'Sign in to Fitt',
              react: createElement('p', null, 'Worker rendering works'),
            });
            return Response.json({
              runtime: navigator.userAgent,
              missingConfiguration: createWorkerMailSender({}) === undefined,
              implicitTls: connection.port === 465 && connection.secure && !connection.startTls,
              // worker-mailer's own logger (4 = NONE) would print refused recipients.
              silentMailerLog: connection.logLevel === 4,
              // A display-name From must reach the SMTP envelope as a parsed address.
              from: message.from,
              to: message.to,
              rendered: message.html.includes('Worker rendering works'),
              plainText: message.text.includes('Worker rendering works'),
              closed,
            });
          },
        };
      `,
      resolveDir: root,
      sourcefile: 'email-test-worker.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    conditions: ['workerd', 'worker', 'browser'],
    external: ['cloudflare:*', 'node:*'],
    define: { 'process.env.NODE_ENV': '"production"' },
    target: 'es2022',
    write: false,
  })

  // A bare CJS require of a Cloudflare builtin is invalid in an ESM Worker.
  const source = bundled.outputFiles[0].text
  assert.match(source, /import\s*\{[^}]*connect[^}]*\}\s*from\s*["']cloudflare:sockets["']/)
  assert.doesNotMatch(source, /(?:__)?require\(["']cloudflare:sockets["']\)/)

  runtime = new Miniflare({
    ...convertV4MiniflareOptions({
      host: '127.0.0.1',
      port: 0,
      modules: true,
      script: source,
      compatibilityDate: '2026-10-30',
      compatibilityFlags: ['nodejs_compat'],
      log: new Log(LogLevel.ERROR),
      cf: false,
      telemetry: { enabled: false },
      resourcePersistencePath: join(temporary, 'persistent'),
      isolatedResourcePersistencePath: join(temporary, 'isolated'),
      resourceTmpPath: join(temporary, 'runtime'),
    }),
    enableDevRegistry: false,
  })
  const response = await runtime.dispatchFetch('https://local.test/mail-module')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    runtime: 'Cloudflare-Workers',
    missingConfiguration: true,
    implicitTls: true,
    silentMailerLog: true,
    from: { email: 'fitt@example.test', name: 'Fitt' },
    to: [{ email: 'athlete@example.test' }],
    rendered: true,
    plainText: true,
    closed: true,
  })
})
