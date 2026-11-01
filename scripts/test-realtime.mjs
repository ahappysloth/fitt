/**
 * Real workerd/SQLite Durable Object smoke test. Run with:
 *   node --test scripts/test-realtime.mjs
 *
 * Requires the repository's supported Node version, dev dependencies miniflare
 * and esbuild, and permission to spawn workerd and bind a loopback socket.
 * No database, auth, Cloudflare account, deployment, or email credentials are
 * used. The test-only Worker supplies a synthetic identity; the production
 * upgrade authentication/origin policy is covered by the realtime unit tests.
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { convertV4MiniflareOptions, Log, LogLevel, Miniflare } from 'miniflare'
import WebSocket from 'ws'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const identity = 'workerd-probe-user'

function waitForEvent(socket, type, signal, predicate = () => true) {
  let cancel
  const promise = new Promise((resolveEvent, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      socket.removeEventListener(type, onEvent)
      socket.removeEventListener('error', onError)
      signal.removeEventListener('abort', onAbort)
    }
    const finish = (fn, value) => {
      cleanup()
      fn(value)
    }
    const onEvent = (event) => {
      try {
        if (predicate(event)) finish(resolveEvent, event)
      } catch (error) {
        finish(reject, error)
      }
    }
    const onError = (event) =>
      finish(reject, new Error(`WebSocket ${type} failed`, { cause: event.error }))
    const onAbort = () => finish(reject, signal.reason ?? new Error('Test aborted'))
    const timer = setTimeout(
      () => finish(reject, new Error(`Timed out waiting for WebSocket ${type}`)),
      10_000,
    )
    cancel = cleanup
    socket.addEventListener(type, onEvent)
    socket.addEventListener('error', onError)
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
  })
  // Some events are registered together, then awaited in order. A connection
  // error must not produce an unhandled rejection in the second pending waiter.
  void promise.catch(() => {})
  return { promise, cancel: () => cancel() }
}

test('WorkspaceDO in real workerd', { timeout: 30_000 }, async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'fitt-realtime-'))
  const sockets = new Set()
  const waiters = new Set()
  const socketErrors = []
  let runtime

  t.after(async () => {
    for (const waiter of waiters) waiter.cancel()
    for (const socket of sockets) {
      if (socket.readyState !== WebSocket.CLOSED) socket.terminate()
    }
    try {
      await runtime?.dispose()
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  })

  const bundled = await build({
    stdin: {
      // The probe subclass adds only observation of actual alarm execution and
      // live socket count. All connection, notification and expiry behavior is
      // the production WorkspaceDO implementation.
      contents: `
        import { WorkspaceDO as Base } from './src/server/realtime/workspace-do';
        export class WorkspaceDO extends Base {
          constructor(state) { super(state); this.probeState = state; }
          async alarm() {
            await super.alarm();
            const previous = await this.probeState.storage.get('probeAlarmCount') || 0;
            await this.probeState.storage.put('probeAlarmCount', previous + 1);
          }
          async fetch(request) {
            if (new URL(request.url).pathname === '/probe') {
              return Response.json({
                alarmCount: await this.probeState.storage.get('probeAlarmCount') || 0,
                liveConnections: this.probeState.getWebSockets().length,
              });
            }
            return super.fetch(request);
          }
        }
        export default {
          fetch(request, env) {
            return env.WORKSPACE_DO.get(env.WORKSPACE_DO.idFromName('${identity}')).fetch(request);
          }
        };
      `,
      resolveDir: root,
      sourcefile: 'realtime-test-worker.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
  })

  // The installed Miniflare 5 exposes this public adapter for the familiar
  // programmatic Worker options. Its version is pinned in the lockfile.
  runtime = new Miniflare({
    ...convertV4MiniflareOptions({
      host: '127.0.0.1',
      port: 0,
      modules: true,
      script: bundled.outputFiles[0].text,
      compatibilityDate: '2026-10-30',
      durableObjects: { WORKSPACE_DO: { className: 'WorkspaceDO', useSQLite: true } },
      log: new Log(LogLevel.ERROR),
      cf: false,
      telemetry: { enabled: false },
      resourcePersistencePath: join(temporary, 'persistent'),
      isolatedResourcePersistencePath: join(temporary, 'isolated'),
      resourceTmpPath: join(temporary, 'runtime'),
    }),
    enableDevRegistry: false,
  })
  const address = await runtime.ready
  const socketUrl = new URL('/connect', address)
  socketUrl.protocol = 'ws:'

  const event = (socket, type, predicate) => {
    const waiter = waitForEvent(socket, type, t.signal, predicate)
    waiters.add(waiter)
    const observed = waiter.promise.finally(() => waiters.delete(waiter))
    void observed.catch(() => {})
    return observed
  }
  const connect = async (lifetime) => {
    const socket = new WebSocket(socketUrl, {
      headers: {
        'x-fitt-realtime-user': identity,
        'x-fitt-realtime-expires': String(Date.now() + lifetime),
      },
    })
    sockets.add(socket)
    socket.on('error', (error) => socketErrors.push(error))
    const [opened, initial] = await Promise.all([event(socket, 'open'), event(socket, 'message')])
    assert.equal(opened.type, 'open')
    return { socket, initial: JSON.parse(initial.data) }
  }
  const notify = (userId, revision) =>
    runtime.dispatchFetch('https://local.test/notify', {
      method: 'POST',
      body: JSON.stringify({ userId, revision }),
    })
  const inspect = async () => (await runtime.dispatchFetch('https://local.test/probe')).json()

  const { socket, initial } = await connect(60_000)
  assert.deepEqual(initial, { type: 'revision', revision: 0 })

  await t.test('accepts a real WebSocket upgrade and delivers revision-only hints', async () => {
    const updated = event(socket, 'message', (message) => JSON.parse(message.data).revision === 1)
    assert.equal((await notify(identity, 1)).status, 204)
    assert.deepEqual(JSON.parse((await updated).data), { type: 'revision', revision: 1 })
  })

  await t.test('rejects a notification for another account', async () => {
    assert.equal((await notify('different-user', 2)).status, 403)
  })

  await t.test('closes clients that attempt to broadcast application messages', async () => {
    const closed = event(socket, 'close')
    socket.send(JSON.stringify({ type: 'revision', revision: 999 }))
    assert.equal((await closed).code, 1008)
  })

  await t.test('runs a durable alarm and removes an expired server connection', async () => {
    const { socket: expiring, initial: latest } = await connect(1_500)
    assert.deepEqual(latest, { type: 'revision', revision: 1 })
    const before = await inspect()
    assert.equal(before.liveConnections, 1)
    const deadline = Date.now() + 10_000
    let state = before
    while (state.alarmCount <= before.alarmCount || state.liveConnections !== 0) {
      assert.ok(Date.now() < deadline, 'The real Durable Object expiry alarm did not complete')
      await delay(100, undefined, { signal: t.signal })
      state = await inspect()
    }
    // Miniflare's proxy can retain the peer side after an alarm closes/detaches
    // the server socket. Inspect actual DO state rather than asserting that
    // proxy behavior. The app also has a 55-second reconnect watchdog.
    expiring.terminate()
  })

  assert.deepEqual(socketErrors, [], 'Unexpected errors from a real WebSocket client')
})
