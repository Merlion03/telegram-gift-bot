/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output для Docker - создаёт минимальный self-contained сервер
  output: 'standalone',
}

module.exports = nextConfig
