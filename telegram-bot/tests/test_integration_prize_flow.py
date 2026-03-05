"""
Интеграционные тесты для полного цикла розыгрыша.

Проверяют end-to-end сценарии:
1. Пользователь отправляет кодовое слово → получает цифровой приз
2. Пользователь отправляет кодовое слово → получает кнопку WebApp → заполняет форму → данные сохраняются

Validates: Requirements 1.1, 1.2, 2.1, 2.2, 3.1, 4.5
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from aiogram.types import Message, User, Chat, InlineKeyboardMarkup
import gspread

from handlers.prize_handler import PrizeHandler
from services.prize_service import PrizeService
from services.google_sheets_service import GoogleSheetsService


# ============================================================================
# Вспомогательные функции
# ============================================================================

def create_mock_message(telegram_id: int, text: str = "TEST_CODE"):
    """Создаёт mock Message от пользователя"""
    message = AsyncMock(spec=Message)
    message.from_user = MagicMock(spec=User)
    message.from_user.id = telegram_id
    message.text = text
    message.chat = MagicMock(spec=Chat)
    message.answer = AsyncMock()
    return message


def create_mock_worksheet_with_digital_prize(telegram_id: int):
    """
    Создаёт mock worksheet с цифровым призом
    
    Структура строки:
    [telegram_id, 'digital', 'PROMO123', 'Используйте промокод на сайте']
    """
    mock_worksheet = MagicMock()
    
    # Mock для find - возвращает ячейку
    mock_cell = MagicMock()
    mock_cell.row = 2  # Строка с данными
    mock_worksheet.find.return_value = mock_cell
    
    # Mock для row_values - возвращает данные строки
    mock_worksheet.row_values.return_value = [
        str(telegram_id),
        'digital',
        'PROMO123',
        'Используйте промокод на сайте example.com'
    ]
    
    # Mock для update_cell (для отметки claimed_at)
    mock_worksheet.update_cell = MagicMock()
    
    return mock_worksheet


def create_mock_worksheet_with_physical_prize(telegram_id: int):
    """
    Создаёт mock worksheet с физическим призом
    
    Структура строки:
    [telegram_id, 'physical']
    """
    mock_worksheet = MagicMock()
    
    # Mock для find
    mock_cell = MagicMock()
    mock_cell.row = 3  # Строка с данными
    mock_worksheet.find.return_value = mock_cell
    
    # Mock для row_values
    mock_worksheet.row_values.return_value = [
        str(telegram_id),
        'physical'
    ]
    
    # Mock для update_cell (для отметки claimed_at)
    mock_worksheet.update_cell = MagicMock()
    
    # Mock для batch_update (для сохранения данных доставки)
    mock_worksheet.batch_update = MagicMock()
    
    return mock_worksheet


def create_mock_gspread_client(mock_worksheet):
    """Создаёт mock gspread клиент с заданным worksheet"""
    mock_client = MagicMock(spec=gspread.Client)
    mock_sheet = MagicMock()
    mock_sheet.worksheet.return_value = mock_worksheet
    mock_sheet.get_worksheet.return_value = mock_worksheet
    mock_client.open_by_key.return_value = mock_sheet
    return mock_client


# ============================================================================
# Интеграционный тест 1: Цифровой приз
# ============================================================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_integration_digital_prize_full_flow():
    """
    Интеграционный тест: Полный цикл получения цифрового приза
    
    Сценарий:
    1. Пользователь отправляет кодовое слово боту
    2. Бот проверяет Telegram ID в Google Sheets
    3. Находит цифровой приз с промокодом
    4. Отправляет пользователю сообщение с промокодом и инструкцией
    5. Отмечает приз как полученный (claimed_at)
    
    Validates: Requirements 1.1, 1.2, 2.1, 2.2
    """
    # Arrange: настройка тестовых данных
    telegram_id = 123456789
    code_word = "SUMMER2024"
    
    # Создаём mock worksheet с цифровым призом
    mock_worksheet = create_mock_worksheet_with_digital_prize(telegram_id)
    mock_client = create_mock_gspread_client(mock_worksheet)
    
    # Создаём реальные сервисы с mock клиентом
    # Патчим _init_client чтобы избежать реальной инициализации
    with patch.object(GoogleSheetsService, '_init_client', return_value=mock_client):
        sheets_service = GoogleSheetsService(
            credentials_path="fake_credentials.json",
            spreadsheet_id="fake_spreadsheet_id"
        )
        
        prize_service = PrizeService(sheets_service)
        prize_handler = PrizeHandler(
            prize_service,
            webapp_url="https://test-webapp.example.com"
        )
    
    # Создаём mock сообщение от пользователя
    mock_message = create_mock_message(telegram_id, code_word)
    
    # Act: выполняем полный цикл обработки
    await prize_handler.handle_code_word(mock_message, code_word)
    
    # Assert: проверяем результаты
    
    # 1. Проверяем, что был выполнен поиск в Google Sheets
    mock_worksheet.find.assert_called_once_with(str(telegram_id), in_column=1)
    
    # 2. Проверяем, что были получены данные строки
    mock_worksheet.row_values.assert_called_once_with(2)
    
    # 3. Проверяем, что приз был отмечен как полученный (столбец I = 9)
    mock_worksheet.update_cell.assert_called_once()
    call_args = mock_worksheet.update_cell.call_args[0]
    assert call_args[0] == 2, "Должна обновляться строка 2"
    assert call_args[1] == 14, "Должен обновляться столбец N (claimed_at)"
    
    # 4. Проверяем, что пользователю было отправлено сообщение
    assert mock_message.answer.called, "Пользователю должно быть отправлено сообщение"
    
    # 5. Проверяем содержимое сообщения
    sent_message = mock_message.answer.call_args[0][0]
    assert "PROMO123" in sent_message, "Сообщение должно содержать промокод"
    assert "example.com" in sent_message, "Сообщение должно содержать инструкцию"
    assert "🎉" in sent_message or "Поздравляем" in sent_message, \
        "Сообщение должно содержать поздравление"


# ============================================================================
# Интеграционный тест 2: Физический приз с данными доставки
# ============================================================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_integration_physical_prize_with_delivery_data_full_flow():
    """
    Интеграционный тест: Полный цикл получения физического приза с данными доставки
    
    Сценарий:
    1. Пользователь отправляет кодовое слово боту
    2. Бот проверяет Telegram ID в Google Sheets
    3. Находит физический приз
    4. Отправляет пользователю кнопку WebApp
    5. Пользователь заполняет форму (симулируется)
    6. Данные сохраняются в Google Sheets
    7. Приз отмечается как полученный (claimed_at)
    
    Validates: Requirements 1.1, 1.2, 3.1, 4.5
    """
    # Arrange: настройка тестовых данных
    telegram_id = 987654321
    code_word = "WINTER2024"
    row_id = 3
    
    # Создаём mock worksheet с физическим призом
    mock_worksheet = create_mock_worksheet_with_physical_prize(telegram_id)
    mock_client = create_mock_gspread_client(mock_worksheet)
    
    # Создаём реальные сервисы с mock клиентом
    with patch.object(GoogleSheetsService, '_init_client', return_value=mock_client):
        sheets_service = GoogleSheetsService(
            credentials_path="fake_credentials.json",
            spreadsheet_id="fake_spreadsheet_id"
        )
        
        prize_service = PrizeService(sheets_service)
        prize_handler = PrizeHandler(
            prize_service,
            webapp_url="https://test-webapp.example.com"
        )
    
    # Создаём mock сообщение от пользователя
    mock_message = create_mock_message(telegram_id, code_word)
    
    # Act Part 1: пользователь отправляет кодовое слово
    await prize_handler.handle_code_word(mock_message, code_word)
    
    # Assert Part 1: проверяем отправку кнопки WebApp
    
    # 1. Проверяем, что был выполнен поиск в Google Sheets
    mock_worksheet.find.assert_called_once_with(str(telegram_id), in_column=1)
    
    # 2. Проверяем, что пользователю было отправлено сообщение с кнопкой
    assert mock_message.answer.called, "Пользователю должно быть отправлено сообщение"
    call_kwargs = mock_message.answer.call_args[1]
    
    # 3. Проверяем наличие reply_markup с WebApp кнопкой
    assert 'reply_markup' in call_kwargs, "Должна быть клавиатура с кнопкой"
    keyboard = call_kwargs['reply_markup']
    assert isinstance(keyboard, InlineKeyboardMarkup), \
        "Клавиатура должна быть InlineKeyboardMarkup"
    
    # 4. Проверяем параметры WebApp кнопки
    button = keyboard.inline_keyboard[0][0]
    assert button.web_app is not None, "Кнопка должна содержать web_app"
    webapp_url = button.web_app.url
    assert f"prize_id={row_id}" in webapp_url, \
        f"URL должен содержать prize_id={row_id}"
    
    # 5. Проверяем, что приз был отмечен как полученный
    mock_worksheet.update_cell.assert_called_once()
    
    # Act Part 2: симулируем заполнение формы и сохранение данных
    delivery_data = {
        'last_name': 'Иванов',
        'first_name': 'Иван',
        'patronymic': 'Иванович',
        'city': 'Москва',
        'street': 'ул. Тестовая',
        'house': '1',
        'apartment': '10',
        'phone': '+79991234567',
        'comment': 'Доставка после 18:00',
        'telegram_id': telegram_id
    }
    
    # Сохраняем данные доставки через сервис
    success = await sheets_service.save_delivery_data(
        row_id=row_id,
        delivery_data=delivery_data,
        worksheet_name=code_word
    )
    
    # Assert Part 2: проверяем сохранение данных доставки
    
    # 6. Проверяем, что данные были успешно сохранены
    assert success is True, "Данные доставки должны быть успешно сохранены"
    
    # 7. Проверяем, что был вызван batch_update для сохранения данных
    mock_worksheet.batch_update.assert_called_once()
    
    # 8. Проверяем структуру обновлений
    updates = mock_worksheet.batch_update.call_args[0][0]
    assert len(updates) == 9, "Должно быть 9 обновлений (все поля доставки E-M)"
    
    # Проверяем, что обновляются правильные ячейки (E-M)
    ranges = [update['range'] for update in updates]
    assert f'E{row_id}' in ranges, "Должна обновляться ячейка E (last_name)"
    assert f'F{row_id}' in ranges, "Должна обновляться ячейка F (first_name)"
    assert f'G{row_id}' in ranges, "Должна обновляться ячейка G (patronymic)"
    assert f'H{row_id}' in ranges, "Должна обновляться ячейка H (city)"
    assert f'I{row_id}' in ranges, "Должна обновляться ячейка I (street)"
    assert f'J{row_id}' in ranges, "Должна обновляться ячейка J (house)"
    assert f'K{row_id}' in ranges, "Должна обновляться ячейка K (apartment)"
    assert f'L{row_id}' in ranges, "Должна обновляться ячейка L (phone)"
    assert f'M{row_id}' in ranges, "Должна обновляться ячейка M (comment)"
    
    # Проверяем содержимое обновлений
    for update in updates:
        if update['range'] == f'E{row_id}':
            assert update['values'][0][0] == 'Иванов'
        elif update['range'] == f'F{row_id}':
            assert update['values'][0][0] == 'Иван'
        elif update['range'] == f'G{row_id}':
            assert update['values'][0][0] == 'Иванович'
        elif update['range'] == f'H{row_id}':
            assert update['values'][0][0] == 'Москва'
        elif update['range'] == f'I{row_id}':
            assert update['values'][0][0] == 'ул. Тестовая'
        elif update['range'] == f'J{row_id}':
            assert update['values'][0][0] == '1'
        elif update['range'] == f'K{row_id}':
            assert update['values'][0][0] == '10'
        elif update['range'] == f'L{row_id}':
            assert update['values'][0][0] == '+79991234567'
        elif update['range'] == f'M{row_id}':
            assert update['values'][0][0] == 'Доставка после 18:00'


# ============================================================================
# Интеграционный тест 3: Приз не найден
# ============================================================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_integration_prize_not_found_flow():
    """
    Интеграционный тест: Пользователь не найден в таблице
    
    Сценарий:
    1. Пользователь отправляет кодовое слово боту
    2. Бот проверяет Telegram ID в Google Sheets
    3. ID не найден в таблице
    4. Пользователь получает сообщение "Вы ещё не победили в конкурсе"
    
    Validates: Requirements 1.3
    """
    # Arrange
    telegram_id = 111111111
    code_word = "NOTFOUND"
    
    # Создаём mock worksheet без результатов (find возвращает None)
    mock_worksheet = MagicMock()
    mock_worksheet.find.return_value = None
    
    mock_client = create_mock_gspread_client(mock_worksheet)
    
    # Создаём реальные сервисы
    with patch.object(GoogleSheetsService, '_init_client', return_value=mock_client):
        sheets_service = GoogleSheetsService(
            credentials_path="fake_credentials.json",
            spreadsheet_id="fake_spreadsheet_id"
        )
        
        prize_service = PrizeService(sheets_service)
        prize_handler = PrizeHandler(
            prize_service,
            webapp_url="https://test-webapp.example.com"
        )
    
    mock_message = create_mock_message(telegram_id, code_word)
    
    # Act
    await prize_handler.handle_code_word(mock_message, code_word)
    
    # Assert
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    assert "Вы ещё не победили в конкурсе" in sent_message


# ============================================================================
# Интеграционный тест 4: Worksheet не найден
# ============================================================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_integration_worksheet_not_found_flow():
    """
    Интеграционный тест: Кодовое слово (worksheet) не существует
    
    Сценарий:
    1. Пользователь отправляет несуществующее кодовое слово
    2. Бот пытается найти worksheet с таким именем
    3. Worksheet не найден
    4. Пользователь получает сообщение "Вы ещё не победили в конкурсе"
    
    Validates: Requirements 1.3
    """
    # Arrange
    telegram_id = 222222222
    code_word = "INVALID_CODE"
    
    # Создаём mock для несуществующего worksheet
    mock_client = MagicMock(spec=gspread.Client)
    mock_sheet = MagicMock()
    mock_sheet.worksheet.side_effect = gspread.exceptions.WorksheetNotFound("Worksheet not found")
    mock_client.open_by_key.return_value = mock_sheet
    
    # Создаём реальные сервисы
    with patch.object(GoogleSheetsService, '_init_client', return_value=mock_client):
        sheets_service = GoogleSheetsService(
            credentials_path="fake_credentials.json",
            spreadsheet_id="fake_spreadsheet_id"
        )
        
        prize_service = PrizeService(sheets_service)
        prize_handler = PrizeHandler(
            prize_service,
            webapp_url="https://test-webapp.example.com"
        )
    
    mock_message = create_mock_message(telegram_id, code_word)
    
    # Act
    await prize_handler.handle_code_word(mock_message, code_word)
    
    # Assert
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    assert "Вы ещё не победили в конкурсе" in sent_message
