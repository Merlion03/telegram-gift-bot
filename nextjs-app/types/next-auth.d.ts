import 'next-auth';

/**
 * Расширение типов NextAuth для добавления кастомных полей
 * 
 * Добавляет поле id в User и JWT типы
 */
declare module 'next-auth' {
  interface User {
    id: string;
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
  }
}
