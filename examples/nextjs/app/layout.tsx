import type { ReactNode } from 'react'

export const metadata = {
  title: 'Vellum Next.js Example',
  description: 'Docs pages generated at build time by Vellum.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          maxWidth: '720px',
          margin: '2rem auto',
          padding: '0 1rem',
          lineHeight: 1.6,
          color: '#1a1a1a',
        }}
      >
        {children}
      </body>
    </html>
  )
}
