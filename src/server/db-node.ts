import { neonConfig } from '@neondatabase/serverless'

let configured: Promise<void> | undefined

export function configureNodeDatabase() {
  configured ??= (async () => {
    const { default: WebSocket } = await import('ws')
    const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
    const agent = proxy ? new (await import('https-proxy-agent')).HttpsProxyAgent(proxy) : undefined
    // Shared transport configuration only. Database pools remain request-scoped.
    neonConfig.webSocketConstructor = class extends WebSocket {
      constructor(address: string | URL, protocols?: string | string[]) {
        if (new URL(String(address)).protocol !== 'wss:')
          throw new Error('Secure database transport is required')
        super(address, protocols, { agent, handshakeTimeout: 10_000 })
      }
    }
    neonConfig.poolQueryViaFetch = false
  })()
  return configured
}
