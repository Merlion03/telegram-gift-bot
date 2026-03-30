import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Маппинг расширений файлов на Content-Type
 */
function getContentType(extension: string): string {
  const contentTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'audio/ogg',
    '.oga': 'audio/ogg',
  };
  
  return contentTypes[extension] || 'application/octet-stream';
}

/**
 * Валидация пути для защиты от path traversal атак
 * Проверяет, что путь не содержит опасных последовательностей
 */
function isPathSafe(filePath: string): boolean {
  // Проверка на path traversal паттерны
  const dangerousPatterns = [
    '..',           // Переход на уровень выше
    '~',            // Домашняя директория
    '//',           // Двойные слэши
    '\\',           // Обратные слэши (Windows)
  ];
  
  for (const pattern of dangerousPatterns) {
    if (filePath.includes(pattern)) {
      return false;
    }
  }
  
  // Проверка на абсолютные пути
  if (path.isAbsolute(filePath)) {
    return false;
  }
  
  return true;
}

/**
 * GET handler для раздачи медиафайлов
 * Endpoint: /api/media/[...path]
 * 
 * Функциональность:
 * - Раздача файлов из telegram-bot/media/
 * - Валидация путей (защита от path traversal)
 * - Маппинг расширений на Content-Type
 * - Cache-Control для оптимизации
 * - Обработка ошибок 404
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    // Await params для Next.js 15+
    const resolvedParams = await params;
    
    // 1. Получить путь к файлу из params
    const filePath = resolvedParams.path.join('/');
    
    // 2. Валидация пути (защита от path traversal)
    if (!isPathSafe(filePath)) {
      console.error('Path traversal attempt detected:', filePath);
      return new NextResponse('Invalid file path', { 
        status: 400,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    // 3. Построить полный путь к файлу
    // Путь: nextjs-app/../telegram-bot/media/{filePath}
    const fullPath = path.join(
      process.cwd(), 
      '..', 
      'telegram-bot', 
      'media', 
      filePath
    );
    
    // 4. Проверить существование файла
    if (!fs.existsSync(fullPath)) {
      console.error('Media file not found:', fullPath);
      return new NextResponse('File not found', { 
        status: 404,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    // 5. Проверить, что это файл, а не директория
    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
      console.error('Path is not a file:', fullPath);
      return new NextResponse('Invalid file', { 
        status: 400,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    // 6. Определить Content-Type по расширению
    const extension = path.extname(fullPath).toLowerCase();
    const contentType = getContentType(extension);
    
    // 7. Прочитать файл
    const fileBuffer = fs.readFileSync(fullPath);
    
    // 8. Вернуть файл с заголовками
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
    
  } catch (error) {
    // Логирование ошибок
    console.error('Error serving media file:', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    return new NextResponse('Internal server error', { 
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}
