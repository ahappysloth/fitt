import handler from 'vinext/server/app-router-entry'
import { isAdminPagePath, serveAdminPage } from './src/server/admin-page'
import type { FittEnv } from './src/server/env'
import { resolveRealtimeSession } from './src/server/realtime/session'
import { upgradeRealtime } from './src/server/realtime/upgrade'
import { REALTIME_PATH } from './src/server/realtime/types'
import type { RealtimeEnv, RealtimeExecutionContext } from './src/server/realtime/types'

export { WorkspaceDO } from './src/server/realtime/workspace-do'
export { RateLimitDO } from './src/server/rate-limit-do'

export default {
  async fetch(
    request: Request,
    env: RealtimeEnv &
      Partial<FittEnv> & { ASSETS?: { fetch(request: Request): Promise<Response> } },
    context: RealtimeExecutionContext,
  ) {
    if (new URL(request.url).pathname === REALTIME_PATH) {
      return upgradeRealtime(request, env, context, resolveRealtimeSession)
    }
    const pathname = new URL(request.url).pathname
    if (isAdminPagePath(pathname)) {
      return serveAdminPage(request, () => handler.fetch(request, env, context))
    }
    return handler.fetch(request, env, context)
  },
}
