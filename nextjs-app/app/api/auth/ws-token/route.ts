/**
 * API endpoint для получения JWT токена для WebSocket подключения
 * Возвращает зашифрованный токен из cookie для передачи в WebSocket URL
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Получаем зашифрованный токен из cookie
    // NextAuth хранит токен в cookie с именем next-auth.session-token (или __Secure-next-auth.session-token для HTTPS)
    const cookieName = process.env.NODE_ENV === 'production' 
      ? '__Secure-next-auth.session-token' 
      : 'next-auth.session-token';
    
    const token = request.cookies.get(cookieName)?.value;

    // Если токен отсутствует, пользователь не авторизован
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Возвращаем зашифрованный токен - getToken на сервере сможет его расшифровать
    return NextResponse.json({
      token: token,
    });
  } catch (error) {
    console.error('[WS Token API] Error getting token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
