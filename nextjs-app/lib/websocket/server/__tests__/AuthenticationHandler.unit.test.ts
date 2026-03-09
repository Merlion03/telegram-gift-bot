/**
 * Unit-тесты для AuthenticationHandler
 * Validates: Requirements 2.7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthenticationHandler } from '../AuthenticationHandler';
import { CUSTOM_CLOSE_CODES, ERROR_CODES } from '../../constants';
import type { IncomingMessage } from 'http';
import * as nextAuthJwt from 'next-auth/jwt';

// Мокируем next-auth/jwt
vi.mock('next-auth/jwt', () => ({
  decode: vi.fn(),
}));

describe('AuthenticationHandler Unit Tests', () => {
  let authHandler: AuthenticationHandler;
  const testSecret = 'test-secret-key';
  
  beforeEach(() => {
    authHandler = new AuthenticationHandler(testSecret);
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  /**
   * Вспомогательная функция для создания mock request
   */
  function createMockRequest(options: {
    url?: string;
    cookie?: string;
  }): IncomingMessage {
    return {
      url: options.url || '/',
      headers: {
        cookie: options.cookie,
        origin: 'http://localhost:3000',
        'user-agent': 'test-agent',
      },
    } as IncomingMessage;
  }
  
  describe('Requirement 2.7: Ошибка аутентификации с кодом 4401', () => {
    /**
     * Unit-тест: При невалидном токене соединение должно закрываться с кодом 4401
     * Validates: Requirements 2.7
     */
    it('должен вернуть код закрытия 4401 при отсутствии токена', async () => {
      // Arrange: создаём запрос без токена
      const request = createMockRequest({
        url: '/ws',
        cookie: undefined,
      });
      
      // Act: валидируем токен
      const result = await authHandler.validateToken(request);
      
      // Assert: проверяем, что возвращён код 4401
      expect(result.valid).toBe(false);
      expect(result.closeCode).toBe(CUSTOM_CLOSE_CODES.UNAUTHORIZED);
      expect(result.closeCode).toBe(4401);
      expect(result.errorCode).toBe(ERROR_CODES.INVALID_TOKEN);
      expect(result.errorMessage).toContain('session token missing');
    });
    
    it('должен вернуть код закрытия 4401 при невалидном токене (decode вернул null)', async () => {
      // Arrange: создаём запрос с токеном, но decode вернёт null
      const request = createMockRequest({
        url: '/ws?token=invalid-token',
      });
      
      vi.mocked(nextAuthJwt.decode).mockResolvedValue(null);
      
      // Act: валидируем токен
      const result = await authHandler.validateToken(request);
      
      // Assert: проверяем, что возвращён код 4401
      expect(result.valid).toBe(false);
      expect(result.closeCode).toBe(CUSTOM_CLOSE_CODES.UNAUTHORIZED);
      expect(result.closeCode).toBe(4401);
      expect(result.errorCode).toBe(ERROR_CODES.INVALID_TOKEN);
      expect(result.errorMessage).toContain('Invalid or expired');
    });
    
    it('должен вернуть код закрытия 4401 при истёкшем токене', async () => {
      // Arrange: создаём запрос с истёкшим токеном
      const request = createMockRequest({
        url: '/ws?token=expired-token',
      });
      
      const now = Math.floor(Date.now() / 1000);
      const expiredToken = {
        id: '123',
        name: 'Test User',
        exp: now - 3600, // Истёк час назад
      };
      
      vi.mocked(nextAuthJwt.decode).mockResolvedValue(expiredToken);
      
      // Act: валидируем токен
      const result = await authHandler.validateToken(request);
      
      // Assert: проверяем, что возвращён код 4401
      expect(result.valid).toBe(false);
      expect(result.closeCode).toBe(CUSTOM_CLOSE_CODES.UNAUTHORIZED);
      expect(result.closeCode).toBe(4401);
      expect(result.errorCode).toBe(ERROR_CODES.TOKEN_EXPIRED);
      expect(result.errorMessage).toContain('expired');
    });
    
    it('должен вернуть код закрытия 4401 при токене без обязательных полей', async () => {
      // Arrange: создаём запрос с токеном без id
      const request = createMockRequest({
        url: '/ws?token=incomplete-token',
      });
      
      const incompleteToken = {
        name: 'Test User',
        exp: Math.floor(Date.now() / 1000) + 3600,
        // id отсутствует
      } as any;
      
      vi.mocked(nextAuthJwt.decode).mockResolvedValue(incompleteToken);
      
      // Act: валидируем токен
      const result = await authHandler.validateToken(request);
      
      // Assert: проверяем, что возвращён код 4401
      expect(result.valid).toBe(false);
      expect(result.closeCode).toBe(CUSTOM_CLOSE_CODES.UNAUTHORIZED);
      expect(result.closeCode).toBe(4401);
      expect(result.errorCode).toBe(ERROR_CODES.INVALID_TOKEN);
      expect(result.errorMessage).toContain('missing required fields');
    });
    
    it('должен вернуть код закрытия 4401 при ошибке расшифровки токена', async () => {
      // Arrange: создаём запрос с токеном, decode выбросит ошибку
      const request = createMockRequest({
        url: '/ws?token=malformed-token',
      });
      
      vi.mocked(nextAuthJwt.decode).mockRejectedValue(new Error('Malformed JWT'));
      
      // Act: валидируем токен
      const result = await authHandler.validateToken(request);
      
      // Assert: проверяем, что возвращён код 4401 (даже при внутренней ошибке)
      expect(result.valid).toBe(false);
      expect(result.closeCode).toBe(CUSTOM_CLOSE_CODES.UNAUTHORIZED);
      expect(result.closeCode).toBe(4401);
      expect(result.errorCode).toBe(ERROR_CODES.INTERNAL_ERROR);
    });
  });
  
  describe('Успешная аутентификация', () => {
    it('должен успешно валидировать корректный токен из query параметра', async () => {
      // Arrange: создаём запрос с валидным токеном
      const request = createMockRequest({
        url: '/ws?token=valid-token',
      });
      
      const validToken = {
        id: '123',
        name: 'Test User',
        exp: Math.floor(Date.now() / 1000) + 3600, // Истекает через час
      };
      
      vi.mocked(nextAuthJwt.decode).mockResolvedValue(validToken);
      
      // Act: валидируем токен
      const result = await authHandler.validateToken(request);
      
      // Assert: проверяем успешную валидацию
      expect(result.valid).toBe(true);
      expect(result.userId).toBe(123);
      expect(result.userName).toBe('Test User');
      expect(result.isAdmin).toBe(true);
      expect(result.closeCode).toBeUndefined();
    });
    
    it('должен успешно валидировать корректный токен из cookies', async () => {
      // Arrange: создаём запрос с токеном в cookies
      const request = createMockRequest({
        url: '/ws',
        cookie: 'next-auth.session-token=valid-cookie-token; other=value',
      });
      
      const validToken = {
        id: '456',
        name: 'Cookie User',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      
      vi.mocked(nextAuthJwt.decode).mockResolvedValue(validToken);
      
      // Act: валидируем токен
      const result = await authHandler.validateToken(request);
      
      // Assert: проверяем успешную валидацию
      expect(result.valid).toBe(true);
      expect(result.userId).toBe(456);
      expect(result.userName).toBe('Cookie User');
      expect(result.isAdmin).toBe(true);
    });
    
    it('должен успешно валидировать токен без поля exp', async () => {
      // Arrange: создаём запрос с токеном без exp (не истекает)
      const request = createMockRequest({
        url: '/ws?token=no-exp-token',
      });
      
      const tokenWithoutExp = {
        id: '789',
        name: 'No Exp User',
        // exp отсутствует
      };
      
      vi.mocked(nextAuthJwt.decode).mockResolvedValue(tokenWithoutExp);
      
      // Act: валидируем токен
      const result = await authHandler.validateToken(request);
      
      // Assert: проверяем успешную валидацию
      expect(result.valid).toBe(true);
      expect(result.userId).toBe(789);
      expect(result.userName).toBe('No Exp User');
    });
  });
  
  describe('authenticateInit', () => {
    it('должен успешно аутентифицировать init сообщение', async () => {
      // Arrange
      const clientId = 'client-123';
      const request = createMockRequest({
        url: '/ws?token=valid-token',
      });
      
      const validToken = {
        id: '100',
        name: 'Init User',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      
      vi.mocked(nextAuthJwt.decode).mockResolvedValue(validToken);
      
      // Act
      const result = await authHandler.authenticateInit(clientId, request);
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.userId).toBe(100);
      expect(result.userName).toBe('Init User');
      expect(result.isAdmin).toBe(true);
    });
    
    it('должен вернуть ошибку при неудачной аутентификации init', async () => {
      // Arrange
      const clientId = 'client-456';
      const request = createMockRequest({
        url: '/ws', // Нет токена
      });
      
      // Act
      const result = await authHandler.authenticateInit(clientId, request);
      
      // Assert
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.INVALID_TOKEN);
      expect(result.errorMessage).toBeDefined();
    });
  });
  
  describe('canSubscribe', () => {
    it('должен разрешить подписку на канал session с sessionId', async () => {
      // Arrange
      const userId = 123;
      const channel = 'session';
      const sessionId = 456;
      
      // Act
      const result = await authHandler.canSubscribe(userId, channel, sessionId);
      
      // Assert
      expect(result.allowed).toBe(true);
      expect(result.errorCode).toBeUndefined();
    });
    
    it('должен запретить подписку на канал session без sessionId', async () => {
      // Arrange
      const userId = 123;
      const channel = 'session';
      // sessionId не указан
      
      // Act
      const result = await authHandler.canSubscribe(userId, channel);
      
      // Assert
      expect(result.allowed).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.INVALID_MESSAGE);
      expect(result.errorMessage).toContain('sessionId is required');
    });
    
    it('должен разрешить подписку на канал all', async () => {
      // Arrange
      const userId = 123;
      const channel = 'all';
      
      // Act
      const result = await authHandler.canSubscribe(userId, channel);
      
      // Assert
      expect(result.allowed).toBe(true);
    });
    
    it('должен разрешить подписку на канал status', async () => {
      // Arrange
      const userId = 123;
      const channel = 'status';
      
      // Act
      const result = await authHandler.canSubscribe(userId, channel);
      
      // Assert
      expect(result.allowed).toBe(true);
    });
  });
});
