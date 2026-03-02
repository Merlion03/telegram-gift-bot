/**
 * Unit-тесты для компонента DeliveryForm
 * 
 * Проверяют:
 * - Unit-тест: отображение всех обязательных полей
 * - Unit-тест: валидация невалидного телефона
 * 
 * Validates: Requirements 3.5, 4.1, 4.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryForm } from '../DeliveryForm';

// Мок для @telegram-apps/sdk-react
vi.mock('@telegram-apps/sdk-react', () => ({
  useInitData: vi.fn(),
  useWebApp: vi.fn(),
}));

// Мок для @twa-dev/sdk
vi.mock('@twa-dev/sdk', () => ({
  default: {
    initData: 'auth_date=1234567890&user=%7B%22id%22%3A12345%7D&hash=test_hash',
    close: vi.fn(),
    showAlert: vi.fn(),
  },
}));

import { useInitData, useWebApp } from '@telegram-apps/sdk-react';

describe('DeliveryForm - Unit Tests', () => {
  const mockInitData = {
    raw: 'auth_date=1234567890&user=%7B%22id%22%3A12345%7D&hash=test_hash',
  };

  const mockWebApp = {
    showAlert: vi.fn((message: string, callback?: () => void) => {
      if (callback) callback();
    }),
    close: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Настройка моков
    (useInitData as any).mockReturnValue(mockInitData);
    (useWebApp as any).mockReturnValue(mockWebApp);
    
    // Мок для fetch
    global.fetch = vi.fn();
  });

  /**
   * Requirement 4.1: Форма должна отображать все обязательные поля
   */
  describe('Отображение обязательных полей', () => {
    it('должен отображать поле "ФИО" с меткой обязательности', () => {
      render(<DeliveryForm prizeId={1} />);
      
      const label = screen.getByText(/ФИО/);
      expect(label).toBeInTheDocument();
      
      const requiredMark = screen.getAllByText('*')[0];
      expect(requiredMark).toBeInTheDocument();
      
      const input = screen.getByPlaceholderText(/Иванов Иван Иванович/);
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'text');
      expect(input).toHaveAttribute('id', 'full_name');
    });

    it('должен отображать поле "Адрес доставки" с меткой обязательности', () => {
      render(<DeliveryForm prizeId={1} />);
      
      const label = screen.getByText(/Адрес доставки/);
      expect(label).toBeInTheDocument();
      
      const textarea = screen.getByPlaceholderText(/Город, улица, дом, квартира/);
      expect(textarea).toBeInTheDocument();
      expect(textarea.tagName).toBe('TEXTAREA');
      expect(textarea).toHaveAttribute('id', 'address');
    });

    it('должен отображать поле "Номер телефона" с меткой обязательности', () => {
      render(<DeliveryForm prizeId={1} />);
      
      const label = screen.getByText(/Номер телефона/);
      expect(label).toBeInTheDocument();
      
      const input = screen.getByPlaceholderText(/\+79991234567/);
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'tel');
      expect(input).toHaveAttribute('id', 'phone');
    });

    it('должен отображать поле "Комментарий" без метки обязательности', () => {
      render(<DeliveryForm prizeId={1} />);
      
      const label = screen.getByText(/Комментарий \(опционально\)/);
      expect(label).toBeInTheDocument();
      
      const textarea = screen.getByPlaceholderText(/Дополнительная информация для доставки/);
      expect(textarea).toBeInTheDocument();
      expect(textarea.tagName).toBe('TEXTAREA');
      expect(textarea).toHaveAttribute('id', 'comment');
    });

    it('должен отображать кнопку отправки', () => {
      render(<DeliveryForm prizeId={1} />);
      
      const button = screen.getByRole('button', { name: /Отправить данные/ });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('type', 'submit');
    });

    it('все обязательные поля должны быть доступны для ввода', () => {
      render(<DeliveryForm prizeId={1} />);
      
      const fullNameInput = screen.getByPlaceholderText(/Иванов Иван Иванович/);
      const addressInput = screen.getByPlaceholderText(/Город, улица, дом, квартира/);
      const phoneInput = screen.getByPlaceholderText(/\+79991234567/);
      
      expect(fullNameInput).not.toBeDisabled();
      expect(addressInput).not.toBeDisabled();
      expect(phoneInput).not.toBeDisabled();
    });
  });

  /**
   * Requirement 4.1: Валидация невалидного телефона
   */
  describe('Валидация формата телефона', () => {
    it('должен показывать ошибку при вводе телефона с буквами', async () => {
      const user = userEvent.setup();
      render(<DeliveryForm prizeId={1} />);
      
      const phoneInput = screen.getByPlaceholderText(/\+79991234567/);
      const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
      
      // Заполняем обязательные поля
      await user.type(screen.getByPlaceholderText(/Иванов Иван Иванович/), 'Иван Иванов');
      await user.type(screen.getByPlaceholderText(/Город, улица, дом, квартира/), 'г. Москва, ул. Ленина, д. 1');
      await user.type(phoneInput, '+7999abc1234');
      
      // Отправляем форму
      await user.click(submitButton);
      
      // Проверяем, что появилась ошибка валидации
      await waitFor(() => {
        const errorMessage = screen.getByText(/Неверный формат телефона/);
        expect(errorMessage).toBeInTheDocument();
      });
      
      // Проверяем, что fetch не был вызван
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('должен показывать ошибку при вводе слишком короткого телефона', async () => {
      const user = userEvent.setup();
      render(<DeliveryForm prizeId={1} />);
      
      const phoneInput = screen.getByPlaceholderText(/\+79991234567/);
      const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
      
      // Заполняем обязательные поля
      await user.type(screen.getByPlaceholderText(/Иванов Иван Иванович/), 'Иван Иванов');
      await user.type(screen.getByPlaceholderText(/Город, улица, дом, квартира/), 'г. Москва, ул. Ленина, д. 1');
      await user.type(phoneInput, '+7999');
      
      // Отправляем форму
      await user.click(submitButton);
      
      // Проверяем, что появилась ошибка валидации
      await waitFor(() => {
        const errorMessage = screen.getByText(/Неверный формат телефона/);
        expect(errorMessage).toBeInTheDocument();
      });
      
      // Проверяем, что fetch не был вызван
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('должен показывать ошибку при вводе слишком длинного телефона', async () => {
      const user = userEvent.setup();
      render(<DeliveryForm prizeId={1} />);
      
      const phoneInput = screen.getByPlaceholderText(/\+79991234567/);
      const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
      
      // Заполняем обязательные поля
      await user.type(screen.getByPlaceholderText(/Иванов Иван Иванович/), 'Иван Иванов');
      await user.type(screen.getByPlaceholderText(/Город, улица, дом, квартира/), 'г. Москва, ул. Ленина, д. 1');
      await user.type(phoneInput, '+79991234567890123');
      
      // Отправляем форму
      await user.click(submitButton);
      
      // Проверяем, что появилась ошибка валидации
      await waitFor(() => {
        const errorMessage = screen.getByText(/Неверный формат телефона/);
        expect(errorMessage).toBeInTheDocument();
      });
      
      // Проверяем, что fetch не был вызван
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('должен принимать валидный телефон с плюсом', async () => {
      const user = userEvent.setup();
      
      // Мок успешного ответа от API
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });
      
      render(<DeliveryForm prizeId={1} />);
      
      const phoneInput = screen.getByPlaceholderText(/\+79991234567/);
      const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
      
      // Заполняем обязательные поля
      await user.type(screen.getByPlaceholderText(/Иванов Иван Иванович/), 'Иван Иванов');
      await user.type(screen.getByPlaceholderText(/Город, улица, дом, квартира/), 'г. Москва, ул. Ленина, д. 1');
      await user.type(phoneInput, '+79991234567');
      
      // Отправляем форму
      await user.click(submitButton);
      
      // Проверяем, что ошибки валидации нет
      await waitFor(() => {
        const errorMessage = screen.queryByText(/Неверный формат телефона/);
        expect(errorMessage).not.toBeInTheDocument();
      });
      
      // Проверяем, что fetch был вызван
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/delivery',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('должен принимать валидный телефон без плюса', async () => {
      const user = userEvent.setup();
      
      // Мок успешного ответа от API
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });
      
      render(<DeliveryForm prizeId={1} />);
      
      const phoneInput = screen.getByPlaceholderText(/\+79991234567/);
      const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
      
      // Заполняем обязательные поля
      await user.type(screen.getByPlaceholderText(/Иванов Иван Иванович/), 'Иван Иванов');
      await user.type(screen.getByPlaceholderText(/Город, улица, дом, квартира/), 'г. Москва, ул. Ленина, д. 1');
      await user.type(phoneInput, '79991234567');
      
      // Отправляем форму
      await user.click(submitButton);
      
      // Проверяем, что ошибки валидации нет
      await waitFor(() => {
        const errorMessage = screen.queryByText(/Неверный формат телефона/);
        expect(errorMessage).not.toBeInTheDocument();
      });
      
      // Проверяем, что fetch был вызван
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/delivery',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  /**
   * Requirement 4.1: Валидация других обязательных полей
   */
  describe('Валидация других полей', () => {
    it('должен показывать ошибку при слишком коротком ФИО', async () => {
      const user = userEvent.setup();
      render(<DeliveryForm prizeId={1} />);
      
      const fullNameInput = screen.getByPlaceholderText(/Иванов Иван Иванович/);
      const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
      
      // Заполняем поля
      await user.type(fullNameInput, 'А');
      await user.type(screen.getByPlaceholderText(/Город, улица, дом, квартира/), 'г. Москва, ул. Ленина, д. 1');
      await user.type(screen.getByPlaceholderText(/\+79991234567/), '+79991234567');
      
      // Отправляем форму
      await user.click(submitButton);
      
      // Проверяем, что появилась ошибка валидации
      await waitFor(() => {
        const errorMessage = screen.getByText(/Минимум 2 символа/);
        expect(errorMessage).toBeInTheDocument();
      });
    });

    it('должен показывать ошибку при слишком коротком адресе', async () => {
      const user = userEvent.setup();
      render(<DeliveryForm prizeId={1} />);
      
      const addressInput = screen.getByPlaceholderText(/Город, улица, дом, квартира/);
      const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
      
      // Заполняем поля
      await user.type(screen.getByPlaceholderText(/Иванов Иван Иванович/), 'Иван Иванов');
      await user.type(addressInput, 'Короткий');
      await user.type(screen.getByPlaceholderText(/\+79991234567/), '+79991234567');
      
      // Отправляем форму
      await user.click(submitButton);
      
      // Проверяем, что появилась ошибка валидации
      await waitFor(() => {
        const errorMessage = screen.getByText(/Минимум 10 символов/);
        expect(errorMessage).toBeInTheDocument();
      });
    });
  });
});
