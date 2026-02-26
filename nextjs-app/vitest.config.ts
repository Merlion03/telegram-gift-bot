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
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
