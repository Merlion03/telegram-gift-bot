/**
 * Unit-тесты для API endpoint /api/delivery
 * Feature: delivery-form-field-separation
 * 
 * Requirements: 4.1, 4.3, 4.4, 4.5, 4.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/delivery/route';
import { NextRequest } from 'next/server';

// Моки для внешних зависимостей
vi.mock('@/lib/telegram/initDataValidator');
vi.mock('@/lib/google/sheetsClient');

// Импортируем моки
import { InitDataValidator } from '@/lib/telegram/initDataValidator';
import { GoogleSheetsClient } from '@/lib/google/sheetsClient';

describe('API /api/delivery - Unit Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Сохраняем оригинальные переменные окружения
    originalEnv = { ...process.env };
    
    // Настройка переменных окружения
    process.env.BOT_TOKEN = 'test_bot_token';
    process.env.GOOGLE_CREDENTIALS_JSON = '{"type":"service_account"}';
    process.env.SPREADSHEET_ID = 'test_spreadsheet_id';
    
    // Очистка моков
    vi.clearAllMocks();
    
    // Настройка моков для классов (используем function вместо стрелочной функции)
    vi.mocked(InitDataValidator).mockImplementation((function(this: any) {
      this.validate = vi.fn().mockReturnValue(true);
      this.extractUserData = vi.fn().mockReturnValue({ id: 12345 });
    } as any));
    
    vi.mocked(GoogleSheetsClient).mockImplementation((function(this: any) {
      this.saveDeliveryData = vi.fn().mockResolvedValue(true);
    } as any));
  });

  afterEach(() => {
    // Восстанавливаем переменные окружения
    process.env = originalEnv;
  });

  describe('Успешная обработка валидных данных', () => {
    it('должен успешно обработать запрос со всеми обязательными полями', async () => {
      const requestBody = {
        last_name: 'Иванов',
        first_name: 'Иван',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        prize_id: 1,
        initData: 'valid_init_data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Данные доставки успешно сохранены');
    });

    it('должен успешно обработать запрос с опциональными полями', async () => {
      const requestBody = {
        last_name: 'Петров',
        first_name: 'Петр',
        patronymic: 'Петрович',
        city: 'Санкт-Петербург',
        street: 'Невский проспект',
        house: '1',
        apartment: '100',
        phone: '+79991234567',
        comment: 'Позвонить за час',
        prize_id: 2,
        initData: 'valid_init_data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('должен обработать пустые опциональные поля (пустые строки)', async () => {
      const requestBody = {
        last_name: 'Сидоров',
        first_name: 'Сидор',
        patronymic: '',
        city: 'Казань',
        street: 'Баумана',
        house: '5',
        apartment: '',
        phone: '+79991234567',
        comment: '',
        prize_id: 3,
        initData: 'valid_init_data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Валидация обязательных полей (Requirements 4.5, 4.6)', () => {
    it('должен вернуть 400 при отсутствии last_name', async () => {
      const requestBody = {
        // last_name отсутствует
        first_name: 'Иван',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        prize_id: 1,
        initData: 'valid_init_data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
      expect(data.message).toBe('Ошибка валидации данных');
      expect(data.details).toBeDefined();
      
      const lastNameError = data.details.find((err: any) => err.field === 'last_name');
      expect(lastNameError).toBeDefined();
    });

    it('должен вернуть 400 при отсутствии first_name', async () => {
      const requestBody = {
        last_name: 'Иванов',
        // first_name отсутствует
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        prize_id: 1,
        initData: 'valid_init_data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
      
      const firstNameError = data.details.find((err: any) => err.field === 'first_name');
      expect(firstNameError).toBeDefined();
    });

    it('должен вернуть 400 при отсутствии city', async () => {
      const requestBody = {
        last_name: 'Иванов',
        first_name: 'Иван',
        // city отсутствует
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        prize_id: 1,
        initData: 'valid_init_data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
      
      const cityError = data.details.find((err: any) => err.field === 'city');
      expect(cityError).toBeDefined();
    });

    it('должен вернуть 400 при отсутствии street', async () => {
      const requestBody = {
        last_name: 'Иванов',
        first_name: 'Иван',
        city: 'Москва',
        // street отсутствует
        house: '10',
        phone: '+79991234567',
        prize_id: 1,
        initData: 'valid_init_data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
      
      const streetError = data.details.find((err: any) => err.field === 'street');
      expect(streetError).toBeDefined();
    });

    it('должен вернуть 400 при отсутствии house', async () => {
      const requestBody = {
        last_name: 'Иванов',
        first_name: 'Иван',
        city: 'Москва',
        street: 'Ленина',
        // house отсутствует
        phone: '+79991234567',
        prize_id: 1,
        initData: 'valid_init_data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
      
      const houseError = data.details.find((err: any) => err.field === 'house');
      expect(houseError).toBeDefined();
    });

    it('должен вернуть 400 при отсутствии phone', async () => {
      const requestBody = {
        last_name: 'Иванов',
        first_name: 'Иван',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        // phone отсутствует
        prize_id: 1,
        initData: 'valid_init_data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
      
      const phoneError = data.details.find((err: any) => err.field === 'phone');
      expect(phoneError).toBeDefined();
    });

    it('должен вернуть 400 при отсутствии prize_id', async () => {
      const requestBody = {
        last_name: 'Иванов',
        first_name: 'Иван',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        // prize_id отсутствует
        initData: 'valid_init_data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
      
      const prizeIdError = data.details.find((err: any) => err.field === 'prize_id');
      expect(prizeIdError).toBeDefined();
    });

    it('должен вернуть 400 при отсутствии initData', async () => {
      const requestBody = {
        last_name: 'Иванов',
        first_name: 'Иван',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        prize_id: 1,
        // initData отсутствует
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
      
      const initDataError = data.details.find((err: any) => err.field === 'initData');
      expect(initDataError).toBeDefined();
    });
  });

  describe('Валидация формата данных (Requirements 4.6)', () => {
    it('должен вернуть 400 при невалидном формате телефона', async () => {
      const requestBody = {
        last_name: 'Иванов',
        first_name: 'Иван',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: 'invalid-phone',
        prize_id: 1,
        initData: 'valid_init_data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
      
      const phoneError = data.details.find((err: any) => err.field === 'phone');
      expect(phoneError).toBeDefined();
      expect(phoneError.message).toContain('телефон');
    });

    it('должен вернуть 400 при слишком короткой фамилии', async () => {
      const requestBody = {
        last_name: 'И',
        first_name: 'Иван',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        prize_id: 1,
        initData: 'valid_init_data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
      
      const lastNameError = data.details.find((err: any) => err.field === 'last_name');
      expect(lastNameError).toBeDefined();
    });

    it('должен вернуть 400 при слишком длинной фамилии', async () => {
      const requestBody = {
        last_name: 'И'.repeat(51),
        first_name: 'Иван',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        prize_id: 1,
        initData: 'valid_init_data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
      
      const lastNameError = data.details.find((err: any) => err.field === 'last_name');
      expect(lastNameError).toBeDefined();
    });

    it('должен вернуть детальное описание для нескольких невалидных полей', async () => {
      const requestBody = {
        last_name: 'И',
        first_name: 'И'.repeat(51),
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: 'invalid',
        prize_id: 1,
        initData: 'valid_init_data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
      expect(data.details).toBeDefined();
      expect(Array.isArray(data.details)).toBe(true);
      expect(data.details.length).toBeGreaterThanOrEqual(3);
      
      // Проверяем структуру ошибок
      data.details.forEach((err: any) => {
        expect(err).toHaveProperty('field');
        expect(err).toHaveProperty('message');
        expect(typeof err.field).toBe('string');
        expect(typeof err.message).toBe('string');
      });
    });
  });

  describe('Валидация InitData (Requirement 4.3, 4.4)', () => {
    it('должен вернуть 403 при невалидном InitData', async () => {
      // Настраиваем мок для выброса ошибки
      vi.mocked(InitDataValidator).mockImplementation((function(this: any) {
        this.validate = vi.fn().mockImplementation(() => {
          throw new Error('Invalid signature');
        });
        this.extractUserData = vi.fn();
      } as any));

      const requestBody = {
        last_name: 'Иванов',
        first_name: 'Иван',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        prize_id: 1,
        initData: 'invalid_init_data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Invalid signature');
      expect(data.message).toBe('Невалидная подпись InitData');
    });
  });

  describe('Обработка ошибок сохранения (Requirement 4.7)', () => {
    it('должен вернуть 500 при ошибке сохранения в Google Sheets', async () => {
      // Настраиваем мок для выброса ошибки
      vi.mocked(GoogleSheetsClient).mockImplementation((function(this: any) {
        this.saveDeliveryData = vi.fn().mockRejectedValue(new Error('Failed to save'));
      } as any));

      const requestBody = {
        last_name: 'Иванов',
        first_name: 'Иван',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        prize_id: 1,
        initData: 'valid_init_data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to save delivery data');
      expect(data.message).toBe('Не удалось сохранить данные доставки. Попробуйте позже.');
    });
  });

  describe('Обработка невалидного JSON', () => {
    it('должен вернуть 400 при невалидном JSON', async () => {
      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: 'invalid json',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid JSON');
      expect(data.message).toBe('Тело запроса должно быть валидным JSON');
    });
  });
});
