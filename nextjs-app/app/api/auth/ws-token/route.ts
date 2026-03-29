/**
 * API endpoint для получения JWT токена для WebSocket подключения.
 * Поддерживает проверку admin-token и legacy NextAuth token.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // 1) Основной вариант: admin-token (текущая система авторизации)
    const adminToken = request.cookies.get('admin-token')?.value;
    if (adminToken) {
      return NextResponse.json({ token: adminToken });
    }

    // 2) Legacy fallback: NextAuth cookie
    const nextAuthCookieNames = process.env.NODE_ENV === 'production'
      ? ['__Secure-next-auth.session-token', 'next-auth.session-token']
      : ['next-auth.session-token', '__Secure-next-auth.session-token'];

    const nextAuthToken = nextAuthCookieNames
      .map((cookieName) => request.cookies.get(cookieName)?.value)
      .find((value): value is string => Boolean(value));

    if (nextAuthToken) {
      return NextResponse.json({ token: nextAuthToken });
    }

    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  } catch (error) {
    console.error('[WS Token API] Error getting token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
