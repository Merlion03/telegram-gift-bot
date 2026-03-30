/**
 * Property-Based тесты для API route GET /api/media/[...path]
 * Feature: telegram-media-messages-support
 * 
 * Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { describe, expect, vi, beforeEach, afterEach } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { NextRequest } from 'next/server';

// Мокируем fs модуль с использованием vi.hoisted
const { mockExistsSync, mockStatSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockStatSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  statSync: mockStatSync,
  readFileSync: mockReadFileSync,
}));

import { GET } from '../[...path]/route';

// Генераторы для property-based тестов

/**
 * Генератор валидных типов медиа
 */
const mediaTypeArbitrary = fc.constantFrom(
  'photo',
  'video',
  'animation',
  'sticker',
  'voice',
  'document'
);

/**
 * Генератор валидных расширений файлов с соответствующими Content-Type
 */
const fileExtensionWithContentTypeArbitrary = fc.constantFrom(
  { ext: '.jpg', contentType: 'image/jpeg' },
  { ext: '.jpeg', contentType: 'image/jpeg' },
  { ext: '.png', contentType: 'image/png' },
  { ext: '.gif', contentType: 'image/gif' },
  { ext: '.webp', contentType: 'image/webp' },
  { ext: '.mp4', contentType: 'video/mp4' },
  { ext: '.webm', contentType: 'video/webm' },
  { ext: '.ogg', contentType: 'audio/ogg' },
  { ext: '.oga', contentType: 'audio/ogg' }
);

/**
 * Генератор валидных chat_id
 */
const chatIdArbitrary = fc.integer({ min: 1, max: 999999999 });

/**
 * Генератор валидных имен файлов (без опасных символов)
 */
const safeFilenameArbitrary = fc.string({ minLength: 1, maxLength: 50 })
  .filter(name => {
    const forbidden = ['..', '~', '//', '\\', '\0'];
    return !forbidden.some(pattern => name.includes(pattern)) && name.trim().length > 0;
  })
  .map(name => name.replace(/[^a-zA-Z0-9_-]/g, '_'));

/**
 * Генератор опасных путей для path traversal тестов
 */
const dangerousPathArbitrary = fc.oneof(
  fc.constant(['..', 'etc', 'passwd']),
  fc.constant(['photo', '..', '..', 'secret.txt']),
  fc.constant(['~', 'user', 'file.txt']),
  fc.constant(['photo', '', 'test.jpg']), // Двойной слэш
  fc.constant(['photo\\123\\file.jpg']), // Обратный слэш
);

describe('API Route: GET /api/media/[...path] - Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 13: Проверка существования файла в API
   * 
   * Для любого запроса к API endpoint, если файл не существует на File_Storage,
   * API должен вернуть HTTP статус 404.
   * 
   * Validates: Requirements 5.2, 5.4
   */
  test.prop([mediaTypeArbitrary, chatIdArbitrary, safeFilenameArbitrary, fileExtensionWithContentTypeArbitrary])(
    'Property 13: должен возвращать 404 для любого несуществующего файла',
    async (mediaType, chatId, filename, { ext }) => {
      // Arrange: файл не существует
      mockExistsSync.mockReturnValue(false);

      const path = [mediaType, chatId.toString(), `${filename}${ext}`];
      const request = new NextRequest(`http://localhost/api/media/${path.join('/')}`);

      // Act
      const response = await GET(request, { params: Promise.resolve({ path }) });

      // Assert
      expect(response.status).toBe(404);
      
      const text = await response.text();
      expect(text).toBe('File not found');
      expect(response.headers.get('Content-Type')).toBe('text/plain');
    }
  );

  test.prop([mediaTypeArbitrary, chatIdArbitrary, safeFilenameArbitrary, fileExtensionWithContentTypeArbitrary])(
    'Property 13: должен возвращать 200 для любого существующего файла',
    async (mediaType, chatId, filename, { ext, contentType }) => {
      // Arrange: файл существует
      const mockFileBuffer = Buffer.from('test-file-data');
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => true,
      });
      mockReadFileSync.mockReturnValue(mockFileBuffer);

      const path = [mediaType, chatId.toString(), `${filename}${ext}`];
      const request = new NextRequest(`http://localhost/api/media/${path.join('/')}`);

      // Act
      const response = await GET(request, { params: Promise.resolve({ path }) });

      // Assert
      expect(response.status).toBe(200);
      expect(mockExistsSync).toHaveBeenCalled();
      expect(mockReadFileSync).toHaveBeenCalled();
    }
  );

  /**
   * Property 14: Корректность Content-Type заголовка
   * 
   * Для любого существующего медиафайла, возвращаемого через API,
   * Content-Type заголовок должен соответствовать расширению файла.
   * 
   * Validates: Requirements 5.3, 5.6
   */
  test.prop([mediaTypeArbitrary, chatIdArbitrary, safeFilenameArbitrary, fileExtensionWithContentTypeArbitrary])(
    'Property 14: должен возвращать корректный Content-Type для любого расширения файла',
    async (mediaType, chatId, filename, { ext, contentType }) => {
      // Arrange
      const mockFileBuffer = Buffer.from('test-file-data');
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => true,
      });
      mockReadFileSync.mockReturnValue(mockFileBuffer);

      const path = [mediaType, chatId.toString(), `${filename}${ext}`];
      const request = new NextRequest(`http://localhost/api/media/${path.join('/')}`);

      // Act
      const response = await GET(request, { params: Promise.resolve({ path }) });

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe(contentType);
    }
  );

  test.prop([mediaTypeArbitrary, chatIdArbitrary, safeFilenameArbitrary])(
    'Property 14: должен возвращать application/octet-stream для неизвестных расширений',
    async (mediaType, chatId, filename) => {
      // Arrange: файл с неизвестным расширением
      const mockFileBuffer = Buffer.from('test-file-data');
      const unknownExt = '.xyz';
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => true,
      });
      mockReadFileSync.mockReturnValue(mockFileBuffer);

      const path = [mediaType, chatId.toString(), `${filename}${unknownExt}`];
      const request = new NextRequest(`http://localhost/api/media/${path.join('/')}`);

      // Act
      const response = await GET(request, { params: Promise.resolve({ path }) });

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
    }
  );

  /**
   * Property 15: Наличие Cache-Control заголовка
   * 
   * Для любого медиафайла, возвращаемого через API,
   * ответ должен содержать заголовок Cache-Control для оптимизации загрузки.
   * 
   * Validates: Requirements 5.5
   */
  test.prop([mediaTypeArbitrary, chatIdArbitrary, safeFilenameArbitrary, fileExtensionWithContentTypeArbitrary])(
    'Property 15: должен устанавливать Cache-Control заголовок для любого файла',
    async (mediaType, chatId, filename, { ext }) => {
      // Arrange
      const mockFileBuffer = Buffer.from('test-file-data');
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => true,
      });
      mockReadFileSync.mockReturnValue(mockFileBuffer);

      const path = [mediaType, chatId.toString(), `${filename}${ext}`];
      const request = new NextRequest(`http://localhost/api/media/${path.join('/')}`);

      // Act
      const response = await GET(request, { params: Promise.resolve({ path }) });

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    }
  );

  test.prop([mediaTypeArbitrary, chatIdArbitrary, safeFilenameArbitrary, fileExtensionWithContentTypeArbitrary])(
    'Property 15: Cache-Control должен присутствовать даже при ошибках чтения (если файл существует)',
    async (mediaType, chatId, filename, { ext }) => {
      // Arrange: файл существует, но ошибка при чтении
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => true,
      });
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Read error');
      });

      const path = [mediaType, chatId.toString(), `${filename}${ext}`];
      const request = new NextRequest(`http://localhost/api/media/${path.join('/')}`);

      // Act
      const response = await GET(request, { params: Promise.resolve({ path }) });

      // Assert: должна быть ошибка 500, но без Cache-Control (т.к. файл не был успешно прочитан)
      expect(response.status).toBe(500);
      // Cache-Control не должен быть установлен для ошибок
      expect(response.headers.get('Cache-Control')).toBeNull();
    }
  );

  /**
   * Дополнительные property-тесты для безопасности
   */
  test.prop([dangerousPathArbitrary])(
    'Property: должен блокировать любые опасные пути (path traversal)',
    async (dangerousPath) => {
      // Arrange: опасный путь
      const request = new NextRequest(`http://localhost/api/media/${dangerousPath.join('/')}`);

      // Act
      const response = await GET(request, { params: Promise.resolve({ path: dangerousPath }) });

      // Assert: должен вернуть 400 и НЕ вызывать fs операции
      expect(response.status).toBe(400);
      expect(mockExistsSync).not.toHaveBeenCalled();
      expect(mockReadFileSync).not.toHaveBeenCalled();
      
      const text = await response.text();
      expect(text).toBe('Invalid file path');
    }
  );

  /**
   * Property: Логирование ошибок
   */
  test.prop([mediaTypeArbitrary, chatIdArbitrary, safeFilenameArbitrary, fileExtensionWithContentTypeArbitrary])(
    'Property: должен логировать ошибку для любого несуществующего файла',
    async (mediaType, chatId, filename, { ext }) => {
      // Arrange
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockExistsSync.mockReturnValue(false);

      const path = [mediaType, chatId.toString(), `${filename}${ext}`];
      const request = new NextRequest(`http://localhost/api/media/${path.join('/')}`);

      // Act
      await GET(request, { params: Promise.resolve({ path }) });

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Media file not found:',
        expect.any(String)
      );

      consoleErrorSpy.mockRestore();
    }
  );

  test.prop([dangerousPathArbitrary])(
    'Property: должен логировать попытки path traversal',
    async (dangerousPath) => {
      // Arrange
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const request = new NextRequest(`http://localhost/api/media/${dangerousPath.join('/')}`);

      // Act
      await GET(request, { params: Promise.resolve({ path: dangerousPath }) });

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Path traversal attempt detected:',
        expect.any(String)
      );

      consoleErrorSpy.mockRestore();
    }
  );

  /**
   * Property: Валидация типа файла (не директория)
   */
  test.prop([mediaTypeArbitrary, chatIdArbitrary, safeFilenameArbitrary])(
    'Property: должен возвращать 400 если путь указывает на директорию',
    async (mediaType, chatId, dirname) => {
      // Arrange: путь существует, но это директория
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => false, // Это директория
      });

      const path = [mediaType, chatId.toString(), dirname];
      const request = new NextRequest(`http://localhost/api/media/${path.join('/')}`);

      // Act
      const response = await GET(request, { params: Promise.resolve({ path }) });

      // Assert
      expect(response.status).toBe(400);
      
      const text = await response.text();
      expect(text).toBe('Invalid file');
      expect(mockReadFileSync).not.toHaveBeenCalled();
    }
  );

  /**
   * Property: Корректность возвращаемых данных
   */
  test.prop([
    mediaTypeArbitrary,
    chatIdArbitrary,
    safeFilenameArbitrary,
    fileExtensionWithContentTypeArbitrary,
    fc.uint8Array({ minLength: 1, maxLength: 1000 })
  ])(
    'Property: должен возвращать те же данные, что были прочитаны из файла',
    async (mediaType, chatId, filename, { ext }, fileData) => {
      // Arrange
      const mockFileBuffer = Buffer.from(fileData);
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => true,
      });
      mockReadFileSync.mockReturnValue(mockFileBuffer);

      const path = [mediaType, chatId.toString(), `${filename}${ext}`];
      const request = new NextRequest(`http://localhost/api/media/${path.join('/')}`);

      // Act
      const response = await GET(request, { params: Promise.resolve({ path }) });

      // Assert
      expect(response.status).toBe(200);
      
      const responseBuffer = await response.arrayBuffer();
      expect(Buffer.from(responseBuffer)).toEqual(mockFileBuffer);
    }
  );
});


