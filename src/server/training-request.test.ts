import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_CLOUD_BODY_BYTES } from '../lib/cloud-contract'
import { checkTrainingAccount, readTrainingJson, TrainingRequestError } from './training-request'

const url = 'https://fitt.example/api/training'
afterEach(() => vi.useRealTimers())

describe('training request boundary', () => {
  it('binds a queued write to the verified account without trusting the header for ownership', async () => {
    const wrong = new Request(url, { method: 'PUT', headers: { 'X-Fitt-Account': 'account-a' } })
    const response = checkTrainingAccount(wrong, 'account-b')!
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: 'account_changed' })
    expect(checkTrainingAccount(wrong, 'account-a')).toBeNull()
    expect(checkTrainingAccount(new Request(url, { method: 'PUT' }), 'account-a')?.status).toBe(400)
  })

  it('also refuses stale account identity on reads', () => {
    expect(checkTrainingAccount(new Request(url), 'account-a')).toBeNull()
    const request = new Request(url, { headers: { 'X-Fitt-Account': 'account-a' } })
    expect(checkTrainingAccount(request, 'account-b')?.status).toBe(403)
  })

  it('reads JSON and rejects unsupported content types or malformed bodies', async () => {
    const valid = new Request(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: '{"ok":true}',
    })
    await expect(readTrainingJson(valid)).resolves.toEqual({ ok: true })
    await expect(
      readTrainingJson(new Request(url, { method: 'PUT', body: '{}' })),
    ).rejects.toMatchObject({ status: 415 })
    await expect(
      readTrainingJson(
        new Request(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: '{',
        }),
      ),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('bounds streamed bytes even when Content-Length lies, then cancels the stream', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_CLOUD_BODY_BYTES))
        controller.enqueue(new Uint8Array(1))
      },
      cancel() {
        cancelled = true
      },
    })
    const request = new Request(url, {
      method: 'PUT',
      body,
      duplex: 'half',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '1' },
    } as RequestInit & { duplex: 'half' })
    await expect(readTrainingJson(request)).rejects.toMatchObject({ status: 413 })
    expect(cancelled).toBe(true)
  })

  it('rejects invalid UTF-8 rather than changing the saved text', async () => {
    const request = new Request(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: new Uint8Array([123, 34, 97, 34, 58, 34, 0xc3, 0x28, 34, 125]),
    })
    await expect(readTrainingJson(request)).rejects.toBeInstanceOf(TrainingRequestError)
  })

  it('expires a stalled body with a total upload deadline', async () => {
    vi.useFakeTimers()
    let cancelled = false
    const request = new Request(url, {
      method: 'PUT',
      duplex: 'half',
      headers: { 'Content-Type': 'application/json' },
      body: new ReadableStream({
        cancel() {
          cancelled = true
        },
      }),
    } as RequestInit & { duplex: 'half' })
    const check = expect(readTrainingJson(request)).rejects.toMatchObject({ status: 408 })
    await vi.advanceTimersByTimeAsync(10_001)
    await check
    expect(cancelled).toBe(true)
  })
})
