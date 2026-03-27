/**
 * Утилита форматирования данных доставки для отображения в модальном окне подтверждения
 */

import { DeliveryData } from '@/types/delivery';

/**
 * Интерфейс для форматированного поля данных
 */
export interface FormattedField {
  label: string;
  value: string;
}

/**
 * Интерфейс для секции форматированных данных
 */
export interface FormattedSection {
  label: string;
  fields: FormattedField[];
}

/**
 * Интерфейс для полностью форматированных данных доставки
 */
export interface FormattedDeliveryData {
  recipient: FormattedSection;
  address: FormattedSection;
  contacts: FormattedSection;
}

/**
 * Форматирует данные доставки для отображения в модальном окне подтверждения.
 * Группирует данные по категориям (Получатель, Адрес, Контакты) и добавляет
 * читаемые подписи на русском языке.
 * 
 * @param data - Данные доставки для форматирования
 * @returns Форматированные данные, сгруппированные по секциям
 */
export function formatDeliveryData(data: DeliveryData): FormattedDeliveryData {
  // Секция "Получатель"
  const recipientFields: FormattedField[] = [
    { label: 'Фамилия', value: data.last_name },
    { label: 'Имя', value: data.first_name },
  ];

  // Добавляем отчество только если оно заполнено
  if (data.patronymic) {
    recipientFields.push({ label: 'Отчество', value: data.patronymic });
  }

  // Секция "Адрес"
  const addressFields: FormattedField[] = [
    { label: 'Страна', value: data.country },
    { label: 'Почтовый индекс', value: data.postal_code },
    { label: 'Город', value: data.city },
    { label: 'Улица', value: data.street },
    { label: 'Дом', value: data.house },
  ];

  // Добавляем квартиру только если она заполнена
  if (data.apartment) {
    addressFields.push({ label: 'Квартира', value: data.apartment });
  }

  // Секция "Контакты"
  const contactsFields: FormattedField[] = [
    { label: 'Телефон', value: data.phone },
  ];

  // Добавляем комментарий только если он заполнен
  if (data.comment) {
    contactsFields.push({ label: 'Комментарий', value: data.comment });
  }

  return {
    recipient: {
      label: 'Получатель',
      fields: recipientFields,
    },
    address: {
      label: 'Адрес',
      fields: addressFields,
    },
    contacts: {
      label: 'Контакты',
      fields: contactsFields,
    },
  };
}
