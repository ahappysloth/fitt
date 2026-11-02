import { withAdminRequest } from '../../../../server/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export function GET(request: Request) {
  return withAdminRequest(
    request,
    (identity) => Response.json({ allowed: true, userId: identity.id }),
    true,
  )
}
