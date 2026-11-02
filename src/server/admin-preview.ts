import { withAdminRequest } from './admin'
import { errorResponse } from './request-policy'

export type AdminPreviewKind = 'form' | 'components'
export const ADMIN_PREVIEW_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"

export function privatePreviewDocument(html: string, kind: AdminPreviewKind) {
  // srcDoc does not inherit the HTTP response's CSP. Keep network/storage
  // isolation enforced inside the document as well as on the embedding iframe.
  const meta = `<meta http-equiv="Content-Security-Policy" content="${ADMIN_PREVIEW_CSP}">`
  const setup = `<script>window.__FITT_ADMIN_PREVIEW__=${JSON.stringify(kind)};</script>`
  return html.replace('<head>', `<head>${meta}${setup}`)
}

export function serveAdminPreview(
  request: Request,
  kind: string,
  load: (kind: AdminPreviewKind) => string,
) {
  return withAdminRequest(request, () => {
    if (kind !== 'form' && kind !== 'components') return errorResponse('Preview not found.', 404)
    return new Response(privatePreviewDocument(load(kind), kind), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': `${ADMIN_PREVIEW_CSP}; frame-ancestors 'self'; sandbox allow-scripts`,
        'X-Frame-Options': 'SAMEORIGIN',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    })
  })
}
