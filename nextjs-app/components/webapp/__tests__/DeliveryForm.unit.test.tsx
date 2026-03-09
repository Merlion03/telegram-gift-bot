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
  useRawInitData: vi.fn(),
  useLaunchParams: vi.fn(),
}));

// Мок для @twa-dev/sdk
vi.mock('@twa-dev/sdk', () => ({
  default: {
    initData: 'auth_date=1234567890&user=%7B%22id%22%3A12345%7D&hash=test_hash',
    close: vi.fn(),
    showAlert: vi.fn(),
  },
}));

import { useRawInitData, useLaunchParams } from '@telegram-apps/sdk-react';

describe('DeliveryForm - Unit Tests', () => {
  const mockInitData = 'auth_date=1234567890&user=%7B%22id%22%3A12345%7D&hash=test_hash';

  const mockLaunchParams = {
    showAlert: vi.fn((message: string, callback?: () => void) => {
      if (callback) callback();
    }),
    close: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Настройка моков
    (useRawInitData as any).mockReturnValue(mockInitData);
    (useLaunchParams as any).mockReturnValue(mockLaunchParams);
    
    // Мок для fetch
    global.fetch = vi.fn();
  });

  /**
   * Requirement 4.1: Форма должна отображать все обязательные поля
   */
  describe('Отображение обязательных полей', () => {
    it('должен отображать поля ФИО с метками обязательности', () => {
      render(<DeliveryForm prizeId={1} />);
      
      // Проверяем поле "Фамилия"
      const lastNameLabel = screen.getByText(/Фамилия/);
      expect(lastNameLabel).toBeInTheDocument();
      const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
      expect(lastNameInput).toBeInTheDocument();
      expect(lastNameInput).toHaveAttribute('type', 'text');
      expect(lastNameInput).toHaveAttribute('id', 'last_name');
      
      // Проверяем поле "Имя"
      const firstNameLabel = screen.getByText(/Имя/);
      expect(firstNameLabel).toBeInTheDocument();
      const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
      expect(firstNameInput).toBeInTheDocument();
      expect(firstNameInput).toHaveAttribute('type', 'text');
      expect(firstNameInput).toHaveAttribute('id', 'first_name');
      
      // Проверяем поле "Отчество" (опционально)
      const patronymicLabel = screen.getByText(/Отчество/);
      expect(patronymicLabel).toBeInTheDocument();
      const patronymicInput = screen.getByRole('textbox', { name: /Отчество/ });
      expect(patronymicInput).toBeInTheDocument();
      expect(patronymicInput).toHaveAttribute('type', 'text');
      expect(patronymicInput).toHaveAttribute('id', 'patronymic');
    });

    it('должен отображать поля адреса с метками обязательности', () => {
      render(<DeliveryForm prizeId={1} />);
      
      // Проверяем поле "Город"
      const cityLabel = screen.getByText(/Город/);
      expect(cityLabel).toBeInTheDocument();
      const cityInput = screen.getByRole('textbox', { name: /Город/ });
      expect(cityInput).toBeInTheDocument();
      expect(cityInput).toHaveAttribute('type', 'text');
      expect(cityInput).toHaveAttribute('id', 'city');
      
      // Проверяем поле "Улица"
      const streetLabel = screen.getByText(/Улица/);
      expect(streetLabel).toBeInTheDocument();
      const streetInput = screen.getByRole('textbox', { name: /Улица/ });
      expect(streetInput).toBeInTheDocument();
      expect(streetInput).toHaveAttribute('type', 'text');
      expect(streetInput).toHaveAttribute('id', 'street');
      
      // Проверяем поле "Дом"
      const houseLabel = screen.getByText(/Дом/);
      expect(houseLabel).toBeInTheDocument();
      const houseInput = screen.getByRole('textbox', { name: /Дом/ });
      expect(houseInput).toBeInTheDocument();
      expect(houseInput).toHaveAttribute('type', 'text');
      expect(houseInput).toHaveAttribute('id', 'house');
      
      // Проверяем поле "Квартира" (опционально)
      const apartmentLabel = screen.getByText(/Квартира/);
      expect(apartmentLabel).toBeInTheDocument();
      const apartmentInput = screen.getByRole('textbox', { name: /Квартира/ });
      expect(apartmentInput).toBeInTheDocument();
      expect(apartmentInput).toHaveAttribute('type', 'text');
      expect(apartmentInput).toHaveAttribute('id', 'apartment');
    });

    it('должен отображать поле "Номер телефона" с меткой обязательности', () => {
      render(<DeliveryForm prizeId={1} />);
      
      const label = screen.getByText(/Номер телефона/);
      expect(label).toBeInTheDocument();
      
      const input = screen.getByRole('textbox', { name: /Номер телефона/ });
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'tel');
      expect(input).toHaveAttribute('id', 'phone');
    });

    it('должен отображать поле "Комментарий" без метки обязательности', () => {
      render(<DeliveryForm prizeId={1} />);
      
      const label = screen.getByText(/Комментарий \(опционально\)/);
      expect(label).toBeInTheDocument();
      
      const textarea = screen.getByRole('textbox', { name: /Комментарий/ });
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
      
      const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
      const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
      const cityInput = screen.getByRole('textbox', { name: /Город/ });
      const streetInput = screen.getByRole('textbox', { name: /Улица/ });
      const houseInput = screen.getByRole('textbox', { name: /Дом/ });
      const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
      
      expect(lastNameInput).not.toBeDisabled();
      expect(firstNameInput).not.toBeDisabled();
      expect(cityInput).not.toBeDisabled();
      expect(streetInput).not.toBeDisabled();
      expect(houseInput).not.toBeDisabled();
      expect(phoneInput).not.toBeDisabled();
    });
  });

  /**
   * Requirements 1.7, 2.8: Проверка placeholder-текстов
   */
  describe('Placeholder-тексты полей', () => {
    it('должен отображать правильные placeholder для полей ФИО', () => {
      render(<DeliveryForm prizeId={1} />);
      
      const lastNameInput = screen.getByPlaceholderText('Иванов');
      expect(lastNameInput).toBeInTheDocument();
      
      const firstNameInput = screen.getByPlaceholderText('Иван');
      expect(firstNameInput).toBeInTheDocument();
      
      const patronymicInput = screen.getByPlaceholderText('Иванович');
      expect(patronymicInput).toBeInTheDocument();
    });

    it('должен отображать правильные placeholder для адресных полей', () => {
      render(<DeliveryForm prizeId={1} />);
      
      const cityInput = screen.getByPlaceholderText('Москва');
      expect(cityInput).toBeInTheDocument();
      
      const streetInput = screen.getByPlaceholderText('Ленина');
      expect(streetInput).toBeInTheDocument();
      
      const houseInput = screen.getByPlaceholderText('10');
      expect(houseInput).toBeInTheDocument();
      
      const apartmentInput = screen.getByPlaceholderText('25');
      expect(apartmentInput).toBeInTheDocument();
    });

    it('должен отображать правильные placeholder для контактных полей', () => {
      render(<DeliveryForm prizeId={1} />);
      
      const phoneInput = screen.getByPlaceholderText('+79991234567');
      expect(phoneInput).toBeInTheDocument();
      
      const commentInput = screen.getByPlaceholderText('Дополнительная информация для доставки');
      expect(commentInput).toBeInTheDocument();
    });
  });

  /**
   * Requirements 1.1, 2.1, 5.3: Проверка обязательных индикаторов (*)
   */
  describe('Обязательные индикаторы (*)', () => {
    it('должен отображать индикатор (*) для обязательных полей ФИО', () => {
      render(<DeliveryForm prizeId={1} />);
      
      // Проверяем наличие индикатора для фамилии
      const lastNameLabel = screen.getByText(/Фамилия/);
      expect(lastNameLabel.textContent).toContain('*');
      
      // Проверяем наличие индикатора для имени
      const firstNameLabel = screen.getByText(/^Имя/);
      expect(firstNameLabel.textContent).toContain('*');
    });

    it('НЕ должен отображать индикатор (*) для опционального поля "Отчество"', () => {
      render(<DeliveryForm prizeId={1} />);
      
      const patronymicLabel = screen.getByText(/Отчество \(опционально\)/);
      expect(patronymicLabel.textContent).not.toMatch(/Отчество\s*\*/);
    });

    it('должен отображать индикатор (*) для обязательных адресных полей', () => {
      render(<DeliveryForm prizeId={1} />);
      
      // Проверяем наличие индикатора для города
      const cityLabel = screen.getByText(/Город/);
      expect(cityLabel.textContent).toContain('*');
      
      // Проверяем наличие индикатора для улицы
      const streetLabel = screen.getByText(/Улица/);
      expect(streetLabel.textContent).toContain('*');
      
      // Проверяем наличие индикатора для дома
      const houseLabel = screen.getByText(/Дом/);
      expect(houseLabel.textContent).toContain('*');
    });

    it('НЕ должен отображать индикатор (*) для опционального поля "Квартира"', () => {
      render(<DeliveryForm prizeId={1} />);
      
      const apartmentLabel = screen.getByText(/Квартира \(опционально\)/);
      expect(apartmentLabel.textContent).not.toMatch(/Квартира\s*\*/);
    });

    it('должен отображать индикатор (*) для поля "Номер телефона"', () => {
      render(<DeliveryForm prizeId={1} />);
      
      const phoneLabel = screen.getByText(/Номер телефона/);
      expect(phoneLabel.textContent).toContain('*');
    });

    it('НЕ должен отображать индикатор (*) для опционального поля "Комментарий"', () => {
      render(<DeliveryForm prizeId={1} />);
      
      const commentLabel = screen.getByText(/Комментарий \(опционально\)/);
      expect(commentLabel.textContent).not.toMatch(/Комментарий\s*\*/);
    });
  });

  /**
   * Requirements 5.1, 5.2: Проверка визуальной группировки полей
   */
  describe('Визуальная группировка полей', () => {
    it('должен отображать заголовок секции "Получатель"', () => {
      render(<DeliveryForm prizeId={1} />);
      
      const sectionTitle = screen.getByText('Получатель');
      expect(sectionTitle).toBeInTheDocument();
      expect(sectionTitle.tagName).toBe('H3');
    });

    it('должен отображать заголовок секции "Адрес доставки"', () => {
      render(<DeliveryForm prizeId={1} />);
      
      const sectionTitle = screen.getByText('Адрес доставки');
      expect(sectionTitle).toBeInTheDocument();
      expect(sectionTitle.tagName).toBe('H3');
    });

    it('должен отображать заголовок секции "Контактная информация"', () => {
      render(<DeliveryForm prizeId={1} />);
      
      const sectionTitle = screen.getByText('Контактная информация');
      expect(sectionTitle).toBeInTheDocument();
      expect(sectionTitle.tagName).toBe('H3');
    });

    it('поля ФИО должны быть в секции "Получатель"', () => {
      const { container } = render(<DeliveryForm prizeId={1} />);
      
      // Находим секцию "Получатель"
      const receiverSection = screen.getByText('Получатель').closest('div');
      expect(receiverSection).toBeInTheDocument();
      
      // Проверяем, что поля ФИО находятся в этой секции
      const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
      const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
      const patronymicInput = screen.getByRole('textbox', { name: /Отчество/ });
      
      expect(receiverSection).toContainElement(lastNameInput);
      expect(receiverSection).toContainElement(firstNameInput);
      expect(receiverSection).toContainElement(patronymicInput);
    });

    it('адресные поля должны быть в секции "Адрес доставки"', () => {
      render(<DeliveryForm prizeId={1} />);
      
      // Находим секцию "Адрес доставки"
      const addressSection = screen.getByText('Адрес доставки').closest('div');
      expect(addressSection).toBeInTheDocument();
      
      // Проверяем, что адресные поля находятся в этой секции
      const cityInput = screen.getByRole('textbox', { name: /Город/ });
      const streetInput = screen.getByRole('textbox', { name: /Улица/ });
      const houseInput = screen.getByRole('textbox', { name: /Дом/ });
      const apartmentInput = screen.getByRole('textbox', { name: /Квартира/ });
      
      expect(addressSection).toContainElement(cityInput);
      expect(addressSection).toContainElement(streetInput);
      expect(addressSection).toContainElement(houseInput);
      expect(addressSection).toContainElement(apartmentInput);
    });

    it('контактные поля должны быть в секции "Контактная информация"', () => {
      render(<DeliveryForm prizeId={1} />);
      
      // Находим секцию "Контактная информация"
      const contactSection = screen.getByText('Контактная информация').closest('div');
      expect(contactSection).toBeInTheDocument();
      
      // Проверяем, что контактные поля находятся в этой секции
      const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
      const commentInput = screen.getByRole('textbox', { name: /Комментарий/ });
      
      expect(contactSection).toContainElement(phoneInput);
      expect(contactSection).toContainElement(commentInput);
    });
  });

  /**
   * Requirement 3.7: Проверка отключения полей во время отправки
   */
  describe('Отключение полей во время отправки', () => {
    it('должен отключать все поля и кнопку во время отправки формы', async () => {
      const user = userEvent.setup();
      
      // Мок для имитации задержки ответа API
      (global.fetch as any).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: async () => ({ success: true }),
        }), 100))
      );
      
      render(<DeliveryForm prizeId={1} />);
      
      const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
      const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
      const patronymicInput = screen.getByRole('textbox', { name: /Отчество/ });
      const countryInput = screen.getByRole('textbox', { name: /Страна/ });
      const postalCodeInput = screen.getByRole('textbox', { name: /Почтовый индекс/ });
      const cityInput = screen.getByRole('textbox', { name: /Город/ });
      const streetInput = screen.getByRole('textbox', { name: /Улица/ });
      const houseInput = screen.getByRole('textbox', { name: /Дом/ });
      const apartmentInput = screen.getByRole('textbox', { name: /Квартира/ });
      const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
      const commentInput = screen.getByRole('textbox', { name: /Комментарий/ });
      const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
      
      // Заполняем обязательные поля
      await user.type(lastNameInput, 'Иванов');
      await user.type(firstNameInput, 'Иван');
      await user.type(countryInput, 'Россия');
      await user.type(postalCodeInput, '123456');
      await user.type(cityInput, 'Москва');
      await user.type(streetInput, 'Ленина');
      await user.type(houseInput, '10');
      await user.type(phoneInput, '+79991234567');
      
      // Отправляем форму
      await user.click(submitButton);
      
      // Проверяем, что все поля отключены во время отправки
      await waitFor(() => {
        expect(lastNameInput).toBeDisabled();
        expect(firstNameInput).toBeDisabled();
        expect(patronymicInput).toBeDisabled();
        expect(countryInput).toBeDisabled();
        expect(postalCodeInput).toBeDisabled();
        expect(cityInput).toBeDisabled();
        expect(streetInput).toBeDisabled();
        expect(houseInput).toBeDisabled();
        expect(apartmentInput).toBeDisabled();
        expect(phoneInput).toBeDisabled();
        expect(commentInput).toBeDisabled();
        expect(submitButton).toBeDisabled();
      });
      
      // Проверяем, что текст кнопки изменился
      expect(submitButton).toHaveTextContent('Отправка...');
    });

    it('должен включать поля обратно после успешной отправки', async () => {
      const user = userEvent.setup();
      
      // Мок успешного ответа от API
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });
      
      // Мок для динамического импорта @twa-dev/sdk
      const mockTwaWebApp = {
        initData: 'auth_date=1234567890&user=%7B%22id%22%3A12345%7D&hash=test_hash',
        showAlert: vi.fn((message: string, callback?: () => void) => {
          if (callback) callback();
        }),
        close: vi.fn(),
      };
      
      vi.doMock('@twa-dev/sdk', () => ({
        default: mockTwaWebApp,
      }));
      
      render(<DeliveryForm prizeId={1} />);
      
      const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
      const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
      const countryInput = screen.getByRole('textbox', { name: /Страна/ });
      const postalCodeInput = screen.getByRole('textbox', { name: /Почтовый индекс/ });
      const cityInput = screen.getByRole('textbox', { name: /Город/ });
      const streetInput = screen.getByRole('textbox', { name: /Улица/ });
      const houseInput = screen.getByRole('textbox', { name: /Дом/ });
      const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
      const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
      
      // Заполняем обязательные поля
      await user.type(lastNameInput, 'Иванов');
      await user.type(firstNameInput, 'Иван');
      await user.type(countryInput, 'Россия');
      await user.type(postalCodeInput, '123456');
      await user.type(cityInput, 'Москва');
      await user.type(streetInput, 'Ленина');
      await user.type(houseInput, '10');
      await user.type(phoneInput, '+79991234567');
      
      // Отправляем форму
      await user.click(submitButton);
      
      // Ждем завершения отправки
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/delivery',
          expect.objectContaining({
            method: 'POST',
          })
        );
      }, { timeout: 3000 });
    });

    it('должен включать поля обратно после ошибки отправки', async () => {
      const user = userEvent.setup();
      
      // Мок ошибки от API
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Ошибка сервера' }),
      });
      
      render(<DeliveryForm prizeId={1} />);
      
      const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
      const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
      const countryInput = screen.getByRole('textbox', { name: /Страна/ });
      const postalCodeInput = screen.getByRole('textbox', { name: /Почтовый индекс/ });
      const cityInput = screen.getByRole('textbox', { name: /Город/ });
      const streetInput = screen.getByRole('textbox', { name: /Улица/ });
      const houseInput = screen.getByRole('textbox', { name: /Дом/ });
      const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
      const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
      
      // Заполняем обязательные поля
      await user.type(lastNameInput, 'Иванов');
      await user.type(firstNameInput, 'Иван');
      await user.type(countryInput, 'Россия');
      await user.type(postalCodeInput, '123456');
      await user.type(cityInput, 'Москва');
      await user.type(streetInput, 'Ленина');
      await user.type(houseInput, '10');
      await user.type(phoneInput, '+79991234567');
      
      // Отправляем форму
      await user.click(submitButton);
      
      // Ждем появления сообщения об ошибке
      await waitFor(() => {
        const errorMessage = screen.getByText(/Ошибка сервера/);
        expect(errorMessage).toBeInTheDocument();
      });
      
      // Проверяем, что поля снова доступны
      expect(lastNameInput).not.toBeDisabled();
      expect(firstNameInput).not.toBeDisabled();
      expect(countryInput).not.toBeDisabled();
      expect(postalCodeInput).not.toBeDisabled();
      expect(cityInput).not.toBeDisabled();
      expect(streetInput).not.toBeDisabled();
      expect(houseInput).not.toBeDisabled();
      expect(phoneInput).not.toBeDisabled();
      expect(submitButton).not.toBeDisabled();
    });
  });

  /**
   * Requirement 4.1: Валидация невалидного телефона
   */
  describe('Валидация формата телефона', () => {
    it('должен показывать ошибку при вводе телефона с буквами', async () => {
      const user = userEvent.setup();
      render(<DeliveryForm prizeId={1} />);
      
      const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
      const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
      const cityInput = screen.getByRole('textbox', { name: /Город/ });
      const streetInput = screen.getByRole('textbox', { name: /Улица/ });
      const houseInput = screen.getByRole('textbox', { name: /Дом/ });
      const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
      const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
      
      // Заполняем обязательные поля
      await user.type(lastNameInput, 'Иванов');
      await user.type(firstNameInput, 'Иван');
      await user.type(cityInput, 'Москва');
      await user.type(streetInput, 'Ленина');
      await user.type(houseInput, '10');
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
      
      const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
      const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
      const cityInput = screen.getByRole('textbox', { name: /Город/ });
      const streetInput = screen.getByRole('textbox', { name: /Улица/ });
      const houseInput = screen.getByRole('textbox', { name: /Дом/ });
      const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
      const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
      
      // Заполняем обязательные поля
      await user.type(lastNameInput, 'Иванов');
      await user.type(firstNameInput, 'Иван');
      await user.type(cityInput, 'Москва');
      await user.type(streetInput, 'Ленина');
      await user.type(houseInput, '10');
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
      
      const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
      const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
      const cityInput = screen.getByRole('textbox', { name: /Город/ });
      const streetInput = screen.getByRole('textbox', { name: /Улица/ });
      const houseInput = screen.getByRole('textbox', { name: /Дом/ });
      const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
      const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
      
      // Заполняем обязательные поля
      await user.type(lastNameInput, 'Иванов');
      await user.type(firstNameInput, 'Иван');
      await user.type(cityInput, 'Москва');
      await user.type(streetInput, 'Ленина');
      await user.type(houseInput, '10');
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
      
      const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
      const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
      const countryInput = screen.getByRole('textbox', { name: /Страна/ });
      const postalCodeInput = screen.getByRole('textbox', { name: /Почтовый индекс/ });
      const cityInput = screen.getByRole('textbox', { name: /Город/ });
      const streetInput = screen.getByRole('textbox', { name: /Улица/ });
      const houseInput = screen.getByRole('textbox', { name: /Дом/ });
      const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
      const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
      
      // Заполняем обязательные поля
      await user.type(lastNameInput, 'Иванов');
      await user.type(firstNameInput, 'Иван');
      await user.type(countryInput, 'Россия');
      await user.type(postalCodeInput, '123456');
      await user.type(cityInput, 'Москва');
      await user.type(streetInput, 'Ленина');
      await user.type(houseInput, '10');
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
      
      const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
      const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
      const countryInput = screen.getByRole('textbox', { name: /Страна/ });
      const postalCodeInput = screen.getByRole('textbox', { name: /Почтовый индекс/ });
      const cityInput = screen.getByRole('textbox', { name: /Город/ });
      const streetInput = screen.getByRole('textbox', { name: /Улица/ });
      const houseInput = screen.getByRole('textbox', { name: /Дом/ });
      const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
      const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
      
      // Заполняем обязательные поля
      await user.type(lastNameInput, 'Иванов');
      await user.type(firstNameInput, 'Иван');
      await user.type(countryInput, 'Россия');
      await user.type(postalCodeInput, '123456');
      await user.type(cityInput, 'Москва');
      await user.type(streetInput, 'Ленина');
      await user.type(houseInput, '10');
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
    it('должен показывать ошибку при слишком короткой фамилии', async () => {
      const user = userEvent.setup();
      render(<DeliveryForm prizeId={1} />);
      
      const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
      const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
      const countryInput = screen.getByRole('textbox', { name: /Страна/ });
      const postalCodeInput = screen.getByRole('textbox', { name: /Почтовый индекс/ });
      const cityInput = screen.getByRole('textbox', { name: /Город/ });
      const streetInput = screen.getByRole('textbox', { name: /Улица/ });
      const houseInput = screen.getByRole('textbox', { name: /Дом/ });
      const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
      const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
      
      // Заполняем поля
      await user.type(lastNameInput, 'А');
      await user.type(firstNameInput, 'Иван');
      await user.type(countryInput, 'Россия');
      await user.type(postalCodeInput, '123456');
      await user.type(cityInput, 'Москва');
      await user.type(streetInput, 'Ленина');
      await user.type(houseInput, '10');
      await user.type(phoneInput, '+79991234567');
      
      // Отправляем форму
      await user.click(submitButton);
      
      // Проверяем, что появилась ошибка валидации
      await waitFor(() => {
        const errorMessage = screen.getByText(/Минимум 2 символа/);
        expect(errorMessage).toBeInTheDocument();
      });
    });

    it('должен показывать ошибку при слишком коротком городе', async () => {
      const user = userEvent.setup();
      render(<DeliveryForm prizeId={1} />);
      
      const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
      const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
      const countryInput = screen.getByRole('textbox', { name: /Страна/ });
      const postalCodeInput = screen.getByRole('textbox', { name: /Почтовый индекс/ });
      const cityInput = screen.getByRole('textbox', { name: /Город/ });
      const streetInput = screen.getByRole('textbox', { name: /Улица/ });
      const houseInput = screen.getByRole('textbox', { name: /Дом/ });
      const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
      const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
      
      // Заполняем поля
      await user.type(lastNameInput, 'Иванов');
      await user.type(firstNameInput, 'Иван');
      await user.type(countryInput, 'Россия');
      await user.type(postalCodeInput, '123456');
      await user.type(cityInput, 'М');
      await user.type(streetInput, 'Ленина');
      await user.type(houseInput, '10');
      await user.type(phoneInput, '+79991234567');
      
      // Отправляем форму
      await user.click(submitButton);
      
      // Проверяем, что появилась ошибка валидации
      await waitFor(() => {
        const errorMessage = screen.getByText(/Минимум 2 символа/);
        expect(errorMessage).toBeInTheDocument();
      });
    });
  });

  /**
   * Requirements 9.1, 9.2: Валидация новых полей country и postal_code
   */
  describe('Валидация полей "Страна" и "Почтовый индекс"', () => {
    /**
     * Тесты для поля "Страна" (country)
     */
    describe('Валидация поля "Страна"', () => {
      it('должен показывать ошибку при слишком короткой стране (< 2 символов)', async () => {
        const user = userEvent.setup();
        render(<DeliveryForm prizeId={1} />);
        
        const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
        const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
        const countryInput = screen.getByRole('textbox', { name: /Страна/ });
        const postalCodeInput = screen.getByRole('textbox', { name: /Почтовый индекс/ });
        const cityInput = screen.getByRole('textbox', { name: /Город/ });
        const streetInput = screen.getByRole('textbox', { name: /Улица/ });
        const houseInput = screen.getByRole('textbox', { name: /Дом/ });
        const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
        const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
        
        // Заполняем поля
        await user.type(lastNameInput, 'Иванов');
        await user.type(firstNameInput, 'Иван');
        await user.type(countryInput, 'Р'); // Слишком короткое значение
        await user.type(postalCodeInput, '123456');
        await user.type(cityInput, 'Москва');
        await user.type(streetInput, 'Ленина');
        await user.type(houseInput, '10');
        await user.type(phoneInput, '+79991234567');
        
        // Отправляем форму
        await user.click(submitButton);
        
        // Проверяем, что появилась ошибка валидации
        await waitFor(() => {
          const errorMessage = screen.getByText(/Минимум 2 символа/);
          expect(errorMessage).toBeInTheDocument();
        });
        
        // Проверяем, что fetch не был вызван
        expect(global.fetch).not.toHaveBeenCalled();
      });

      it('должен показывать ошибку при слишком длинной стране (> 100 символов)', async () => {
        const user = userEvent.setup();
        render(<DeliveryForm prizeId={1} />);
        
        const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
        const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
        const countryInput = screen.getByRole('textbox', { name: /Страна/ });
        const postalCodeInput = screen.getByRole('textbox', { name: /Почтовый индекс/ });
        const cityInput = screen.getByRole('textbox', { name: /Город/ });
        const streetInput = screen.getByRole('textbox', { name: /Улица/ });
        const houseInput = screen.getByRole('textbox', { name: /Дом/ });
        const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
        const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
        
        // Создаем строку длиной 101 символ
        const longCountry = 'А'.repeat(101);
        
        // Заполняем поля
        await user.type(lastNameInput, 'Иванов');
        await user.type(firstNameInput, 'Иван');
        await user.type(countryInput, longCountry);
        await user.type(postalCodeInput, '123456');
        await user.type(cityInput, 'Москва');
        await user.type(streetInput, 'Ленина');
        await user.type(houseInput, '10');
        await user.type(phoneInput, '+79991234567');
        
        // Отправляем форму
        await user.click(submitButton);
        
        // Проверяем, что появилась ошибка валидации
        await waitFor(() => {
          const errorMessage = screen.getByText(/Максимум 100 символов/);
          expect(errorMessage).toBeInTheDocument();
        });
        
        // Проверяем, что fetch не был вызван
        expect(global.fetch).not.toHaveBeenCalled();
      });

      it('должен принимать валидную страну (2-100 символов)', async () => {
        const user = userEvent.setup();
        
        // Мок успешного ответа от API
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });
        
        render(<DeliveryForm prizeId={1} />);
        
        const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
        const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
        const countryInput = screen.getByRole('textbox', { name: /Страна/ });
        const postalCodeInput = screen.getByRole('textbox', { name: /Почтовый индекс/ });
        const cityInput = screen.getByRole('textbox', { name: /Город/ });
        const streetInput = screen.getByRole('textbox', { name: /Улица/ });
        const houseInput = screen.getByRole('textbox', { name: /Дом/ });
        const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
        const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
        
        // Заполняем поля
        await user.type(lastNameInput, 'Иванов');
        await user.type(firstNameInput, 'Иван');
        await user.type(countryInput, 'Россия');
        await user.type(postalCodeInput, '123456');
        await user.type(cityInput, 'Москва');
        await user.type(streetInput, 'Ленина');
        await user.type(houseInput, '10');
        await user.type(phoneInput, '+79991234567');
        
        // Отправляем форму
        await user.click(submitButton);
        
        // Проверяем, что ошибки валидации нет
        await waitFor(() => {
          const errorMessage = screen.queryByText(/Минимум 2 символа/);
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

      it('должен автоматически удалять пробелы в начале и конце (trim)', async () => {
        const user = userEvent.setup();
        
        // Мок успешного ответа от API
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });
        
        render(<DeliveryForm prizeId={1} />);
        
        const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
        const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
        const countryInput = screen.getByRole('textbox', { name: /Страна/ });
        const postalCodeInput = screen.getByRole('textbox', { name: /Почтовый индекс/ });
        const cityInput = screen.getByRole('textbox', { name: /Город/ });
        const streetInput = screen.getByRole('textbox', { name: /Улица/ });
        const houseInput = screen.getByRole('textbox', { name: /Дом/ });
        const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
        const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
        
        // Заполняем поля (с пробелами в начале и конце)
        await user.type(lastNameInput, 'Иванов');
        await user.type(firstNameInput, 'Иван');
        await user.type(countryInput, '  Россия  ');
        await user.type(postalCodeInput, '123456');
        await user.type(cityInput, 'Москва');
        await user.type(streetInput, 'Ленина');
        await user.type(houseInput, '10');
        await user.type(phoneInput, '+79991234567');
        
        // Отправляем форму
        await user.click(submitButton);
        
        // Проверяем, что fetch был вызван с обрезанным значением
        await waitFor(() => {
          expect(global.fetch).toHaveBeenCalledWith(
            '/api/delivery',
            expect.objectContaining({
              method: 'POST',
              body: expect.stringContaining('"country":"Россия"'),
            })
          );
        });
      });

      it('должен показывать ошибку при пустом поле "Страна"', async () => {
        const user = userEvent.setup();
        render(<DeliveryForm prizeId={1} />);
        
        const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
        const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
        const postalCodeInput = screen.getByRole('textbox', { name: /Почтовый индекс/ });
        const cityInput = screen.getByRole('textbox', { name: /Город/ });
        const streetInput = screen.getByRole('textbox', { name: /Улица/ });
        const houseInput = screen.getByRole('textbox', { name: /Дом/ });
        const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
        const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
        
        // Заполняем поля (пропускаем country)
        await user.type(lastNameInput, 'Иванов');
        await user.type(firstNameInput, 'Иван');
        await user.type(postalCodeInput, '123456');
        await user.type(cityInput, 'Москва');
        await user.type(streetInput, 'Ленина');
        await user.type(houseInput, '10');
        await user.type(phoneInput, '+79991234567');
        
        // Отправляем форму
        await user.click(submitButton);
        
        // Проверяем, что появилась ошибка валидации
        await waitFor(() => {
          const errorMessage = screen.getByText(/Минимум 2 символа/);
          expect(errorMessage).toBeInTheDocument();
        });
        
        // Проверяем, что fetch не был вызван
        expect(global.fetch).not.toHaveBeenCalled();
      });
    });

    /**
     * Тесты для поля "Почтовый индекс" (postal_code)
     */
    describe('Валидация поля "Почтовый индекс"', () => {
      it('должен показывать ошибку при слишком коротком индексе (< 3 символов)', async () => {
        const user = userEvent.setup();
        render(<DeliveryForm prizeId={1} />);
        
        const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
        const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
        const countryInput = screen.getByRole('textbox', { name: /Страна/ });
        const postalCodeInput = screen.getByRole('textbox', { name: /Почтовый индекс/ });
        const cityInput = screen.getByRole('textbox', { name: /Город/ });
        const streetInput = screen.getByRole('textbox', { name: /Улица/ });
        const houseInput = screen.getByRole('textbox', { name: /Дом/ });
        const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
        const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
        
        // Заполняем поля
        await user.type(lastNameInput, 'Иванов');
        await user.type(firstNameInput, 'Иван');
        await user.type(countryInput, 'Россия');
        await user.type(postalCodeInput, '12'); // Слишком короткое значение
        await user.type(cityInput, 'Москва');
        await user.type(streetInput, 'Ленина');
        await user.type(houseInput, '10');
        await user.type(phoneInput, '+79991234567');
        
        // Отправляем форму
        await user.click(submitButton);
        
        // Проверяем, что появилась ошибка валидации
        await waitFor(() => {
          const errorMessage = screen.getByText(/Минимум 3 символа/);
          expect(errorMessage).toBeInTheDocument();
        });
        
        // Проверяем, что fetch не был вызван
        expect(global.fetch).not.toHaveBeenCalled();
      });

      it('должен показывать ошибку при слишком длинном индексе (> 20 символов)', async () => {
        const user = userEvent.setup();
        render(<DeliveryForm prizeId={1} />);
        
        const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
        const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
        const countryInput = screen.getByRole('textbox', { name: /Страна/ });
        const postalCodeInput = screen.getByRole('textbox', { name: /Почтовый индекс/ });
        const cityInput = screen.getByRole('textbox', { name: /Город/ });
        const streetInput = screen.getByRole('textbox', { name: /Улица/ });
        const houseInput = screen.getByRole('textbox', { name: /Дом/ });
        const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
        const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
        
        // Создаем строку длиной 21 символ
        const longPostalCode = '1'.repeat(21);
        
        // Заполняем поля
        await user.type(lastNameInput, 'Иванов');
        await user.type(firstNameInput, 'Иван');
        await user.type(countryInput, 'Россия');
        await user.type(postalCodeInput, longPostalCode);
        await user.type(cityInput, 'Москва');
        await user.type(streetInput, 'Ленина');
        await user.type(houseInput, '10');
        await user.type(phoneInput, '+79991234567');
        
        // Отправляем форму
        await user.click(submitButton);
        
        // Проверяем, что появилась ошибка валидации
        await waitFor(() => {
          const errorMessage = screen.getByText(/Максимум 20 символов/);
          expect(errorMessage).toBeInTheDocument();
        });
        
        // Проверяем, что fetch не был вызван
        expect(global.fetch).not.toHaveBeenCalled();
      });

      it('должен принимать валидный почтовый индекс (3-20 символов)', async () => {
        const user = userEvent.setup();
        
        // Мок успешного ответа от API
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });
        
        render(<DeliveryForm prizeId={1} />);
        
        const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
        const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
        const countryInput = screen.getByRole('textbox', { name: /Страна/ });
        const postalCodeInput = screen.getByRole('textbox', { name: /Почтовый индекс/ });
        const cityInput = screen.getByRole('textbox', { name: /Город/ });
        const streetInput = screen.getByRole('textbox', { name: /Улица/ });
        const houseInput = screen.getByRole('textbox', { name: /Дом/ });
        const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
        const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
        
        // Заполняем поля
        await user.type(lastNameInput, 'Иванов');
        await user.type(firstNameInput, 'Иван');
        await user.type(countryInput, 'Россия');
        await user.type(postalCodeInput, '123456');
        await user.type(cityInput, 'Москва');
        await user.type(streetInput, 'Ленина');
        await user.type(houseInput, '10');
        await user.type(phoneInput, '+79991234567');
        
        // Отправляем форму
        await user.click(submitButton);
        
        // Проверяем, что ошибки валидации нет
        await waitFor(() => {
          const errorMessage = screen.queryByText(/Минимум 3 символа/);
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

      it('должен автоматически удалять пробелы в начале и конце (trim)', async () => {
        const user = userEvent.setup();
        
        // Мок успешного ответа от API
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });
        
        render(<DeliveryForm prizeId={1} />);
        
        const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
        const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
        const countryInput = screen.getByRole('textbox', { name: /Страна/ });
        const postalCodeInput = screen.getByRole('textbox', { name: /Почтовый индекс/ });
        const cityInput = screen.getByRole('textbox', { name: /Город/ });
        const streetInput = screen.getByRole('textbox', { name: /Улица/ });
        const houseInput = screen.getByRole('textbox', { name: /Дом/ });
        const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
        const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
        
        // Заполняем поля (с пробелами в начале и конце)
        await user.type(lastNameInput, 'Иванов');
        await user.type(firstNameInput, 'Иван');
        await user.type(countryInput, 'Россия');
        await user.type(postalCodeInput, '  123456  ');
        await user.type(cityInput, 'Москва');
        await user.type(streetInput, 'Ленина');
        await user.type(houseInput, '10');
        await user.type(phoneInput, '+79991234567');
        
        // Отправляем форму
        await user.click(submitButton);
        
        // Проверяем, что fetch был вызван с обрезанным значением
        await waitFor(() => {
          expect(global.fetch).toHaveBeenCalledWith(
            '/api/delivery',
            expect.objectContaining({
              method: 'POST',
              body: expect.stringContaining('"postal_code":"123456"'),
            })
          );
        });
      });

      it('должен показывать ошибку при пустом поле "Почтовый индекс"', async () => {
        const user = userEvent.setup();
        render(<DeliveryForm prizeId={1} />);
        
        const lastNameInput = screen.getByRole('textbox', { name: /Фамилия/ });
        const firstNameInput = screen.getByRole('textbox', { name: /^Имя/ });
        const countryInput = screen.getByRole('textbox', { name: /Страна/ });
        const cityInput = screen.getByRole('textbox', { name: /Город/ });
        const streetInput = screen.getByRole('textbox', { name: /Улица/ });
        const houseInput = screen.getByRole('textbox', { name: /Дом/ });
        const phoneInput = screen.getByRole('textbox', { name: /Номер телефона/ });
        const submitButton = screen.getByRole('button', { name: /Отправить данные/ });
        
        // Заполняем поля (пропускаем postal_code)
        await user.type(lastNameInput, 'Иванов');
        await user.type(firstNameInput, 'Иван');
        await user.type(countryInput, 'Россия');
        await user.type(cityInput, 'Москва');
        await user.type(streetInput, 'Ленина');
        await user.type(houseInput, '10');
        await user.type(phoneInput, '+79991234567');
        
        // Отправляем форму
        await user.click(submitButton);
        
        // Проверяем, что появилась ошибка валидации
        await waitFor(() => {
          const errorMessage = screen.getByText(/Минимум 3 символа/);
          expect(errorMessage).toBeInTheDocument();
        });
        
        // Проверяем, что fetch не был вызван
        expect(global.fetch).not.toHaveBeenCalled();
      });
    });
  });
});
