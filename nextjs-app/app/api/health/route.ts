import { NextResponse } from 'next/server';

/**
 * Health check endpoint для Docker HEALTHCHECK
 * Используется для проверки работоспособности приложения
 */
export async function GET() {
  return NextResponse.json(
    { 
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'telegram-bot-webapp'
    },
    { status: 200 }
  );
}
