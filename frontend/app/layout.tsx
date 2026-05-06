import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Texmobile',
  description: 'Self-hosted mobile-first LaTeX editor',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Prevent iOS auto-zoom on input focus, which would break the editor layout.
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0d0f12',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="h-dvh overflow-hidden bg-surface-900 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  )
}
