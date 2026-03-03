/**
 * Интеграционные тесты для формы доставки
 * 
 * Проверяет полный flow от заполнения формы до сохранения в Google Sheets
 * 
 * Feature: delivery-form-field-separation
 * Task: 9.2 - Написать интеграционные тесты
 * Requirements: 3.3, 3.4, 3.5, 3.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { DeliveryForm } from '@/components/webapp/DeliveryForm';
import '@testing-library/jest-dom';

// Мокируем Telegram WebApp SDK
const mockWebApp = {
  initData: 'mock_init_data_string',
  showAlert: vi.fn((message: string, callback?: () => void) => {
    if (callback) callback();
  }),
  close: vi.fn(),
};

vi.mock('@twa-dev/sdk', () => ({
  default: mockWebApp,
}));

// Мокируем fetch для API запросов
global.fetch = vi.fn();

describe('DeliveryForm - Интеграционные тесты', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Вспомогательная функция для заполнения всех обязательных полей
  const fillRequiredFields = () => {
    fireEvent.change(screen.getByLabelText(/Фамилия/i), {
      target: { value: 'Иванов' },
    });
    fireEvent.change(screen.getByLabelText(/Имя/i), {
      target: { value: 'Иван' },
    });
    fireEvent.change(screen.getByLabelText(/Страна/i), {
      target: { value: 'Россия' },
    });
    fireEvent.change(screen.getByLabelText(/Почтовый индекс/i), {
      target: { value: '123456' },
    });
    fireEvent.change(screen.getByLabelText(/Город/i), {
      target: { value: 'Москва' },
    });
    fireEvent.change(screen.getByLabelText(/Улица/i), {
      target: { value: 'Ленина' },
    });
    fireEvent.change(screen.getByLabelText(/Дом/i), {
      target: { value: '10' },
    });
    fireEvent.change(screen.getByLabelText(/Номер телефона/i), {
      target: { value: '+79991234567' },
    });
  };

  /**
   * Requirement 3.3: Форма отправляет данные на endpoint /api/delivery с методом POST
   */
  it('должна отправлять данные на /api/delivery при успешной валидации', async () => {
    // Мокируем успешный ответ API
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, message: 'Данные успешно сохранены' }),
    });

    render(<DeliveryForm prizeId={123} />);

    // Заполняем все обязательные поля
    fillRequiredFields();

    // Отправляем форму
    const submitButton = screen.getByRole('button', { name: /Отправить данные/i });
    fireEvent.click(submitButton);

    // Проверяем, что fetch был вызван с правильными параметрами
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/delivery',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: expect.stringContaining('"last_name":"Иванов"'),
        })
      );
    });

    // Проверяем, что тело запроса содержит все поля
    const fetchCall = (global.fetch as any).mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1].body);

    expect(requestBody).toEqual({
      last_name: 'Иванов',
      first_name: 'Иван',
      patronymic: '',
      country: 'Россия',
      postal_code: '123456',
      city: 'Москва',
      street: 'Ленина',
      house: '10',
      apartment: '',
      phone: '+79991234567',
      comment: '',
      prize_id: 123,
      initData: 'mock_init_data_string',
    });
  });

  /**
   * Requirement 3.4: Форма включает prize_id и initData в тело запроса
   */
  it('должна включать prize_id и initData в запрос', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<DeliveryForm prizeId={456} />);

    // Заполняем минимальные обязательные поля
    fireEvent.change(screen.getByLabelText(/Фамилия/i), {
      target: { value: 'Петров' },
    });
    fireEvent.change(screen.getByLabelText(/Имя/i), {
      target: { value: 'Петр' },
    });
    fireEvent.change(screen.getByLabelText(/Страна/i), {
      target: { value: 'Беларусь' },
    });
    fireEvent.change(screen.getByLabelText(/Почтовый индекс/i), {
      target: { value: '220000' },
    });
    fireEvent.change(screen.getByLabelText(/Город/i), {
      target: { value: 'Санкт-Петербург' },
    });
    fireEvent.change(screen.getByLabelText(/Улица/i), {
      target: { value: 'Невский проспект' },
    });
    fireEvent.change(screen.getByLabelText(/Дом/i), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByLabelText(/Номер телефона/i), {
      target: { value: '+79001234567' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Отправить данные/i }));

    await waitFor(() => {
      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.prize_id).toBe(456);
      expect(requestBody.initData).toBe('mock_init_data_string');
    });
  });

  /**
   * Requirement 3.5: При успехе показывает alert через Telegram WebApp SDK и закрывает приложение
   */
  it('должна показывать alert и закрывать WebApp при успешной отправке', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<DeliveryForm prizeId={123} />);

    // Заполняем форму
    fillRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: /Отправить данные/i }));

    await waitFor(() => {
      expect(mockWebApp.showAlert).toHaveBeenCalledWith(
        'Данные успешно сохранены!',
        expect.any(Function)
      );
      expect(mockWebApp.close).toHaveBeenCalled();
    });
  });

  /**
   * Requirement 3.6: При ошибке отображает сообщение через ErrorMessage
   */
  it('должна отображать ErrorMessage при ошибке API', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: 'Validation error',
        message: 'Ошибка валидации данных',
      }),
    });

    render(<DeliveryForm prizeId={123} />);

    // Заполняем форму
    fillRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: /Отправить данные/i }));

    // Проверяем, что отображается сообщение об ошибке
    await waitFor(() => {
      expect(screen.getByText(/Проверьте правильность заполнения всех полей/i)).toBeInTheDocument();
    });

    // Проверяем, что WebApp не закрылся
    expect(mockWebApp.close).not.toHaveBeenCalled();
  });

  /**
   * Requirement 3.7: Во время отправки отключает все поля и кнопку
   */
  it('должна отключать поля и кнопку во время отправки', async () => {
    // Создаём промис, который не резолвится сразу
    let resolvePromise: (value: any) => void;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    (global.fetch as any).mockReturnValueOnce(pendingPromise);

    render(<DeliveryForm prizeId={123} />);

    // Заполняем форму
    fillRequiredFields();

    const submitButton = screen.getByRole('button', { name: /Отправить данные/i });
    fireEvent.click(submitButton);

    // Проверяем, что кнопка показывает "Отправка..." и отключена
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Отправка.../i })).toBeDisabled();
    });

    // Проверяем, что все поля отключены
    expect(screen.getByLabelText(/Фамилия/i)).toBeDisabled();
    expect(screen.getByLabelText(/Имя/i)).toBeDisabled();
    expect(screen.getByLabelText(/Город/i)).toBeDisabled();
    expect(screen.getByLabelText(/Улица/i)).toBeDisabled();
    expect(screen.getByLabelText(/Дом/i)).toBeDisabled();
    expect(screen.getByLabelText(/Номер телефона/i)).toBeDisabled();

    // Резолвим промис
    resolvePromise!({
      ok: true,
      json: async () => ({ success: true }),
    });
  });

  /**
   * Полный flow: заполнение формы с опциональными полями
   */
  it('должна корректно обрабатывать опциональные поля (отчество, квартира, комментарий)', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<DeliveryForm prizeId={789} />);

    // Заполняем все поля, включая опциональные
    fireEvent.change(screen.getByLabelText(/Фамилия/i), {
      target: { value: 'Полный' },
    });
    fireEvent.change(screen.getByLabelText(/Имя/i), {
      target: { value: 'Полное' },
    });
    fireEvent.change(screen.getByLabelText(/Отчество/i), {
      target: { value: 'Полнович' },
    });
    fireEvent.change(screen.getByLabelText(/Город/i), {
      target: { value: 'Владивосток' },
    });
    fireEvent.change(screen.getByLabelText(/Страна/i), {
      target: { value: 'Россия' },
    });
    fireEvent.change(screen.getByLabelText(/Почтовый индекс/i), {
      target: { value: '690091' },
    });
    fireEvent.change(screen.getByLabelText(/Город/i), {
      target: { value: 'Владивосток' },
    });
    fireEvent.change(screen.getByLabelText(/Улица/i), {
      target: { value: 'Светланская' },
    });
    fireEvent.change(screen.getByLabelText(/Дом/i), {
      target: { value: '15' },
    });
    fireEvent.change(screen.getByLabelText(/Квартира/i), {
      target: { value: '42' },
    });
    fireEvent.change(screen.getByLabelText(/Номер телефона/i), {
      target: { value: '+79441234567' },
    });
    fireEvent.change(screen.getByLabelText(/Комментарий/i), {
      target: { value: 'Позвонить за час до доставки' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Отправить данные/i }));

    await waitFor(() => {
      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody).toEqual({
        last_name: 'Полный',
        first_name: 'Полное',
        patronymic: 'Полнович',
        country: 'Россия',
        postal_code: '690091',
        city: 'Владивосток',
        street: 'Светланская',
        house: '15',
        apartment: '42',
        phone: '+79441234567',
        comment: 'Позвонить за час до доставки',
        prize_id: 789,
        initData: 'mock_init_data_string',
      });
    });
  });

  /**
   * Проверка обработки ошибки отсутствия InitData
   */
  it('должна показывать ошибку, если InitData недоступны', async () => {
    // Временно убираем initData
    const originalInitData = mockWebApp.initData;
    mockWebApp.initData = '';

    render(<DeliveryForm prizeId={123} />);

    // Заполняем форму
    fireEvent.change(screen.getByLabelText(/Фамилия/i), {
      target: { value: 'Ошибкин' },
    });
    fireEvent.change(screen.getByLabelText(/Имя/i), {
      target: { value: 'Ошибка' },
    });
    fireEvent.change(screen.getByLabelText(/Страна/i), {
      target: { value: 'Россия' },
    });
    fireEvent.change(screen.getByLabelText(/Почтовый индекс/i), {
      target: { value: '644000' },
    });
    fireEvent.change(screen.getByLabelText(/Город/i), {
      target: { value: 'Омск' },
    });
    fireEvent.change(screen.getByLabelText(/Улица/i), {
      target: { value: 'Ленина' },
    });
    fireEvent.change(screen.getByLabelText(/Дом/i), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByLabelText(/Номер телефона/i), {
      target: { value: '+79551234567' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Отправить данные/i }));

    // Проверяем, что отображается ошибка
    await waitFor(() => {
      expect(
        screen.getByText(/InitData недоступны. Откройте форму через Telegram./i)
      ).toBeInTheDocument();
    });

    // Восстанавливаем initData
    mockWebApp.initData = originalInitData;
  });

  /**
   * Проверка кнопки "Повторить" в ErrorMessage
   */
  it('должна позволять повторную отправку через кнопку "Повторить"', async () => {
    // Первый запрос - ошибка
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: 'Server error',
        message: 'Временная ошибка сервера',
      }),
    });

    render(<DeliveryForm prizeId={123} />);

    // Заполняем форму
    fireEvent.change(screen.getByLabelText(/Фамилия/i), {
      target: { value: 'Повторов' },
    });
    fireEvent.change(screen.getByLabelText(/Имя/i), {
      target: { value: 'Повтор' },
    });
    fireEvent.change(screen.getByLabelText(/Страна/i), {
      target: { value: 'Россия' },
    });
    fireEvent.change(screen.getByLabelText(/Почтовый индекс/i), {
      target: { value: '454000' },
    });
    fireEvent.change(screen.getByLabelText(/Город/i), {
      target: { value: 'Челябинск' },
    });
    fireEvent.change(screen.getByLabelText(/Улица/i), {
      target: { value: 'Кирова' },
    });
    fireEvent.change(screen.getByLabelText(/Дом/i), {
      target: { value: '10' },
    });
    fireEvent.change(screen.getByLabelText(/Номер телефона/i), {
      target: { value: '+79661234567' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Отправить данные/i }));

    // Ждём появления ошибки
    await waitFor(() => {
      expect(screen.getByText(/Server error/i)).toBeInTheDocument();
    });

    // Второй запрос - успех
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    // Нажимаем кнопку "Повторить"
    const retryButton = screen.getByRole('button', { name: /Повторить/i });
    fireEvent.click(retryButton);

    // Проверяем, что запрос был отправлен повторно
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
