import { serveAdminPreview, type AdminPreviewKind } from '../../../../../server/admin-preview'
// Generated before Next dev/build; intentionally absent in a clean checkout.
// @ts-ignore -- build-admin-previews.mjs creates the server-only JSON bundle.
import previews from '../../../../../../.generated/admin-previews.json'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  const { kind } = await context.params
  return serveAdminPreview(request, kind, (selected: AdminPreviewKind) => previews[selected])
}
