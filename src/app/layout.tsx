import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import '../styles.css'

export const metadata: Metadata = {
  title: 'Fitt — A little stronger, every day',
  description:
    'Build a calisthenics habit with workouts that fit your equipment, progress that stays yours, and a little encouragement along the way.',
  applicationName: 'Fitt',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Fitt', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#101010',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
