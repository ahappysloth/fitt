import { authIsConfigured, getServerContext } from '@/server/env'
import { emailDeliveryAvailable } from '@/server/email'
import { privateResponse } from '@/server/request-policy'
import { withRequestServices } from '@/server/request'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { env } = getServerContext()
  const enabled = authIsConfigured(env)
  const configuration = {
    providers: {
      google: enabled && !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      magicLink: enabled && emailDeliveryAvailable(env),
    },
    realtime: enabled && !!env.WORKSPACE_DO,
  }
  if (!enabled || !request.headers.get('cookie')) {
    return privateResponse(Response.json({ user: null, ...configuration }))
  }
  return withRequestServices(request, async ({ auth }) => {
    const current = await auth.auth.api.getSession({ headers: request.headers })
    const user = current?.user
      ? { id: current.user.id, name: current.user.name, email: current.user.email }
      : null
    return Response.json({ user, ...configuration })
  })
}
