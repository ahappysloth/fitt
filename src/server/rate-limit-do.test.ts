import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDurableObjectRateLimiter,
  DEFAULT_IDLE_BUCKET_MS,
  DEFAULT_SWEEP_INTERVAL_MS,
} from '@turnal-io/ratelimit'
import type { DurableObjectState } from '@cloudflare/workers-types'
import { RateLimitDO } from './rate-limit-do'

function memoryState() {
  const data = new Map<string, unknown>()
  let alarm: number | null = null
  const storage = {
    async get(key: string) {
      return data.get(key)
    },
    async put(key: string, value: unknown) {
      data.set(key, value)
    },
    async delete(keys: string[]) {
      if (keys.length > 128) throw new Error('Durable Object storage deletes at most 128 keys')
      for (const key of keys) data.delete(key)
      return keys.length
    },
    async list({ limit, startAfter }: { limit: number; startAfter?: string }) {
      const keys = [...data.keys()]
        .sort()
        .filter((key) => startAfter === undefined || key > startAfter)
      return new Map(keys.slice(0, limit).map((key) => [key, data.get(key)]))
    },
    async getAlarm() {
      return alarm
    },
    async setAlarm(time: number) {
      alarm = time
    },
  }
  return {
    data,
    alarm: () => alarm,
    state: { storage } as unknown as DurableObjectState,
  }
}

afterEach(() => vi.useRealTimers())

describe('RateLimitDO', () => {
  it('serves @turnal-io/ratelimit takes and arms one idle-bucket cleanup alarm', async () => {
    vi.useFakeTimers({ now: 1_000_000, toFake: ['Date'] })
    const memory = memoryState()
    const object = new RateLimitDO(memory.state)
    const namespace = {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: (url: string, init?: RequestInit) => object.fetch(new Request(url, init)),
      }),
    }
    const limiter = createDurableObjectRateLimiter(namespace, { shards: 1 })
    const rule = { limit: 2, windowMs: 10_000 }
    expect((await limiter.take('bucket', rule)).allowed).toBe(true)
    expect((await limiter.take('bucket', rule)).allowed).toBe(true)
    expect((await limiter.take('bucket', rule)).allowed).toBe(false)
    expect(memory.alarm()).toBe(1_000_000 + DEFAULT_SWEEP_INTERVAL_MS)
    expect((await object.fetch(new Request('https://do/other'))).status).toBe(404)
  })

  it('deletes buckets idle for their window in bounded batches and stops once none remain', async () => {
    vi.useFakeTimers({ now: 10 * DEFAULT_IDLE_BUCKET_MS, toFake: ['Date'] })
    const memory = memoryState()
    const now = Date.now()
    for (let index = 0; index < 300; index += 1) {
      memory.data.set(`idle-${String(index).padStart(3, '0')}`, {
        tokens: 1,
        updatedAt: now - 60_001,
        windowMs: 60_000,
      })
    }
    memory.data.set('active', { tokens: 1, updatedAt: now - 1_000, windowMs: 60_000 })
    // Written before @turnal-io/ratelimit 1.1 (no windowMs): kept for an hour.
    memory.data.set('legacy', { tokens: 1, updatedAt: now - 1_000 })
    memory.data.set('legacy-idle', { tokens: 1, updatedAt: now - DEFAULT_IDLE_BUCKET_MS })
    memory.data.set('not-a-bucket', 'left alone')
    const object = new RateLimitDO(memory.state)
    await object.alarm()
    expect([...memory.data.keys()].sort()).toEqual(['active', 'legacy', 'not-a-bucket'])
    expect(memory.alarm()).toBe(now + DEFAULT_SWEEP_INTERVAL_MS)

    memory.data.set('active', { tokens: 1, updatedAt: now - 60_000, windowMs: 60_000 })
    memory.data.set('legacy', { tokens: 1, updatedAt: now - DEFAULT_IDLE_BUCKET_MS })
    await memory.state.storage.setAlarm(0)
    await object.alarm()
    expect([...memory.data.keys()]).toEqual(['not-a-bucket'])
    expect(memory.alarm()).toBe(0)
  })
})
