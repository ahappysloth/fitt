import type { DurableObjectState } from '@cloudflare/workers-types'
import { handleRateLimitAlarm, handleRateLimitTake } from '@turnal-io/ratelimit'

/**
 * The shared bucket store behind Better Auth's rate limiter. @turnal-io/ratelimit's
 * createDurableObjectRateLimiter spreads keys over 16 instances ("global",
 * "shard-1" … "shard-15"). Kept as a plain class like WorkspaceDO so nothing
 * outside the Worker entry imports `cloudflare:workers`. Keys arrive HMAC'd by
 * @turnal-io/auth, so no IP address is stored. Each take arms an hourly alarm;
 * the alarm deletes every bucket idle for its own window (fully refilled, so
 * deleting it changes no decision) and re-arms while buckets remain.
 */
export class RateLimitDO {
  constructor(private readonly state: DurableObjectState) {}

  fetch(request: Request): Promise<Response> {
    return handleRateLimitTake(request, this.state.storage)
  }

  async alarm(): Promise<void> {
    await handleRateLimitAlarm(this.state.storage)
  }
}
