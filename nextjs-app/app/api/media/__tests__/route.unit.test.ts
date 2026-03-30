/**
 * Unit-тесты для API route GET /api/media/[...path]
 * Feature: telegram-media-messages-support
 * 
 * Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
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

describe('API Route: GET /api/media/[...path] - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Успешная раздача файлов', () => {
    it('должен вернуть файл с корректным Content-Type для JPEG', async () => {
      /**
       * Happy path: раздача JPEG изображения
       * Validates: Requirements 5.2, 5.3, 5.6
       */
      const mockFileBuffer = Buffer.from('fake-jpeg-data');
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => true,
      });
      mockReadFileSync.mockReturnValue(mockFileBuffer);

      const request = new NextRequest('http://localhost/api/media/photo/123/test.jpg');
      const response = await GET(request, {
        params: Promise.resolve({ path: ['photo', '123', 'test.jpg'] }) });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/jpeg');
      
      const buffer = await response.arrayBuffer();
      expect(Buffer.from(buffer)).toEqual(mockFileBuffer);
    });

    it('должен вернуть файл с Content-Type для PNG', async () => {
      /**
       * Content-Type mapping: PNG изображение
       * Validates: Requirements 5.3, 5.6
       */
      const mockFileBuffer = Buffer.from('fake-png-data');
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => true,
      });
      mockReadFileSync.mockReturnValue(mockFileBuffer);

      const request = new NextRequest('http://localhost/api/media/photo/456/image.png');
      const response = await GET(request, {
        params: Promise.resolve({ path: ['photo', '456', 'image.png'] }) });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/png');
    });

    it('должен вернуть файл с Content-Type для MP4 видео', async () => {
      /**
       * Content-Type mapping: MP4 видео
       * Validates: Requirements 5.3, 5.6
       */
      const mockFileBuffer = Buffer.from('fake-video-data');
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => true,
      });
      mockReadFileSync.mockReturnValue(mockFileBuffer);

      const request = new NextRequest('http://localhost/api/media/video/789/clip.mp4');
      const response = await GET(request, {
        params: Promise.resolve({ path: ['video', '789', 'clip.mp4'] }) });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('video/mp4');
    });

    it('должен вернуть файл с Content-Type для WebM видео', async () => {
      /**
       * Content-Type mapping: WebM видео
       * Validates: Requirements 5.3, 5.6
       */
      const mockFileBuffer = Buffer.from('fake-webm-data');
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => true,
      });
      mockReadFileSync.mockReturnValue(mockFileBuffer);

      const request = new NextRequest('http://localhost/api/media/sticker/111/sticker.webm');
      const response = await GET(request, {
        params: Promise.resolve({ path: ['sticker', '111', 'sticker.webm'] }) });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('video/webm');
    });

    it('должен вернуть файл с Content-Type для OGG аудио', async () => {
      /**
       * Content-Type mapping: OGG аудио
       * Validates: Requirements 5.3, 5.6
       */
      const mockFileBuffer = Buffer.from('fake-audio-data');
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => true,
      });
      mockReadFileSync.mockReturnValue(mockFileBuffer);

      const request = new NextRequest('http://localhost/api/media/voice/222/voice.ogg');
      const response = await GET(request, {
        params: Promise.resolve({ path: ['voice', '222', 'voice.ogg'] }) });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('audio/ogg');
    });

    it('должен вернуть application/octet-stream для неизвестного расширения', async () => {
      /**
       * Content-Type mapping: неизвестное расширение
       * Validates: Requirements 5.6
       */
      const mockFileBuffer = Buffer.from('fake-data');
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => true,
      });
      mockReadFileSync.mockReturnValue(mockFileBuffer);

      const request = new NextRequest('http://localhost/api/media/document/333/file.xyz');
      const response = await GET(request, {
        params: Promise.resolve({ path: ['document', '333', 'file.xyz'] }) });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
    });
  });

  describe('Cache-Control заголовок', () => {
    it('должен устанавливать Cache-Control заголовок для оптимизации', async () => {
      /**
       * Caching: проверка Cache-Control заголовка
       * Validates: Requirements 5.5
       */
      const mockFileBuffer = Buffer.from('fake-data');
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => true,
      });
      mockReadFileSync.mockReturnValue(mockFileBuffer);

      const request = new NextRequest('http://localhost/api/media/photo/123/test.jpg');
      const response = await GET(request, {
        params: Promise.resolve({ path: ['photo', '123', 'test.jpg'] }) });

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    });
  });

  describe('Обработка ошибки 404', () => {
    it('должен вернуть 404 для несуществующего файла', async () => {
      /**
       * Error handling: файл не найден
       * Validates: Requirements 5.2, 5.4
       */
      mockExistsSync.mockReturnValue(false);

      const request = new NextRequest('http://localhost/api/media/photo/999/nonexistent.jpg');
      const response = await GET(request, {
        params: Promise.resolve({ path: ['photo', '999', 'nonexistent.jpg'] }) });

      expect(response.status).toBe(404);
      
      const text = await response.text();
      expect(text).toBe('File not found');
      expect(response.headers.get('Content-Type')).toBe('text/plain');
    });

    it('должен вернуть 400 если путь указывает на директорию', async () => {
      /**
       * Error handling: путь к директории вместо файла
       * Validates: Requirements 5.2
       */
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => false,
      });

      const request = new NextRequest('http://localhost/api/media/photo/123');
      const response = await GET(request, {
        params: Promise.resolve({ path: ['photo', '123'] }) });

      expect(response.status).toBe(400);
      
      const text = await response.text();
      expect(text).toBe('Invalid file');
    });
  });

  describe('Валидация путей (защита от path traversal)', () => {
    it('должен блокировать path traversal с ".."', async () => {
      /**
       * Security: защита от path traversal атаки
       * Validates: Requirements 5.1
       */
      const request = new NextRequest('http://localhost/api/media/../../../etc/passwd');
      const response = await GET(request, {
        params: Promise.resolve({ path: ['..', '..', '..', 'etc', 'passwd'] }) });

      expect(response.status).toBe(400);
      
      const text = await response.text();
      expect(text).toBe('Invalid file path');
      expect(mockExistsSync).not.toHaveBeenCalled();
    });

    it('должен блокировать пути с двойными слэшами', async () => {
      /**
       * Security: защита от двойных слэшей
       * Validates: Requirements 5.1
       */
      const request = new NextRequest('http://localhost/api/media/photo//123/test.jpg');
      const response = await GET(request, {
        params: Promise.resolve({ path: ['photo', '', '123', 'test.jpg'] }) });

      // Путь содержит '//' после join
      expect(response.status).toBe(400);
      expect(mockExistsSync).not.toHaveBeenCalled();
    });

    it('должен блокировать пути с обратными слэшами', async () => {
      /**
       * Security: защита от обратных слэшей (Windows)
       * Validates: Requirements 5.1
       */
      const request = new NextRequest('http://localhost/api/media/photo\\123\\test.jpg');
      const response = await GET(request, {
        params: Promise.resolve({ path: ['photo\\123\\test.jpg'] }) });

      expect(response.status).toBe(400);
      expect(mockExistsSync).not.toHaveBeenCalled();
    });

    it('должен блокировать пути с тильдой (~)', async () => {
      /**
       * Security: защита от домашней директории
       * Validates: Requirements 5.1
       */
      const request = new NextRequest('http://localhost/api/media/~/secret.txt');
      const response = await GET(request, {
        params: Promise.resolve({ path: ['~', 'secret.txt'] }) });

      expect(response.status).toBe(400);
      expect(mockExistsSync).not.toHaveBeenCalled();
    });

    it('должен разрешать валидные пути', async () => {
      /**
       * Security: валидный путь должен проходить проверку
       * Validates: Requirements 5.1, 5.2
       */
      const mockFileBuffer = Buffer.from('valid-file');
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => true,
      });
      mockReadFileSync.mockReturnValue(mockFileBuffer);

      const request = new NextRequest('http://localhost/api/media/photo/123/test.jpg');
      const response = await GET(request, {
        params: Promise.resolve({ path: ['photo', '123', 'test.jpg'] }) });

      expect(response.status).toBe(200);
      expect(mockExistsSync).toHaveBeenCalled();
    });
  });

  describe('Логирование ошибок', () => {
    it('должен логировать ошибку при попытке path traversal', async () => {
      /**
       * Logging: логирование попыток path traversal
       * Validates: Requirements 5.1
       */
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const request = new NextRequest('http://localhost/api/media/../secret.txt');
      await GET(request, {
        params: Promise.resolve({ path: ['..', 'secret.txt'] }) });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Path traversal attempt detected:',
        expect.stringContaining('..')
      );

      consoleErrorSpy.mockRestore();
    });

    it('должен логировать ошибку при отсутствии файла', async () => {
      /**
       * Logging: логирование отсутствующих файлов
       * Validates: Requirements 5.4
       */
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockExistsSync.mockReturnValue(false);

      const request = new NextRequest('http://localhost/api/media/photo/999/missing.jpg');
      await GET(request, {
        params: Promise.resolve({ path: ['photo', '999', 'missing.jpg'] }) });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Media file not found:',
        expect.stringContaining('missing.jpg')
      );

      consoleErrorSpy.mockRestore();
    });

    it('должен логировать внутренние ошибки сервера', async () => {
      /**
       * Logging: логирование внутренних ошибок
       */
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockExistsSync.mockImplementation(() => {
        throw new Error('Disk read error');
      });

      const request = new NextRequest('http://localhost/api/media/photo/123/test.jpg');
      const response = await GET(request, {
        params: Promise.resolve({ path: ['photo', '123', 'test.jpg'] }) });

      expect(response.status).toBe(500);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error serving media file:',
        expect.objectContaining({
          error: 'Disk read error'
        })
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Различные расширения файлов', () => {
    it('должен корректно обрабатывать .jpeg расширение', async () => {
      /**
       * Content-Type: .jpeg расширение
       * Validates: Requirements 5.3, 5.6
       */
      const mockFileBuffer = Buffer.from('jpeg-data');
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => true,
      });
      mockReadFileSync.mockReturnValue(mockFileBuffer);

      const request = new NextRequest('http://localhost/api/media/photo/123/image.jpeg');
      const response = await GET(request, {
        params: Promise.resolve({ path: ['photo', '123', 'image.jpeg'] }) });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    });

    it('должен корректно обрабатывать .gif расширение', async () => {
      /**
       * Content-Type: .gif расширение
       * Validates: Requirements 5.3, 5.6
       */
      const mockFileBuffer = Buffer.from('gif-data');
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => true,
      });
      mockReadFileSync.mockReturnValue(mockFileBuffer);

      const request = new NextRequest('http://localhost/api/media/animation/456/anim.gif');
      const response = await GET(request, {
        params: Promise.resolve({ path: ['animation', '456', 'anim.gif'] }) });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/gif');
    });

    it('должен корректно обрабатывать .webp расширение', async () => {
      /**
       * Content-Type: .webp расширение
       * Validates: Requirements 5.3, 5.6
       */
      const mockFileBuffer = Buffer.from('webp-data');
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => true,
      });
      mockReadFileSync.mockReturnValue(mockFileBuffer);

      const request = new NextRequest('http://localhost/api/media/sticker/789/sticker.webp');
      const response = await GET(request, {
        params: Promise.resolve({ path: ['sticker', '789', 'sticker.webp'] }) });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/webp');
    });

    it('должен корректно обрабатывать .oga расширение', async () => {
      /**
       * Content-Type: .oga расширение (альтернатива .ogg)
       * Validates: Requirements 5.3, 5.6
       */
      const mockFileBuffer = Buffer.from('audio-data');
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => true,
      });
      mockReadFileSync.mockReturnValue(mockFileBuffer);

      const request = new NextRequest('http://localhost/api/media/voice/111/voice.oga');
      const response = await GET(request, {
        params: Promise.resolve({ path: ['voice', '111', 'voice.oga'] }) });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('audio/ogg');
    });
  });
});

