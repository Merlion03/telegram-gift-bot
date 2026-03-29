import type { Metadata } from 'next'
import './globals.css'
import '../styles/telegram-theme.css'

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
      <head>
        <script src="https://telegram.org/js/telegram-web-app.js"></script>
      </head>
      <body className="font-sans">{children}</body>
    </html>
  )
}
