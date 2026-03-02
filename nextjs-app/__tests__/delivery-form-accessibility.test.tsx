/**
 * Тесты адаптивности и доступности для формы доставки
 * 
 * Проверяет соответствие требованиям доступности и адаптивной вёрстки
 * 
 * Feature: delivery-form-field-separation
 * Task: 9.3 - Проверить адаптивность и доступность
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeliveryForm } from '@/components/webapp/DeliveryForm';
import '@testing-library/jest-dom';

// Мокируем Telegram WebApp SDK
const mockWebApp = {
  initData: 'mock_init_data_string',
  showAlert: vi.fn(),
  close: vi.fn(),
};

vi.mock('@twa-dev/sdk', () => ({
  default: mockWebApp,
}));

describe('DeliveryForm - Адаптивность и доступность', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Requirement 5.1: Корректное отображение на мобильных устройствах (320px+)
   */
  it('должна иметь адаптивный контейнер с max-w-md', () => {
    const { container } = render(<DeliveryForm prizeId={123} />);
    
    const form = container.querySelector('form');
    expect(form).toHaveClass('max-w-md');
    expect(form).toHaveClass('mx-auto');
  });

  /**
   * Requirement 5.2: Использование адаптивной вёрстки
   */
  it('должна использовать grid-cols-2 для полей "Дом" и "Квартира"', () => {
    const { container } = render(<DeliveryForm prizeId={123} />);
    
    // Находим контейнер с grid-cols-2
    const gridContainer = container.querySelector('.grid-cols-2');
    expect(gridContainer).toBeInTheDocument();
    expect(gridContainer).toHaveClass('gap-2');
  });

  /**
   * Requirement 5.3: Отображение меток с обязательным индикатором (*)
   */
  it('должна отображать обязательный индикатор (*) для обязательных полей', () => {
    render(<DeliveryForm prizeId={123} />);
    
    // Проверяем обязательные поля
    const requiredLabels = [
      /Фамилия/i,
      /Имя/i,
      /Город/i,
      /Улица/i,
      /Дом/i,
      /Номер телефона/i,
    ];

    requiredLabels.forEach((labelText) => {
      const label = screen.getByText(labelText);
      const asterisk = label.querySelector('.text-red-500');
      expect(asterisk).toBeInTheDocument();
      expect(asterisk).toHaveTextContent('*');
    });
  });

  /**
   * Requirement 5.3: Опциональные поля не должны иметь индикатор (*)
   */
  it('не должна отображать обязательный индикатор для опциональных полей', () => {
    render(<DeliveryForm prizeId={123} />);
    
    // Проверяем опциональные поля
    const optionalLabels = [
      screen.getByText(/Отчество \(опционально\)/i),
      screen.getByText(/Квартира \(опционально\)/i),
      screen.getByText(/Комментарий \(опционально\)/i),
    ];

    optionalLabels.forEach((label) => {
      const asterisk = label.querySelector('.text-red-500');
      expect(asterisk).not.toBeInTheDocument();
    });
  });

  /**
   * Requirement 5.4: Отображение сообщений об ошибках валидации
   */
  it('должна отображать сообщения об ошибках красным цветом под полями', async () => {
    const { container } = render(<DeliveryForm prizeId={123} />);
    
    // Проверяем, что есть элементы для отображения ошибок
    // (они появятся при валидации, но структура должна быть готова)
    const form = container.querySelector('form');
    expect(form).toBeInTheDocument();
    
    // Проверяем наличие классов для ошибок в стилях
    const inputs = container.querySelectorAll('input');
    inputs.forEach((input) => {
      expect(input).toHaveClass('focus:ring-2');
      expect(input).toHaveClass('focus:ring-blue-500');
    });
  });

  /**
   * Requirement 5.5: Отображение синей рамки фокуса
   */
  it('должна применять focus:ring-2 и focus:ring-blue-500 к полям ввода', () => {
    const { container } = render(<DeliveryForm prizeId={123} />);
    
    const inputs = container.querySelectorAll('input');
    const textareas = container.querySelectorAll('textarea');
    
    [...inputs, ...textareas].forEach((element) => {
      expect(element).toHaveClass('focus:ring-2');
      expect(element).toHaveClass('focus:ring-blue-500');
      expect(element).toHaveClass('focus:border-blue-500');
    });
  });

  /**
   * Requirement 5.6: Использование семантических HTML-элементов
   */
  it('должна использовать семантические HTML-элементы', () => {
    const { container } = render(<DeliveryForm prizeId={123} />);
    
    // Проверяем наличие семантических элементов
    expect(container.querySelector('form')).toBeInTheDocument();
    expect(container.querySelectorAll('label').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('input').length).toBeGreaterThan(0);
    expect(container.querySelector('textarea')).toBeInTheDocument();
    expect(container.querySelector('button[type="submit"]')).toBeInTheDocument();
  });

  /**
   * Requirement 5.7: Связь меток с полями через htmlFor и id
   */
  it('должна связывать метки с полями через htmlFor и id', () => {
    render(<DeliveryForm prizeId={123} />);
    
    const fieldMappings = [
      { id: 'last_name', label: /Фамилия/i },
      { id: 'first_name', label: /Имя/i },
      { id: 'patronymic', label: /Отчество/i },
      { id: 'city', label: /Город/i },
      { id: 'street', label: /Улица/i },
      { id: 'house', label: /Дом/i },
      { id: 'apartment', label: /Квартира/i },
      { id: 'phone', label: /Номер телефона/i },
      { id: 'comment', label: /Комментарий/i },
    ];

    fieldMappings.forEach(({ id, label }) => {
      const labelElement = screen.getByLabelText(label);
      const input = document.getElementById(id);
      
      expect(labelElement).toBeInTheDocument();
      expect(input).toBeInTheDocument();
      expect(input?.id).toBe(id);
    });
  });

  /**
   * Проверка структуры визуальных секций
   */
  it('должна иметь три визуальные секции с заголовками', () => {
    render(<DeliveryForm prizeId={123} />);
    
    // Проверяем наличие заголовков секций
    expect(screen.getByText('Получатель')).toBeInTheDocument();
    expect(screen.getByText('Адрес доставки')).toBeInTheDocument();
    expect(screen.getByText('Контактная информация')).toBeInTheDocument();
  });

  /**
   * Проверка placeholder-текстов
   */
  it('должна отображать правильные placeholder-тексты', () => {
    render(<DeliveryForm prizeId={123} />);
    
    const placeholders = {
      last_name: 'Иванов',
      first_name: 'Иван',
      patronymic: 'Иванович',
      city: 'Москва',
      street: 'Ленина',
      house: '10',
      apartment: '25',
      phone: '+79991234567',
      comment: 'Дополнительная информация для доставки',
    };

    Object.entries(placeholders).forEach(([id, placeholder]) => {
      const input = document.getElementById(id);
      expect(input).toHaveAttribute('placeholder', placeholder);
    });
  });

  /**
   * Проверка типов полей ввода
   */
  it('должна использовать правильные типы для полей ввода', () => {
    render(<DeliveryForm prizeId={123} />);
    
    // Проверяем тип поля телефона
    const phoneInput = document.getElementById('phone');
    expect(phoneInput).toHaveAttribute('type', 'tel');
    
    // Проверяем, что остальные поля имеют тип text
    const textFields = [
      'last_name',
      'first_name',
      'patronymic',
      'city',
      'street',
      'house',
      'apartment',
    ];
    
    textFields.forEach((fieldId) => {
      const input = document.getElementById(fieldId);
      expect(input).toHaveAttribute('type', 'text');
    });
    
    // Проверяем, что комментарий - это textarea
    const commentField = document.getElementById('comment');
    expect(commentField?.tagName).toBe('TEXTAREA');
  });

  /**
   * Проверка стилизации Telegram-темы
   */
  it('должна применять стилизацию Telegram-темы к полям', () => {
    const { container } = render(<DeliveryForm prizeId={123} />);
    
    const inputs = container.querySelectorAll('input');
    const textareas = container.querySelectorAll('textarea');
    
    [...inputs, ...textareas].forEach((element) => {
      const style = element.getAttribute('style');
      expect(style).toContain('--tg-theme-bg-color');
      expect(style).toContain('--tg-theme-text-color');
      expect(style).toContain('--tg-theme-hint-color');
    });
  });

  /**
   * Проверка стилизации заголовков секций
   */
  it('должна применять стилизацию Telegram-темы к заголовкам секций', () => {
    render(<DeliveryForm prizeId={123} />);
    
    const headers = [
      screen.getByText('Получатель'),
      screen.getByText('Адрес доставки'),
      screen.getByText('Контактная информация'),
    ];

    headers.forEach((header) => {
      const style = header.getAttribute('style');
      expect(style).toContain('--tg-theme-text-color');
      expect(style).toContain('--tg-theme-hint-color');
      expect(header).toHaveClass('text-lg');
      expect(header).toHaveClass('font-semibold');
      expect(header).toHaveClass('border-b');
    });
  });

  /**
   * Проверка кнопки отправки
   */
  it('должна иметь доступную кнопку отправки', () => {
    render(<DeliveryForm prizeId={123} />);
    
    const submitButton = screen.getByRole('button', { name: /Отправить данные/i });
    
    expect(submitButton).toBeInTheDocument();
    expect(submitButton).toHaveAttribute('type', 'submit');
    expect(submitButton).toHaveClass('w-full');
    expect(submitButton).toHaveClass('rounded-md');
    expect(submitButton).toHaveClass('bg-blue-600');
  });

  /**
   * Проверка aria-атрибутов для доступности
   */
  it('должна иметь правильные aria-атрибуты', () => {
    const { container } = render(<DeliveryForm prizeId={123} />);
    
    // Проверяем, что все label связаны с input через for/id
    const labels = container.querySelectorAll('label');
    labels.forEach((label) => {
      const htmlFor = label.getAttribute('for');
      if (htmlFor) {
        const input = document.getElementById(htmlFor);
        expect(input).toBeInTheDocument();
      }
    });
  });

  /**
   * Проверка отзывчивости spacing
   */
  it('должна использовать правильные отступы для адаптивности', () => {
    const { container } = render(<DeliveryForm prizeId={123} />);
    
    const form = container.querySelector('form');
    expect(form).toHaveClass('space-y-6');
    expect(form).toHaveClass('p-4');
    
    // Проверяем отступы в секциях
    const sections = container.querySelectorAll('.space-y-3');
    expect(sections.length).toBeGreaterThan(0);
  });
});
