import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from '@/components/layout/Sidebar'

export const metadata: Metadata = {
  title: 'JEKBEE Ops',
  description: 'JEKBEE Internal Team Management Tool',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-dark-800 text-white antialiased">
        <Sidebar />
        <main className="ml-52 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  )
}
