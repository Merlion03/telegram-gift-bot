/**
 * Unit-тесты для компонента DeliveryDataDisplay
 * 
 * Тестируемый компонент:
 * - DeliveryDataDisplay - компонент для форматированного отображения данных доставки
 * 
 * Validates: Requirements 2.1, 2.11
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DeliveryDataDisplay } from '@/components/webapp/DeliveryDataDisplay';
import type { DeliveryData } from '@/types/delivery';

describe('Unit-тесты для DeliveryDataDisplay', () => {
  describe('Рендеринг всех обязательных полей', () => {
    it('должен отобразить все обязательные поля получателя', () => {
      const data: DeliveryData = {
        last_name: 'Иванов',
        first_name: 'Иван',
        country: 'Россия',
        postal_code: '123456',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
      };

      render(<DeliveryDataDisplay data={data} />);

      // Проверка заголовка секции
      expect(screen.getByText('Получатель')).toBeInTheDocument();

      // Проверка обязательных полей получателя
      expect(screen.getByText('Фамилия:')).toBeInTheDocument();
      expect(screen.getByText('Иванов')).toBeInTheDocument();
      expect(screen.getByText('Имя:')).toBeInTheDocument();
      expect(screen.getByText('Иван')).toBeInTheDocument();
    });

    it('должен отобразить все обязательные поля адреса', () => {
      const data: DeliveryData = {
        last_name: 'Петров',
        first_name: 'Петр',
        country: 'Россия',
        postal_code: '654321',
        city: 'Санкт-Петербург',
        street: 'Невский проспект',
        house: '1',
        phone: '+79997654321',
      };

      render(<DeliveryDataDisplay data={data} />);

      // Проверка заголовка секции
      expect(screen.getByText('Адрес')).toBeInTheDocument();

      // Проверка обязательных полей адреса
      expect(screen.getByText('Страна:')).toBeInTheDocument();
      expect(screen.getByText('Россия')).toBeInTheDocument();
      expect(screen.getByText('Почтовый индекс:')).toBeInTheDocument();
      expect(screen.getByText('654321')).toBeInTheDocument();
      expect(screen.getByText('Город:')).toBeInTheDocument();
      expect(screen.getByText('Санкт-Петербург')).toBeInTheDocument();
      expect(screen.getByText('Улица:')).toBeInTheDocument();
      expect(screen.getByText('Невский проспект')).toBeInTheDocument();
      expect(screen.getByText('Дом:')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('должен отобразить все обязательные поля контактов', () => {
      const data: DeliveryData = {
        last_name: 'Сидоров',
        first_name: 'Сидор',
        country: 'Россия',
        postal_code: '111222',
        city: 'Казань',
        street: 'Баумана',
        house: '5',
        phone: '+79995551122',
      };

      render(<DeliveryDataDisplay data={data} />);

      // Проверка заголовка секции
      expect(screen.getByText('Контакты')).toBeInTheDocument();

      // Проверка обязательных полей контактов
      expect(screen.getByText('Телефон:')).toBeInTheDocument();
      expect(screen.getByText('+79995551122')).toBeInTheDocument();
    });

    it('должен отобразить все обязательные поля во всех секциях', () => {
      const data: DeliveryData = {
        last_name: 'Алексеев',
        first_name: 'Алексей',
        country: 'Россия',
        postal_code: '333444',
        city: 'Новосибирск',
        street: 'Красный проспект',
        house: '20',
        phone: '+79993334455',
      };

      render(<DeliveryDataDisplay data={data} />);

      // Проверка всех трёх секций
      expect(screen.getByText('Получатель')).toBeInTheDocument();
      expect(screen.getByText('Адрес')).toBeInTheDocument();
      expect(screen.getByText('Контакты')).toBeInTheDocument();

      // Проверка наличия всех обязательных полей
      expect(screen.getByText('Фамилия:')).toBeInTheDocument();
      expect(screen.getByText('Имя:')).toBeInTheDocument();
      expect(screen.getByText('Страна:')).toBeInTheDocument();
      expect(screen.getByText('Почтовый индекс:')).toBeInTheDocument();
      expect(screen.getByText('Город:')).toBeInTheDocument();
      expect(screen.getByText('Улица:')).toBeInTheDocument();
      expect(screen.getByText('Дом:')).toBeInTheDocument();
      expect(screen.getByText('Телефон:')).toBeInTheDocument();
    });
  });

  describe('Корректная обработка опциональных полей', () => {
    it('должен отобразить отчество, если оно заполнено', () => {
      const data: DeliveryData = {
        last_name: 'Иванов',
        first_name: 'Иван',
        patronymic: 'Иванович',
        country: 'Россия',
        postal_code: '123456',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
      };

      render(<DeliveryDataDisplay data={data} />);

      expect(screen.getByText('Отчество:')).toBeInTheDocument();
      expect(screen.getByText('Иванович')).toBeInTheDocument();
    });

    it('должен НЕ отображать отчество, если оно не заполнено', () => {
      const data: DeliveryData = {
        last_name: 'Петров',
        first_name: 'Петр',
        country: 'Россия',
        postal_code: '654321',
        city: 'Санкт-Петербург',
        street: 'Невский проспект',
        house: '1',
        phone: '+79997654321',
      };

      render(<DeliveryDataDisplay data={data} />);

      expect(screen.queryByText('Отчество:')).not.toBeInTheDocument();
    });

    it('должен отобразить квартиру, если она заполнена', () => {
      const data: DeliveryData = {
        last_name: 'Сидоров',
        first_name: 'Сидор',
        country: 'Россия',
        postal_code: '111222',
        city: 'Казань',
        street: 'Баумана',
        house: '5',
        apartment: '25',
        phone: '+79995551122',
      };

      render(<DeliveryDataDisplay data={data} />);

      expect(screen.getByText('Квартира:')).toBeInTheDocument();
      expect(screen.getByText('25')).toBeInTheDocument();
    });

    it('должен НЕ отображать квартиру, если она не заполнена', () => {
      const data: DeliveryData = {
        last_name: 'Алексеев',
        first_name: 'Алексей',
        country: 'Россия',
        postal_code: '333444',
        city: 'Новосибирск',
        street: 'Красный проспект',
        house: '20',
        phone: '+79993334455',
      };

      render(<DeliveryDataDisplay data={data} />);

      expect(screen.queryByText('Квартира:')).not.toBeInTheDocument();
    });

    it('должен отобразить комментарий, если он заполнен', () => {
      const data: DeliveryData = {
        last_name: 'Михайлов',
        first_name: 'Михаил',
        country: 'Россия',
        postal_code: '555666',
        city: 'Екатеринбург',
        street: 'Ленина',
        house: '15',
        phone: '+79995556677',
        comment: 'Позвонить за час до доставки',
      };

      render(<DeliveryDataDisplay data={data} />);

      expect(screen.getByText('Комментарий:')).toBeInTheDocument();
      expect(screen.getByText('Позвонить за час до доставки')).toBeInTheDocument();
    });

    it('должен НЕ отображать комментарий, если он не заполнен', () => {
      const data: DeliveryData = {
        last_name: 'Николаев',
        first_name: 'Николай',
        country: 'Россия',
        postal_code: '777888',
        city: 'Владивосток',
        street: 'Океанская',
        house: '50',
        phone: '+79997778899',
      };

      render(<DeliveryDataDisplay data={data} />);

      expect(screen.queryByText('Комментарий:')).not.toBeInTheDocument();
    });

    it('должен корректно отобразить все опциональные поля, если они заполнены', () => {
      const data: DeliveryData = {
        last_name: 'Полный',
        first_name: 'Полное',
        patronymic: 'Полнович',
        country: 'Россия',
        postal_code: '999000',
        city: 'Хабаровск',
        street: 'Амурская',
        house: '100',
        apartment: '200',
        phone: '+79999990000',
        comment: 'Тестовый комментарий',
      };

      render(<DeliveryDataDisplay data={data} />);

      // Проверка всех опциональных полей
      expect(screen.getByText('Отчество:')).toBeInTheDocument();
      expect(screen.getByText('Полнович')).toBeInTheDocument();
      expect(screen.getByText('Квартира:')).toBeInTheDocument();
      expect(screen.getByText('200')).toBeInTheDocument();
      expect(screen.getByText('Комментарий:')).toBeInTheDocument();
      expect(screen.getByText('Тестовый комментарий')).toBeInTheDocument();
    });

    it('должен корректно НЕ отображать опциональные поля, если они не заполнены', () => {
      const data: DeliveryData = {
        last_name: 'Минимов',
        first_name: 'Минимал',
        country: 'Россия',
        postal_code: '111000',
        city: 'Краснодар',
        street: 'Красная',
        house: '1',
        phone: '+79991110000',
      };

      render(<DeliveryDataDisplay data={data} />);

      // Проверка отсутствия всех опциональных полей
      expect(screen.queryByText('Отчество:')).not.toBeInTheDocument();
      expect(screen.queryByText('Квартира:')).not.toBeInTheDocument();
      expect(screen.queryByText('Комментарий:')).not.toBeInTheDocument();
    });
  });

  describe('Правильное форматирование данных', () => {
    it('должен корректно форматировать данные с использованием formatDeliveryData', () => {
      const data: DeliveryData = {
        last_name: 'Форматов',
        first_name: 'Формат',
        patronymic: 'Форматович',
        country: 'Россия',
        postal_code: '222333',
        city: 'Ростов-на-Дону',
        street: 'Большая Садовая',
        house: '10А',
        apartment: '5Б',
        phone: '+79992223344',
        comment: 'Домофон не работает',
      };

      render(<DeliveryDataDisplay data={data} />);

      // Проверка, что данные отображаются в правильном формате
      // Каждое поле должно иметь подпись и значение
      const labels = screen.getAllByText(/:$/);
      expect(labels.length).toBeGreaterThan(0);

      // Проверка конкретных значений
      expect(screen.getByText('Форматов')).toBeInTheDocument();
      expect(screen.getByText('Формат')).toBeInTheDocument();
      expect(screen.getByText('Форматович')).toBeInTheDocument();
      expect(screen.getByText('Ростов-на-Дону')).toBeInTheDocument();
      expect(screen.getByText('10А')).toBeInTheDocument();
      expect(screen.getByText('5Б')).toBeInTheDocument();
    });

    it('должен корректно отображать специальные символы', () => {
      const data: DeliveryData = {
        last_name: 'О\'Коннор',
        first_name: 'Мария-Анна',
        country: 'Россия',
        postal_code: '123-456',
        city: 'Санкт-Петербург',
        street: 'Большая Морская',
        house: '10/12',
        apartment: '5А',
        phone: '+7 (999) 123-45-67',
        comment: 'Домофон: #123*',
      };

      render(<DeliveryDataDisplay data={data} />);

      expect(screen.getByText('О\'Коннор')).toBeInTheDocument();
      expect(screen.getByText('Мария-Анна')).toBeInTheDocument();
      expect(screen.getByText('123-456')).toBeInTheDocument();
      expect(screen.getByText('10/12')).toBeInTheDocument();
      expect(screen.getByText('5А')).toBeInTheDocument();
      expect(screen.getByText('+7 (999) 123-45-67')).toBeInTheDocument();
      expect(screen.getByText('Домофон: #123*')).toBeInTheDocument();
    });

    it('должен корректно отображать длинные значения', () => {
      const longComment = 'Очень длинный комментарий с подробными инструкциями по доставке';
      const data: DeliveryData = {
        last_name: 'Длинный',
        first_name: 'Длинное',
        country: 'Российская Федерация',
        postal_code: '123456',
        city: 'Город с длинным названием',
        street: 'Улица с очень длинным названием',
        house: '123',
        phone: '+79991234567',
        comment: longComment,
      };

      render(<DeliveryDataDisplay data={data} />);

      expect(screen.getByText('Российская Федерация')).toBeInTheDocument();
      expect(screen.getByText('Город с длинным названием')).toBeInTheDocument();
      expect(screen.getByText('Улица с очень длинным названием')).toBeInTheDocument();
      expect(screen.getByText(longComment)).toBeInTheDocument();
    });
  });

  describe('Группировка по секциям', () => {
    it('должен отображать три секции: Получатель, Адрес, Контакты', () => {
      const data: DeliveryData = {
        last_name: 'Группов',
        first_name: 'Группа',
        country: 'Россия',
        postal_code: '444555',
        city: 'Уфа',
        street: 'Ленина',
        house: '30',
        phone: '+79994445566',
      };

      render(<DeliveryDataDisplay data={data} />);

      // Проверка наличия всех трёх заголовков секций
      expect(screen.getByText('Получатель')).toBeInTheDocument();
      expect(screen.getByText('Адрес')).toBeInTheDocument();
      expect(screen.getByText('Контакты')).toBeInTheDocument();
    });

    it('должен правильно группировать поля ФИО в секции "Получатель"', () => {
      const data: DeliveryData = {
        last_name: 'Тестов',
        first_name: 'Тест',
        patronymic: 'Тестович',
        country: 'Россия',
        postal_code: '666777',
        city: 'Омск',
        street: 'Ленина',
        house: '40',
        phone: '+79996667788',
      };

      const { container } = render(<DeliveryDataDisplay data={data} />);

      // Находим секцию "Получатель"
      const recipientSection = Array.from(container.querySelectorAll('h4')).find(
        (h4) => h4.textContent === 'Получатель'
      );
      expect(recipientSection).toBeInTheDocument();

      // Проверка, что поля ФИО находятся в этой секции
      expect(screen.getByText('Фамилия:')).toBeInTheDocument();
      expect(screen.getByText('Имя:')).toBeInTheDocument();
      expect(screen.getByText('Отчество:')).toBeInTheDocument();
    });

    it('должен правильно группировать адресные поля в секции "Адрес"', () => {
      const data: DeliveryData = {
        last_name: 'Адресов',
        first_name: 'Адрес',
        country: 'Россия',
        postal_code: '888999',
        city: 'Челябинск',
        street: 'Кирова',
        house: '50',
        apartment: '100',
        phone: '+79998889900',
      };

      const { container } = render(<DeliveryDataDisplay data={data} />);

      // Находим секцию "Адрес"
      const addressSection = Array.from(container.querySelectorAll('h4')).find(
        (h4) => h4.textContent === 'Адрес'
      );
      expect(addressSection).toBeInTheDocument();

      // Проверка, что адресные поля находятся в этой секции
      expect(screen.getByText('Страна:')).toBeInTheDocument();
      expect(screen.getByText('Почтовый индекс:')).toBeInTheDocument();
      expect(screen.getByText('Город:')).toBeInTheDocument();
      expect(screen.getByText('Улица:')).toBeInTheDocument();
      expect(screen.getByText('Дом:')).toBeInTheDocument();
      expect(screen.getByText('Квартира:')).toBeInTheDocument();
    });

    it('должен правильно группировать контактные поля в секции "Контакты"', () => {
      const data: DeliveryData = {
        last_name: 'Контактов',
        first_name: 'Контакт',
        country: 'Россия',
        postal_code: '000111',
        city: 'Самара',
        street: 'Ленинградская',
        house: '60',
        phone: '+79990001122',
        comment: 'Тестовый комментарий',
      };

      const { container } = render(<DeliveryDataDisplay data={data} />);

      // Находим секцию "Контакты"
      const contactsSection = Array.from(container.querySelectorAll('h4')).find(
        (h4) => h4.textContent === 'Контакты'
      );
      expect(contactsSection).toBeInTheDocument();

      // Проверка, что контактные поля находятся в этой секции
      expect(screen.getByText('Телефон:')).toBeInTheDocument();
      expect(screen.getByText('Комментарий:')).toBeInTheDocument();
    });
  });

  describe('Применение Telegram темизации', () => {
    it('должен применять CSS переменные Telegram для цветов текста', () => {
      const data: DeliveryData = {
        last_name: 'Темизация',
        first_name: 'Тема',
        country: 'Россия',
        postal_code: '222444',
        city: 'Пермь',
        street: 'Ленина',
        house: '70',
        phone: '+79992224466',
      };

      const { container } = render(<DeliveryDataDisplay data={data} />);

      // Проверка, что заголовки секций используют CSS переменные Telegram
      const sectionHeaders = container.querySelectorAll('h4');
      sectionHeaders.forEach((header) => {
        const style = header.getAttribute('style');
        expect(style).toContain('var(--tg-theme-text-color');
        expect(style).toContain('var(--tg-theme-hint-color');
      });
    });

    it('должен применять CSS переменные Telegram для подписей полей', () => {
      const data: DeliveryData = {
        last_name: 'Стилизация',
        first_name: 'Стиль',
        country: 'Россия',
        postal_code: '333555',
        city: 'Воронеж',
        street: 'Ленина',
        house: '80',
        phone: '+79993335577',
      };

      const { container } = render(<DeliveryDataDisplay data={data} />);

      // Проверка, что подписи полей используют CSS переменные Telegram
      const labels = container.querySelectorAll('span.text-sm.font-medium');
      labels.forEach((label) => {
        const style = label.getAttribute('style');
        expect(style).toContain('var(--tg-theme-hint-color');
      });
    });

    it('должен применять CSS переменные Telegram для значений полей', () => {
      const data: DeliveryData = {
        last_name: 'Цветов',
        first_name: 'Цвет',
        country: 'Россия',
        postal_code: '444666',
        city: 'Волгоград',
        street: 'Ленина',
        house: '90',
        phone: '+79994446688',
      };

      const { container } = render(<DeliveryDataDisplay data={data} />);

      // Проверка, что значения полей используют CSS переменные Telegram
      const values = Array.from(container.querySelectorAll('span.text-sm')).filter(
        (span) => !span.classList.contains('font-medium')
      );
      values.forEach((value) => {
        const style = value.getAttribute('style');
        expect(style).toContain('var(--tg-theme-text-color');
      });
    });

    it('должен применять правильные Tailwind классы для отступов', () => {
      const data: DeliveryData = {
        last_name: 'Отступов',
        first_name: 'Отступ',
        country: 'Россия',
        postal_code: '555777',
        city: 'Саратов',
        street: 'Ленина',
        house: '100',
        phone: '+79995557799',
      };

      const { container } = render(<DeliveryDataDisplay data={data} />);

      // Проверка основного контейнера
      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer).toHaveClass('space-y-4');

      // Проверка секций
      const sections = container.querySelectorAll('.space-y-2');
      expect(sections.length).toBeGreaterThan(0);

      // Проверка отступов для полей
      const fieldContainers = container.querySelectorAll('.pl-2');
      expect(fieldContainers.length).toBeGreaterThan(0);
    });
  });

  describe('Дополнительные CSS классы', () => {
    it('должен применять дополнительный className, если он передан', () => {
      const data: DeliveryData = {
        last_name: 'Классов',
        first_name: 'Класс',
        country: 'Россия',
        postal_code: '666888',
        city: 'Тюмень',
        street: 'Ленина',
        house: '110',
        phone: '+79996668800',
      };

      const { container } = render(
        <DeliveryDataDisplay data={data} className="custom-class" />
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer).toHaveClass('custom-class');
      expect(mainContainer).toHaveClass('space-y-4');
    });

    it('должен работать без дополнительного className', () => {
      const data: DeliveryData = {
        last_name: 'Базовый',
        first_name: 'База',
        country: 'Россия',
        postal_code: '777999',
        city: 'Барнаул',
        street: 'Ленина',
        house: '120',
        phone: '+79997779911',
      };

      const { container } = render(<DeliveryDataDisplay data={data} />);

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer).toHaveClass('space-y-4');
    });
  });

  describe('Граничные случаи', () => {
    it('должен корректно отображать минимальный набор данных', () => {
      const minimalData: DeliveryData = {
        last_name: 'М',
        first_name: 'И',
        country: 'Р',
        postal_code: '123',
        city: 'Г',
        street: 'У',
        house: '1',
        phone: '+7',
      };

      render(<DeliveryDataDisplay data={minimalData} />);

      expect(screen.getByText('М')).toBeInTheDocument();
      expect(screen.getByText('И')).toBeInTheDocument();
      expect(screen.getByText('Р')).toBeInTheDocument();
      expect(screen.getByText('123')).toBeInTheDocument();
      expect(screen.getByText('Г')).toBeInTheDocument();
      expect(screen.getByText('У')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('+7')).toBeInTheDocument();
    });

    it('должен корректно отображать данные с пробелами', () => {
      const dataWithSpaces: DeliveryData = {
        last_name: 'Фамилия С Пробелами',
        first_name: 'Имя С Пробелами',
        country: 'Российская Федерация',
        postal_code: '123 456',
        city: 'Нижний Новгород',
        street: 'Большая Покровская',
        house: '10 корпус 2',
        phone: '+7 999 123 45 67',
      };

      render(<DeliveryDataDisplay data={dataWithSpaces} />);

      expect(screen.getByText('Фамилия С Пробелами')).toBeInTheDocument();
      expect(screen.getByText('Имя С Пробелами')).toBeInTheDocument();
      expect(screen.getByText('Нижний Новгород')).toBeInTheDocument();
      expect(screen.getByText('Большая Покровская')).toBeInTheDocument();
      expect(screen.getByText('10 корпус 2')).toBeInTheDocument();
    });

    it('должен корректно отображать данные с цифрами', () => {
      const dataWithNumbers: DeliveryData = {
        last_name: 'Иванов123',
        first_name: 'Иван456',
        country: 'Россия',
        postal_code: '123456',
        city: 'Москва',
        street: '1-я Тверская-Ямская',
        house: '10А',
        apartment: '25Б',
        phone: '+79991234567',
      };

      render(<DeliveryDataDisplay data={dataWithNumbers} />);

      expect(screen.getByText('Иванов123')).toBeInTheDocument();
      expect(screen.getByText('Иван456')).toBeInTheDocument();
      expect(screen.getByText('1-я Тверская-Ямская')).toBeInTheDocument();
      expect(screen.getByText('10А')).toBeInTheDocument();
      expect(screen.getByText('25Б')).toBeInTheDocument();
    });
  });
});
