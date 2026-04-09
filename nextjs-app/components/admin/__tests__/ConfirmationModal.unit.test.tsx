/**
 * Unit тесты для ConfirmationModal
 * Проверяют отображение и поведение модального окна подтверждения
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { ConfirmationModal } from '../ConfirmationModal';

describe('ConfirmationModal', () => {
  /**
   * Тест: модальное окно не отображается, когда isOpen = false
   */
  test('не отображается, когда isOpen = false', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmationModal
        isOpen={false}
        title="Тест"
        message="Тестовое сообщение"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.queryByText('Тест')).not.toBeInTheDocument();
  });

  /**
   * Тест: модальное окно отображается, когда isOpen = true
   */
  test('отображается, когда isOpen = true', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmationModal
        isOpen={true}
        title="Тест"
        message="Тестовое сообщение"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText('Тест')).toBeInTheDocument();
    expect(screen.getByText('Тестовое сообщение')).toBeInTheDocument();
  });

  /**
   * Тест: отображает кнопки "Да" и "Нет" по умолчанию
   */
  test('отображает кнопки "Да" и "Нет" по умолчанию', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmationModal
        isOpen={true}
        title="Тест"
        message="Тестовое сообщение"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText('Да')).toBeInTheDocument();
    expect(screen.getByText('Нет')).toBeInTheDocument();
  });

  /**
   * Тест: отображает кастомные тексты кнопок
   */
  test('отображает кастомные тексты кнопок', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmationModal
        isOpen={true}
        title="Тест"
        message="Тестовое сообщение"
        confirmText="Подтвердить"
        cancelText="Отменить"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText('Подтвердить')).toBeInTheDocument();
    expect(screen.getByText('Отменить')).toBeInTheDocument();
  });

  /**
   * Тест: вызывает onConfirm при клике на кнопку "Да"
   */
  test('вызывает onConfirm при клике на кнопку "Да"', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmationModal
        isOpen={true}
        title="Тест"
        message="Тестовое сообщение"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const confirmButton = screen.getByText('Да');
    fireEvent.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  /**
   * Тест: вызывает onCancel при клике на кнопку "Нет"
   */
  test('вызывает onCancel при клике на кнопку "Нет"', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmationModal
        isOpen={true}
        title="Тест"
        message="Тестовое сообщение"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const cancelButton = screen.getByText('Нет');
    fireEvent.click(cancelButton);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  /**
   * Тест: вызывает onCancel при клике на фон (backdrop)
   */
  test('вызывает onCancel при клике на фон', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    const { container } = render(
      <ConfirmationModal
        isOpen={true}
        title="Тест"
        message="Тестовое сообщение"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    // Кликаем на backdrop (первый div с fixed)
    const backdrop = container.querySelector('.fixed');
    if (backdrop) {
      fireEvent.click(backdrop);
    }

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  /**
   * Тест: НЕ вызывает onCancel при клике на содержимое модального окна
   */
  test('НЕ вызывает onCancel при клике на содержимое модального окна', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmationModal
        isOpen={true}
        title="Тест"
        message="Тестовое сообщение"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const title = screen.getByText('Тест');
    fireEvent.click(title);

    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
