import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Preserve the email transport's runtime choice: Node SMTP locally, workerd on Workers.
  serverExternalPackages: [
    '@turnal-io/email',
    'nodemailer',
    // Keep ws optional native optimizations out of Webpack's server stubs.
    'ws',
    'https-proxy-agent',
  ],
  // Security headers are set by the Worker entry on every response it returns
  // (worker.ts, src/server/security-headers.ts), not here: vinext applies these
  // rules only to responses it renders itself.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
    ]
  },
}

export default nextConfig
