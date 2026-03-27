import { fireEvent, screen } from '@testing-library/react';
import { DeliveryData } from '@/types/delivery';

/**
 * Быстрое заполнение формы доставки для тестирования
 * 
 * Использует fireEvent для прямого изменения значений полей,
 * что значительно быстрее, чем userEvent.type()
 * 
 * @param {DeliveryData} data - Данные для заполнения формы
 */
export async function fillDeliveryForm(data: DeliveryData): Promise<void> {
  const lastNameInput = screen.getByLabelText(/Фамилия/i) as HTMLInputElement;
  const firstNameInput = screen.getByLabelText(/Имя/i) as HTMLInputElement;
  const countryInput = screen.getByLabelText(/Страна/i) as HTMLInputElement;
  const postalCodeInput = screen.getByLabelText(/Почтовый индекс/i) as HTMLInputElement;
  const cityInput = screen.getByLabelText(/Город/i) as HTMLInputElement;
  const streetInput = screen.getByLabelText(/Улица/i) as HTMLInputElement;
  const houseInput = screen.getByLabelText(/Дом/i) as HTMLInputElement;
  const phoneInput = screen.getByLabelText(/Номер телефона/i) as HTMLInputElement;
  
  // Заполняем обязательные поля
  fireEvent.change(lastNameInput, { target: { value: data.last_name } });
  fireEvent.change(firstNameInput, { target: { value: data.first_name } });
  fireEvent.change(countryInput, { target: { value: data.country } });
  fireEvent.change(postalCodeInput, { target: { value: data.postal_code } });
  fireEvent.change(cityInput, { target: { value: data.city } });
  fireEvent.change(streetInput, { target: { value: data.street } });
  fireEvent.change(houseInput, { target: { value: data.house } });
  fireEvent.change(phoneInput, { target: { value: data.phone } });
  
  // Заполняем опциональные поля
  if (data.patronymic) {
    const patronymicInput = screen.getByLabelText(/Отчество/i) as HTMLInputElement;
    fireEvent.change(patronymicInput, { target: { value: data.patronymic } });
  }
  
  if (data.apartment) {
    const apartmentInput = screen.getByLabelText(/Квартира/i) as HTMLInputElement;
    fireEvent.change(apartmentInput, { target: { value: data.apartment } });
  }
  
  if (data.comment) {
    const commentInput = screen.getByLabelText(/Комментарий/i) as HTMLTextAreaElement;
    fireEvent.change(commentInput, { target: { value: data.comment } });
  }
}
