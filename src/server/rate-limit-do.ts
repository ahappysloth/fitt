import type { DurableObjectState } from '@cloudflare/workers-types'
import { handleRateLimitTake, type BucketState } from '@turnal-io/ratelimit'

/** How often an idle-bucket sweep runs while buckets exist. */
export const SWEEP_INTERVAL_MS = 60 * 60 * 1000
/**
 * A bucket untouched for this long is deleted. It is far longer than any
 * Better Auth rule window (the longest is 60 s), and a bucket idle for its
 * window has fully refilled, so deleting it never changes a decision.
 */
export const IDLE_BUCKET_MS = 60 * 60 * 1000
// Durable Object storage deletes at most 128 keys per call.
const PAGE = 128

/**
 * The shared bucket store behind Better Auth's rate limiter (one instance,
 * "global", used through @turnal-io/ratelimit's createDurableObjectRateLimiter).
 * Kept as a plain class like WorkspaceDO so nothing outside the Worker entry
 * imports `cloudflare:workers`. Keys arrive already HMAC'd (see auth.ts), so
 * no IP address is stored; idle buckets are swept by an alarm so storage does
 * not grow with every client ever seen.
 */
export class RateLimitDO {
  private sweepScheduled = false

  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const response = await handleRateLimitTake(request, this.state.storage)
    if (response.ok && !this.sweepScheduled) {
      if ((await this.state.storage.getAlarm()) === null) {
        await this.state.storage.setAlarm(Date.now() + SWEEP_INTERVAL_MS)
      }
      this.sweepScheduled = true
    }
    return response
  }

  async alarm(): Promise<void> {
    this.sweepScheduled = false
    const cutoff = Date.now() - IDLE_BUCKET_MS
    let kept = false
    let startAfter: string | undefined
    while (true) {
      const page = await this.state.storage.list<BucketState>({
        limit: PAGE,
        ...(startAfter === undefined ? {} : { startAfter }),
      })
      const stale: string[] = []
      for (const [key, bucket] of page) {
        startAfter = key
        if (typeof bucket?.updatedAt === 'number' && bucket.updatedAt >= cutoff) kept = true
        else stale.push(key)
      }
      if (stale.length) await this.state.storage.delete(stale)
      if (page.size < PAGE) break
    }
    if (kept) {
      await this.state.storage.setAlarm(Date.now() + SWEEP_INTERVAL_MS)
      this.sweepScheduled = true
    }
  }
}
