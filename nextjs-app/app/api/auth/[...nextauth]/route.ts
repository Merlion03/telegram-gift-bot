import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';

/**
 * API route для NextAuth.js
 * 
 * Обрабатывает все запросы аутентификации через NextAuth.js:
 * - GET /api/auth/signin - страница входа
 * - POST /api/auth/signin - обработка входа
 * - GET /api/auth/signout - выход
 * - GET /api/auth/session - получение текущей сессии
 * - GET /api/auth/csrf - CSRF токен
 * - GET /api/auth/providers - список провайдеров
 * 
 * Requirements: 11.3
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
