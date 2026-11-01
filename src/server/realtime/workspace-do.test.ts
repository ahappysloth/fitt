import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DurableObjectState, WebSocket as HibernatingSocket } from '@cloudflare/workers-types'
import { WorkspaceDO } from './workspace-do'
import { EXPIRY_HEADER, IDENTITY_HEADER, MAX_USER_SOCKETS, SOCKET_LIFETIME_MS } from './types'

class Socket {
  readyState = 1
  data: unknown = null
  sent: string[] = []
  closed: { code: number | undefined; reason: string | undefined }[] = []
  send(message: string) {
    this.sent.push(message)
  }
  close(code?: number, reason?: string) {
    this.closed.push({ code, reason })
    this.readyState = 3
  }
  serializeAttachment(data: unknown) {
    this.data = structuredClone(data)
  }
  deserializeAttachment() {
    return structuredClone(this.data)
  }
}
class Pair {
  0 = new Socket()
  1 = new Socket()
}
const NativeResponse = Response
class WorkerResponse extends NativeResponse {
  webSocket?: Socket
  constructor(body?: BodyInit | null, init?: ResponseInit & { webSocket?: Socket }) {
    super(body, init?.status === 101 ? { ...init, status: 200 } : init)
    if (init?.status === 101) {
      Object.defineProperty(this, 'status', { value: 101 })
      this.webSocket = init.webSocket
    }
  }
}
function harness() {
  const data = new Map<string, unknown>()
  const sockets: Socket[] = []
  const storage = {
    get: vi.fn(async (key: string) => structuredClone(data.get(key))),
    put: vi.fn(async (key: string, value: unknown) => {
      data.set(key, structuredClone(value))
    }),
    setAlarm: vi.fn(async (_at: number) => {}),
    deleteAlarm: vi.fn(async () => {}),
  }
  const state = {
    storage,
    blockConcurrencyWhile: async <T>(fn: () => Promise<T>) => fn(),
    acceptWebSocket: (socket: Socket) => {
      sockets.push(socket)
    },
    getWebSockets: () => sockets.filter((socket) => socket.readyState === 1),
  } as unknown as DurableObjectState
  return { state, storage, sockets, hub: new WorkspaceDO(state) }
}
const connect = (userId = 'user-a', expiresAt = Date.now() + SOCKET_LIFETIME_MS) =>
  new Request('https://realtime.internal/connect', {
    headers: {
      Upgrade: 'websocket',
      [IDENTITY_HEADER]: userId,
      [EXPIRY_HEADER]: String(expiresAt),
    },
  })
const notify = (userId: string, revision: number) =>
  new Request('https://realtime.internal/notify', {
    method: 'POST',
    body: JSON.stringify({ userId, revision }),
  })
const asSocket = (socket: Socket) => socket as unknown as HibernatingSocket

beforeEach(() => {
  vi.useFakeTimers().setSystemTime(new Date('2026-11-01T12:00:00Z'))
  vi.stubGlobal('WebSocketPair', Pair)
  vi.stubGlobal('Response', WorkerResponse)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('WorkspaceDO', () => {
  it('isolates a persistent owner and broadcasts only increasing revision hints', async () => {
    const { hub, sockets } = harness()
    expect((await hub.fetch(connect())).status).toBe(101)
    expect((await hub.fetch(connect('user-b'))).status).toBe(403)
    expect((await hub.fetch(notify('user-b', 4))).status).toBe(403)
    expect((await hub.fetch(notify('user-a', 2))).status).toBe(204)
    expect((await hub.fetch(notify('user-a', 1))).status).toBe(204)
    expect((await hub.fetch(notify('user-a', 2))).status).toBe(204)
    expect(sockets[0].sent.map((message) => JSON.parse(message))).toEqual([
      { type: 'revision', revision: 0 },
      { type: 'revision', revision: 2 },
    ])
  })

  it('retains owner/revision and expires idle sockets after hibernation via alarms', async () => {
    const { state, hub, sockets, storage } = harness()
    const expiry = Date.now() + 20_000
    await hub.fetch(connect('user-a', expiry))
    await hub.fetch(notify('user-a', 3))
    expect(storage.setAlarm).toHaveBeenLastCalledWith(expiry)
    const resumed = new WorkspaceDO(state)
    vi.setSystemTime(new Date(expiry + 1))
    await resumed.alarm()
    expect(sockets[0].closed[0]?.code).toBe(4001)
    expect(storage.deleteAlarm).toHaveBeenCalled()
    expect((await resumed.fetch(connect('user-b'))).status).toBe(403)
    expect((await resumed.fetch(connect('user-a'))).status).toBe(101)
    expect(JSON.parse(sockets[1].sent[0])).toEqual({ type: 'revision', revision: 3 })
  })

  it('rejects unbounded identity lifetimes and limits simultaneous connections', async () => {
    const { hub } = harness()
    expect((await hub.fetch(connect('user-a', Date.now() - 1))).status).toBe(401)
    expect((await hub.fetch(connect('user-a', Date.now() + SOCKET_LIFETIME_MS + 1))).status).toBe(
      401,
    )
    for (let i = 0; i < MAX_USER_SOCKETS; i++) expect((await hub.fetch(connect())).status).toBe(101)
    expect((await hub.fetch(connect())).status).toBe(429)
  })

  it('never accepts client broadcasts and bounds heartbeat messages', async () => {
    const { hub, sockets } = harness()
    await hub.fetch(connect())
    await hub.fetch(connect())
    hub.webSocketMessage(asSocket(sockets[0]), JSON.stringify({ type: 'revision', revision: 100 }))
    expect(sockets[0].closed[0]?.code).toBe(1008)
    expect(sockets[1].sent).toHaveLength(1)
    for (let i = 0; i < 5; i++) hub.webSocketMessage(asSocket(sockets[1]), 'ping')
    expect(sockets[1].sent.filter((message) => message === 'pong')).toHaveLength(4)
    expect(sockets[1].closed[0]?.code).toBe(1008)
  })

  it('does not send notifications to an expired connection before the alarm fires', async () => {
    const { hub, sockets } = harness()
    await hub.fetch(connect('user-a', Date.now() + 1000))
    vi.setSystemTime(new Date(Date.now() + 2000))
    await hub.fetch(notify('user-a', 4))
    expect(sockets[0].sent).toHaveLength(1)
    expect(sockets[0].closed[0]?.code).toBe(4001)
  })
})
