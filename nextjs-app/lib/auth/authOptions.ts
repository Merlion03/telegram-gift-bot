import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

/**
 * Конфигурация NextAuth.js для аутентификации админки
 * 
 * Использует credentials provider для простой аутентификации по логину/паролю.
 * В продакшене рекомендуется использовать более безопасные методы хранения паролей
 * (например, bcrypt) и подключение к базе данных пользователей.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        // Проверка наличия credentials
        if (!credentials) {
          return null;
        }

        // В продакшене здесь должна быть проверка по базе данных
        // с хешированными паролями
        const adminUsername = process.env.ADMIN_USERNAME;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (
          credentials.username === adminUsername &&
          credentials.password === adminPassword
        ) {
          // Возвращаем объект пользователя при успешной аутентификации
          return {
            id: '1',
            name: credentials.username,
            email: `${credentials.username}@admin.local`,
          };
        }

        // Возвращаем null при неудачной аутентификации
        return null;
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 часов (Requirements 11.4)
  },
  pages: {
    signIn: '/login', // Кастомная страница входа
  },
  callbacks: {
    async jwt({ token, user }) {
      // Добавляем данные пользователя в JWT токен при первом входе
      if (user) {
        token.id = user.id;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      // Добавляем данные из токена в сессию
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

