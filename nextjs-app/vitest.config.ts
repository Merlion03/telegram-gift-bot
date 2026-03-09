import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 15000, // Увеличиваем timeout для property-based тестов
    env: {
      ADMIN_USERNAME: 'testadmin',
      ADMIN_PASSWORD: 'testpassword123',
      NEXTAUTH_SECRET: 'test-secret-key-for-testing',
      BOT_TOKEN: 'test-bot-token',
      // PostgreSQL переменные для тестов
      DB_HOST: 'localhost',
      DB_PORT: '5433',
      DB_NAME: 'telegram_bot',
      DB_USER: 'postgres',
      DB_PASSWORD: 'postgres',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
