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
    icon: [
      { url: '/icons/fitt-mark.svg', type: 'image/svg+xml', sizes: 'any' },
      { url: '/icons/fitt-mark-32.png', type: 'image/png', sizes: '32x32' },
    ],
    apple: [{ url: '/icons/fitt-mark-180.png', type: 'image/png', sizes: '180x180' }],
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
