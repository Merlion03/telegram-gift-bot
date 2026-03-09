/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Временно отключаем для отладки WebSocket
  // Убираем standalone для использования custom server с WebSocket
  // output: 'standalone',
}

module.exports = nextConfig
