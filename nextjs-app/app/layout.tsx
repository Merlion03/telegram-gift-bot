import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Telegram Bot WebApp',
  description: 'Система розыгрышей и поддержки',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <body className="font-sans">{children}</body>
    </html>
  )
}
