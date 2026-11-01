import type { DurableObjectState, WebSocket as HibernatingSocket } from '@cloudflare/workers-types'
import {
  EXPIRY_HEADER,
  IDENTITY_HEADER,
  isRevision,
  isUserId,
  MAX_USER_SOCKETS,
  realtimeError,
  SOCKET_LIFETIME_MS,
} from './types'
import type { RevisionMessage } from './types'

interface HubState {
  owner: string | null
  revision: number
}
interface SocketIdentity {
  userId: string
  expiresAt: number
  messageWindow: number
  messages: number
}

function attachment(socket: HibernatingSocket): SocketIdentity | null {
  try {
    const data: unknown = socket.deserializeAttachment()
    if (!data || typeof data !== 'object') return null
    const value = data as Partial<SocketIdentity>
    if (
      !isUserId(value.userId) ||
      typeof value.expiresAt !== 'number' ||
      !Number.isFinite(value.expiresAt) ||
      typeof value.messageWindow !== 'number' ||
      !Number.isFinite(value.messageWindow) ||
      !Number.isSafeInteger(value.messages) ||
      (value.messages ?? -1) < 0
    )
      return null
    return value as SocketIdentity
  } catch {
    return null
  }
}

function close(socket: HibernatingSocket, code: number, reason: string) {
  try {
    socket.close(code, reason)
  } catch {
    /* Already closed by the runtime. */
  }
}

/** One private, authenticated user's channel. No workout data lives in the hub. */
export class WorkspaceDO {
  private readonly ready: Promise<void>
  private meta: HubState = { owner: null, revision: 0 }

  constructor(private readonly state: DurableObjectState) {
    this.ready = state.blockConcurrencyWhile(async () => {
      const saved = await state.storage.get<HubState>('hub')
      if (saved) {
        if ((saved.owner !== null && !isUserId(saved.owner)) || !isRevision(saved.revision)) {
          throw new Error('Invalid realtime hub state')
        }
        this.meta = saved
      }
    })
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready
    const path = new URL(request.url).pathname
    if (path === '/connect' && request.method === 'GET') return this.connect(request)
    if (path === '/notify' && request.method === 'POST') return this.notify(request)
    return realtimeError(404, 'Not found')
  }

  private async connect(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return realtimeError(426, 'WebSocket upgrade required')
    }
    const userId = request.headers.get(IDENTITY_HEADER)
    const expiresAt = Number(request.headers.get(EXPIRY_HEADER))
    const now = Date.now()
    if (
      !isUserId(userId) ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= now ||
      expiresAt > now + SOCKET_LIFETIME_MS
    ) {
      return realtimeError(401, 'Invalid connection identity')
    }
    return this.state.blockConcurrencyWhile(async () => {
      if (this.meta.owner !== null && this.meta.owner !== userId) {
        return realtimeError(403, 'Wrong account channel')
      }
      this.expireSockets(now)
      if (
        this.state.getWebSockets().filter((socket) => socket.readyState === 1).length >=
        MAX_USER_SOCKETS
      ) {
        return realtimeError(429, 'Too many connections')
      }
      if (this.meta.owner === null) {
        this.meta.owner = userId
        await this.state.storage.put('hub', this.meta)
      }
      const Pair = (
        globalThis as unknown as {
          WebSocketPair: new () => { 0: HibernatingSocket; 1: HibernatingSocket }
        }
      ).WebSocketPair
      const pair = new Pair()
      const server = pair[1]
      this.state.acceptWebSocket(server)
      server.serializeAttachment({
        userId,
        expiresAt,
        messageWindow: now,
        messages: 0,
      } satisfies SocketIdentity)
      await this.scheduleExpiry()
      server.send(
        JSON.stringify({
          type: 'revision',
          revision: this.meta.revision,
        } satisfies RevisionMessage),
      )
      // `webSocket` is a Workers Response extension; Next's DOM types omit it.
      return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit)
    })
  }

  private async notify(request: Request): Promise<Response> {
    let value: unknown
    try {
      const body = await request.text()
      if (body.length > 1024) return realtimeError(413, 'Notification is too large')
      value = JSON.parse(body)
    } catch {
      return realtimeError(400, 'Invalid notification')
    }
    if (!value || typeof value !== 'object') return realtimeError(400, 'Invalid notification')
    const { userId, revision } = value as { userId?: unknown; revision?: unknown }
    if (!isUserId(userId) || !isRevision(revision))
      return realtimeError(400, 'Invalid notification')
    return this.state.blockConcurrencyWhile(async () => {
      if (this.meta.owner !== null && this.meta.owner !== userId) {
        return realtimeError(403, 'Wrong account channel')
      }
      if (this.meta.owner === null) {
        this.meta.owner = userId
        await this.state.storage.put('hub', this.meta)
      }
      if (revision <= this.meta.revision) return new Response(null, { status: 204 })
      this.meta.revision = revision
      await this.state.storage.put('hub', this.meta)
      const now = Date.now()
      const message = JSON.stringify({ type: 'revision', revision } satisfies RevisionMessage)
      this.expireSockets(now)
      for (const socket of this.state.getWebSockets()) {
        const identity = attachment(socket)
        if (socket.readyState !== 1 || identity?.userId !== userId || identity.expiresAt <= now)
          continue
        try {
          socket.send(message)
        } catch {
          close(socket, 1011, 'Connection unavailable')
        }
      }
      await this.scheduleExpiry()
      return new Response(null, { status: 204 })
    })
  }

  webSocketMessage(socket: HibernatingSocket, message: string | ArrayBuffer): void {
    const identity = attachment(socket)
    const now = Date.now()
    if (!identity || identity.userId !== this.meta.owner || identity.expiresAt <= now) {
      close(socket, 4001, 'Reconnect to verify your session')
      return
    }
    if (typeof message !== 'string' || message.length > 256) {
      close(socket, 1009, 'Message is too large')
      return
    }
    const window =
      now - identity.messageWindow >= 10_000
        ? { ...identity, messageWindow: now, messages: 1 }
        : { ...identity, messages: identity.messages + 1 }
    socket.serializeAttachment(window)
    if (window.messages > 4 || message !== 'ping') {
      close(socket, 1008, 'Only bounded heartbeat messages are supported')
      return
    }
    try {
      socket.send('pong')
    } catch {
      close(socket, 1011, 'Connection unavailable')
    }
  }

  webSocketClose(socket: HibernatingSocket): void {
    close(socket, 1000, 'Connection closed')
  }

  webSocketError(socket: HibernatingSocket): void {
    close(socket, 1011, 'Connection unavailable')
  }

  /** Durable alarms and serialized attachments survive eviction/hibernation. */
  async alarm(): Promise<void> {
    await this.ready
    this.expireSockets(Date.now())
    await this.scheduleExpiry()
  }

  private expireSockets(now: number) {
    for (const socket of this.state.getWebSockets()) {
      const identity = attachment(socket)
      if (!identity || identity.userId !== this.meta.owner || identity.expiresAt <= now) {
        close(socket, 4001, 'Reconnect to verify your session')
      }
    }
  }

  private async scheduleExpiry(): Promise<void> {
    const expirations = this.state
      .getWebSockets()
      .filter((socket) => socket.readyState === 1)
      .map((socket) => attachment(socket)?.expiresAt)
      .filter((value): value is number => typeof value === 'number' && value > Date.now())
    if (expirations.length) await this.state.storage.setAlarm(Math.min(...expirations))
    else await this.state.storage.deleteAlarm()
  }
}
