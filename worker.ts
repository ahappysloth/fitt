import handler from 'vinext/server/app-router-entry'
import { isAdminPagePath, serveAdminPage } from './src/server/admin-page'
import { receiveCspReport } from './src/server/csp-report'
import type { FittEnv } from './src/server/env'
import { resolveRealtimeSession } from './src/server/realtime/session'
import { upgradeRealtime } from './src/server/realtime/upgrade'
import { REALTIME_PATH } from './src/server/realtime/types'
import type { RealtimeEnv, RealtimeExecutionContext } from './src/server/realtime/types'
import { applySecurityHeaders, CSP_REPORT_PATH } from './src/server/security-headers'

export { WorkspaceDO } from './src/server/realtime/workspace-do'
export { RateLimitDO } from './src/server/rate-limit-do'

type Env = RealtimeEnv &
  Partial<FittEnv> & { ASSETS?: { fetch(request: Request): Promise<Response> } }

function route(request: Request, env: Env, context: RealtimeExecutionContext) {
  const pathname = new URL(request.url).pathname
  if (pathname === REALTIME_PATH)
    return upgradeRealtime(request, env, context, resolveRealtimeSession)
  if (pathname === CSP_REPORT_PATH) return receiveCspReport(request)
  if (isAdminPagePath(pathname)) {
    return serveAdminPage(request, () => handler.fetch(request, env, context))
  }
  return handler.fetch(request, env, context)
}

export default {
  async fetch(request: Request, env: Env, context: RealtimeExecutionContext) {
    // Security headers go on every response the Worker returns, including the
    // Worker's own realtime and Admin responses that never reach vinext.
    return applySecurityHeaders(request, await route(request, env, context), {
      dev: import.meta.env.DEV,
    })
  },
}
