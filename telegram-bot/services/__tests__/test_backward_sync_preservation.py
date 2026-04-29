"""
Preservation Property-Based Tests для Backward Sync Column Overwrite Fix

КРИТИЧЕСКИ ВАЖНО: Эти тесты написаны ДО внесения исправления
ЦЕЛЬ: Зафиксировать существующее поведение для не-багованных входных данных
МЕТОДОЛОГИЯ: Observation-first - сначала наблюдаем поведение на неисправленном коде

Property 2: Preservation - Forward Sync и Другие Операции Не Изменены

Preservation Requirements:
- 3.1: Forward sync корректно читает промокод из столбца E и инструкцию из столбца F
- 3.2: Forward sync корректно читает данные доставки из столбцов G-R
- 3.3: Backward sync для физических призов корректно записывает данные доставки
- 3.4: Backward sync для записей без промокода/инструкции работает корректно

ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Все тесты ПРОХОДЯТ на неисправленном коде
(подтверждает, что базовое поведение работает корректно)

Validates: Requirements 3.1, 3.2, 3.3, 3.4

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**
"""
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from hypothesis import given, strategies as st, settings, Phase
from unittest.mock import Mock, patch, AsyncMock
import gspread

from services.sync_service import SyncService
from database.repositories.prize_repository import PrizeRepository
from database.models.prize import Prize
from config import GoogleSheetsConfig, SyncConfig


# ============================================================================
# Стратегии генерации данных для Property-Based Testing
# ============================================================================

@st.composite
def digital_prize_strategy(draw):
    """
    Генерирует данные для цифрового приза с промокодом и инструкцией
    Используется для тестирования forward sync чтения столбцов E и F
    """
    telegram_id = draw(st.integers(min_value=1, max_value=999999))
    prize_id = draw(st.integers(min_value=1, max_value=10000))
    row_id = draw(st.integers(min_value=2, max_value=1000))
    
    return {
        'prize_id': prize_id,
        'telegram_id': telegram_id,
        'username': draw(st.text(min_size=3, max_size=20, alphabet=st.characters(whitelist_categories=('Lu', 'Ll')))),
        'code_word': draw(st.text(min_size=3, max_size=15, alphabet=st.characters(whitelist_categories=('Lu', 'Ll')))),
        'prize_type': 'digital',
        'promo_code': draw(st.text(min_size=3, max_size=20, alphabet=st.characters(whitelist_categories=('Lu', 'Nd')))),
        'instructions': draw(st.text(min_size=5, max_size=50, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Zs')))),
        'sheet_name': draw(st.sampled_from(['Лист1', 'Январь 2024', 'Февраль 2024', 'Тест'])),
        'row_id': row_id
    }


@st.composite
def physical_prize_with_delivery_strategy(draw):
    """
    Генерирует данные для физического приза с заполненными данными доставки
    Используется для тестирования backward sync для физических призов
    """
    telegram_id = draw(st.integers(min_value=1, max_value=999999))
    prize_id = draw(st.integers(min_value=1, max_value=10000))
    row_id = draw(st.integers(min_value=2, max_value=1000))
    
    return {
        'prize_id': prize_id,
        'telegram_id': telegram_id,
        'username': draw(st.text(min_size=3, max_size=20, alphabet=st.characters(whitelist_categories=('Lu', 'Ll')))),
        'code_word': draw(st.text(min_size=3, max_size=15, alphabet=st.characters(whitelist_categories=('Lu', 'Ll')))),
        'prize_type': 'physical',
        'promo_code': None,  # Физические призы не имеют промокода
        'instructions': None,  # Физические призы не имеют инструкции
        'sheet_name': draw(st.sampled_from(['Лист1', 'Январь 2024', 'Февраль 2024', 'Тест'])),
        'row_id': row_id,
        # Данные доставки
        'last_name': draw(st.text(min_size=2, max_size=30, alphabet=st.characters(whitelist_categories=('Lu', 'Ll')))),
        'first_name': draw(st.text(min_size=2, max_size=30, alphabet=st.characters(whitelist_categories=('Lu', 'Ll')))),
        'patronymic': draw(st.one_of(st.none(), st.text(min_size=2, max_size=30, alphabet=st.characters(whitelist_categories=('Lu', 'Ll'))))),
        'country': draw(st.sampled_from(['Россия', 'Казахстан', 'Беларусь'])),
        'postal_code': draw(st.text(min_size=6, max_size=6, alphabet=st.characters(whitelist_categories=('Nd',)))),
        'city': draw(st.text(min_size=3, max_size=30, alphabet=st.characters(whitelist_categories=('Lu', 'Ll')))),
        'street': draw(st.text(min_size=3, max_size=40, alphabet=st.characters(whitelist_categories=('Lu', 'Ll')))),
        'house': draw(st.text(min_size=1, max_size=5, alphabet=st.characters(whitelist_categories=('Nd',)))),
        'apartment': draw(st.one_of(st.none(), st.text(min_size=1, max_size=5, alphabet=st.characters(whitelist_categories=('Nd',))))),
        'phone': '+7' + draw(st.text(min_size=10, max_size=10, alphabet=st.characters(whitelist_categories=('Nd',)))),
        'comment': draw(st.one_of(st.none(), st.text(min_size=0, max_size=50, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Zs')))))
    }


@st.composite
def digital_prize_without_promo_strategy(draw):
    """
    Генерирует данные для цифрового приза БЕЗ промокода и инструкции, но с данными доставки
    Используется для тестирования backward sync для записей без промокода/инструкции
    """
    telegram_id = draw(st.integers(min_value=1, max_value=999999))
    prize_id = draw(st.integers(min_value=1, max_value=10000))
    row_id = draw(st.integers(min_value=2, max_value=1000))
    
    return {
        'prize_id': prize_id,
        'telegram_id': telegram_id,
        'username': draw(st.text(min_size=3, max_size=20, alphabet=st.characters(whitelist_categories=('Lu', 'Ll')))),
        'code_word': draw(st.text(min_size=3, max_size=15, alphabet=st.characters(whitelist_categories=('Lu', 'Ll')))),
        'prize_type': 'digital',
        'promo_code': None,  # НЕТ промокода
        'instructions': None,  # НЕТ инструкции
        'sheet_name': draw(st.sampled_from(['Лист1', 'Январь 2024', 'Февраль 2024', 'Тест'])),
        'row_id': row_id,
        # Данные доставки
        'last_name': draw(st.text(min_size=2, max_size=30, alphabet=st.characters(whitelist_categories=('Lu', 'Ll')))),
        'first_name': draw(st.text(min_size=2, max_size=30, alphabet=st.characters(whitelist_categories=('Lu', 'Ll')))),
        'patronymic': draw(st.one_of(st.none(), st.text(min_size=2, max_size=30, alphabet=st.characters(whitelist_categories=('Lu', 'Ll'))))),
        'country': draw(st.sampled_from(['Россия', 'Казахстан', 'Беларусь'])),
        'postal_code': draw(st.text(min_size=6, max_size=6, alphabet=st.characters(whitelist_categories=('Nd',)))),
        'city': draw(st.text(min_size=3, max_size=30, alphabet=st.characters(whitelist_categories=('Lu', 'Ll')))),
        'street': draw(st.text(min_size=3, max_size=40, alphabet=st.characters(whitelist_categories=('Lu', 'Ll')))),
        'house': draw(st.text(min_size=1, max_size=5, alphabet=st.characters(whitelist_categories=('Nd',)))),
        'apartment': draw(st.one_of(st.none(), st.text(min_size=1, max_size=5, alphabet=st.characters(whitelist_categories=('Nd',))))),
        'phone': '+7' + draw(st.text(min_size=10, max_size=10, alphabet=st.characters(whitelist_categories=('Nd',)))),
        'comment': draw(st.one_of(st.none(), st.text(min_size=0, max_size=50, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Zs')))))
    }


# ============================================================================
# Вспомогательные функции
# ============================================================================

def create_prize_from_data(data: dict, with_delivery: bool = False) -> Prize:
    """Создаёт объект Prize из словаря данных"""
    now = datetime.now(timezone.utc)
    
    prize_kwargs = {
        'id': data['prize_id'],
        'telegram_id': data['telegram_id'],
        'username': data['username'],
        'prize_type': data['prize_type'],
        'code_word': data['code_word'],
        'promo_code': data.get('promo_code'),
        'instructions': data.get('instructions'),
        'sheet_name': data['sheet_name'],
        'row_id': data['row_id'],
        'created_at': now,
        'updated_at': now,
        'gdpr_consent_date': now
    }
    
    if with_delivery:
        prize_kwargs.update({
            'claimed_at': now,
            'last_name': data.get('last_name'),
            'first_name': data.get('first_name'),
            'patronymic': data.get('patronymic'),
            'country': data.get('country'),
            'postal_code': data.get('postal_code'),
            'city': data.get('city'),
            'street': data.get('street'),
            'house': data.get('house'),
            'apartment': data.get('apartment'),
            'phone': data.get('phone'),
            'comment': data.get('comment')
        })
    else:
        prize_kwargs.update({
            'claimed_at': None,
            'last_name': None,
            'first_name': None,
            'patronymic': None,
            'country': None,
            'postal_code': None,
            'city': None,
            'street': None,
            'house': None,
            'apartment': None,
            'phone': None,
            'comment': None
        })
    
    return Prize(**prize_kwargs)


def create_sync_service():
    """Создаёт SyncService с моками для тестирования"""
    google_sheets_config = GoogleSheetsConfig(
        credentials_path="credentials/google-credentials.json",
        spreadsheet_id="test_spreadsheet_id"
    )
    
    sync_config = SyncConfig(
        sync_interval_seconds=60,
        use_postgres=True,
        batch_size=100,
        max_retries=3
    )
    
    mock_prize_repository = Mock(spec=PrizeRepository)
    
    with patch('services.sync.sheets_io.Credentials.from_service_account_file'):
        with patch('services.sync.sheets_io.gspread.authorize'):
            service = SyncService(
                google_sheets_config=google_sheets_config,
                sync_config=sync_config,
                prize_repository=mock_prize_repository
            )
    
    return service


# ============================================================================
# Property 2.1: Forward Sync Читает Промокод и Инструкцию из Столбцов E и F
# ============================================================================

@given(prize_data=digital_prize_strategy())
@settings(max_examples=20, phases=[Phase.generate, Phase.target])
def test_preservation_forward_sync_reads_promo_code_and_instructions(prize_data):
    """
    Property 2.1: Forward Sync Preservation - Чтение Промокода и Инструкции
    
    OBSERVATION-FIRST: Наблюдаем, что forward sync корректно читает:
    - Промокод из столбца E (индекс 4)
    - Инструкцию из столбца F (индекс 5)
    
    Property: Для любого цифрового приза с промокодом и инструкцией,
    метод _convert_sheet_data_to_prizes корректно извлекает эти данные
    из столбцов E и F.
    
    ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОХОДИТ на неисправленном коде
    (подтверждает, что forward sync работает корректно)
    
    Validates: Requirement 3.1
    """
    # Arrange
    service = create_sync_service()
    
    # Симулируем данные из Google Sheets
    # Структура: A=telegram_id, B=username, C=code_word, D=prize_type, E=promo_code, F=instructions
    sheet_data = [[
        str(prize_data['telegram_id']),  # A: telegram_id
        prize_data['username'],           # B: username
        prize_data['code_word'],          # C: code_word
        prize_data['prize_type'],         # D: prize_type
        prize_data['promo_code'],         # E: promo_code
        prize_data['instructions']        # F: instructions
    ]]
    
    # Act
    prizes = service._convert_sheet_data_to_prizes(sheet_data, prize_data['sheet_name'])
    
    # Assert
    assert len(prizes) == 1, "Должна быть создана 1 запись приза"
    
    prize = prizes[0]
    
    # Property: Forward sync корректно читает промокод из столбца E
    assert prize['promo_code'] == prize_data['promo_code'], \
        f"Промокод должен быть прочитан из столбца E: ожидался '{prize_data['promo_code']}', получен '{prize['promo_code']}'"
    
    # Property: Forward sync корректно читает инструкцию из столбца F
    assert prize['instructions'] == prize_data['instructions'], \
        f"Инструкция должна быть прочитана из столбца F: ожидалась '{prize_data['instructions']}', получена '{prize['instructions']}'"
    
    # Дополнительные проверки базовых полей
    assert prize['telegram_id'] == prize_data['telegram_id']
    assert prize['username'] == prize_data['username']
    assert prize['code_word'] == prize_data['code_word']
    assert prize['prize_type'] == prize_data['prize_type']


# ============================================================================
# Property 2.2: Forward Sync Читает Данные Доставки из Столбцов G-R
# ============================================================================

@given(prize_data=physical_prize_with_delivery_strategy())
@settings(max_examples=20, phases=[Phase.generate, Phase.target])
def test_preservation_forward_sync_reads_delivery_data(prize_data):
    """
    Property 2.2: Forward Sync Preservation - Чтение Данных Доставки
    
    OBSERVATION-FIRST: Наблюдаем, что forward sync корректно читает
    данные доставки из столбцов G-R (индексы 6-17) для физических призов.
    
    Property: Для любого физического приза с данными доставки,
    метод _convert_sheet_data_to_prizes корректно извлекает все 12 полей
    данных доставки из столбцов G-R.
    
    ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОХОДИТ на неисправленном коде
    (подтверждает, что forward sync работает корректно)
    
    Validates: Requirement 3.2
    """
    # Arrange
    service = create_sync_service()
    
    # Симулируем данные из Google Sheets для физического приза
    # Структура: A-D=базовые поля, E-F=пустые (нет промокода/инструкции), G-R=данные доставки
    sheet_data = [[
        str(prize_data['telegram_id']),  # A: telegram_id
        prize_data['username'],           # B: username
        prize_data['code_word'],          # C: code_word
        prize_data['prize_type'],         # D: prize_type
        '',                               # E: promo_code (пусто для physical)
        '',                               # F: instructions (пусто для physical)
        prize_data['last_name'],          # G: last_name (индекс 6)
        prize_data['first_name'],         # H: first_name (индекс 7)
        prize_data['patronymic'] or '',   # I: patronymic (индекс 8)
        prize_data['city'],               # J: city (индекс 9)
        prize_data['street'],             # K: street (индекс 10)
        prize_data['house'],              # L: house (индекс 11)
        prize_data['apartment'] or '',    # M: apartment (индекс 12)
        prize_data['phone'],              # N: phone (индекс 13)
        prize_data['comment'] or ''       # O: comment (индекс 14)
        # P: country, Q: postal_code, R: claimed_at - не читаются в forward sync для physical
    ]]
    
    # Act
    prizes = service._convert_sheet_data_to_prizes(sheet_data, prize_data['sheet_name'])
    
    # Assert
    assert len(prizes) == 1, "Должна быть создана 1 запись приза"
    
    prize = prizes[0]
    
    # Property: Forward sync корректно читает данные доставки из столбцов G-O
    # OBSERVATION: _convert_sheet_data_to_prizes возвращает None для пустых полей,
    # но если в sheet_data пустая строка '', то она остаётся пустой строкой
    # Нормализуем для сравнения: пустая строка '' и None считаются эквивалентными
    def normalize_value(value):
        """Нормализует значение для сравнения: пустая строка и None эквивалентны"""
        return None if (value == '' or value is None) else value
    
    assert normalize_value(prize['last_name']) == normalize_value(prize_data['last_name']), "G: last_name"
    assert normalize_value(prize['first_name']) == normalize_value(prize_data['first_name']), "H: first_name"
    assert normalize_value(prize['patronymic']) == normalize_value(prize_data['patronymic']), "I: patronymic"
    assert normalize_value(prize['city']) == normalize_value(prize_data['city']), "J: city"
    assert normalize_value(prize['street']) == normalize_value(prize_data['street']), "K: street"
    assert normalize_value(prize['house']) == normalize_value(prize_data['house']), "L: house"
    assert normalize_value(prize['apartment']) == normalize_value(prize_data['apartment']), "M: apartment"
    assert normalize_value(prize['phone']) == normalize_value(prize_data['phone']), "N: phone"
    assert normalize_value(prize['comment']) == normalize_value(prize_data['comment']), "O: comment"
    
    # Базовые поля
    assert prize['telegram_id'] == prize_data['telegram_id']
    assert prize['prize_type'] == 'physical'


# ============================================================================
# Property 2.3: Backward Sync для Физических Призов Корректно Записывает Данные
# ============================================================================

@pytest.mark.asyncio
@given(prize_data=physical_prize_with_delivery_strategy())
@settings(max_examples=15, phases=[Phase.generate, Phase.target])
async def test_preservation_backward_sync_physical_prize(prize_data):
    """
    Property 2.3: Backward Sync Preservation - Физические Призы
    
    OBSERVATION-FIRST: Наблюдаем, что backward sync для физических призов
    корректно записывает данные доставки. Для физических призов столбцы E и F
    не используются (нет промокода и инструкции), поэтому баг не критичен.
    
    Property: Для любого физического приза с данными доставки,
    метод _sync_sheet_delivery_data корректно записывает все 12 полей
    данных доставки в Google Sheets.
    
    ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОХОДИТ на неисправленном коде
    (подтверждает, что backward sync для физических призов работает)
    
    ПРИМЕЧАНИЕ: На неисправленном коде диапазон будет E:P, но для физических
    призов это не критично, так как столбцы E и F не содержат важных данных.
    После исправления диапазон будет G:R для всех типов призов.
    
    Validates: Requirement 3.3
    """
    # Arrange
    prize = create_prize_from_data(prize_data, with_delivery=True)
    service = create_sync_service()
    
    # Mock для Google Sheets API
    mock_spreadsheet = Mock()
    mock_worksheet = Mock()
    
    captured_batch_data = []
    
    def capture_batch_update(batch_data):
        captured_batch_data.extend(batch_data)
        return None
    
    mock_worksheet.batch_update = Mock(side_effect=capture_batch_update)
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    service.client.open_by_key = Mock(return_value=mock_spreadsheet)
    
    # Act
    updated_count = await service._sync_sheet_delivery_data(
        prize_data['sheet_name'],
        [prize]
    )
    
    # Assert
    assert updated_count == 1, "Должна быть обновлена 1 запись"
    assert len(captured_batch_data) == 1, "Должен быть 1 batch update"
    
    batch_update = captured_batch_data[0]
    cell_range = batch_update['range']
    row_data = batch_update['values'][0]
    
    # Property: Данные доставки записаны корректно
    assert len(row_data) == 12, "Должно быть 12 полей данных доставки"
    
    # Проверяем структуру данных
    assert row_data[0] == prize_data['last_name'], "last_name"
    assert row_data[1] == prize_data['first_name'], "first_name"
    assert row_data[2] == (prize_data['patronymic'] or ''), "patronymic"
    assert row_data[3] == prize_data['city'], "city"
    assert row_data[4] == prize_data['street'], "street"
    assert row_data[5] == prize_data['house'], "house"
    assert row_data[6] == (prize_data['apartment'] or ''), "apartment"
    assert row_data[7] == prize_data['phone'], "phone"
    assert row_data[8] == (prize_data['comment'] or ''), "comment"
    assert row_data[9] == prize_data['country'], "country"
    assert row_data[10] == prize_data['postal_code'], "postal_code"
    assert row_data[11] != '', "claimed_at должен быть заполнен"
    
    # OBSERVATION: На неисправленном коде диапазон будет E:P
    # Для физических призов это не критично, но архитектурно неправильно
    # После исправления диапазон будет G:R
    
    print(f"\nОбратная синхронизация физического приза:")
    print(f"  Sheet: {prize_data['sheet_name']}, Row: {prize_data['row_id']}")
    print(f"  Диапазон: {cell_range}")
    print(f"  Данные доставки записаны корректно ✓")


# ============================================================================
# Property 2.4: Backward Sync для Записей без Промокода/Инструкции
# ============================================================================

@pytest.mark.asyncio
@given(prize_data=digital_prize_without_promo_strategy())
@settings(max_examples=15, phases=[Phase.generate, Phase.target])
async def test_preservation_backward_sync_digital_without_promo(prize_data):
    """
    Property 2.4: Backward Sync Preservation - Записи без Промокода/Инструкции
    
    OBSERVATION-FIRST: Наблюдаем, что backward sync для цифровых призов
    БЕЗ промокода и инструкции работает корректно. В этом случае столбцы E и F
    пустые, поэтому баг не критичен (перезаписываются пустые значения).
    
    Property: Для любого цифрового приза БЕЗ промокода и инструкции,
    но с данными доставки, метод _sync_sheet_delivery_data корректно
    записывает данные доставки в Google Sheets.
    
    ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОХОДИТ на неисправленном коде
    (подтверждает, что backward sync работает для записей без промокода)
    
    ПРИМЕЧАНИЕ: Баг не критичен в этом случае, так как столбцы E и F пустые,
    но диапазон всё равно неправильный и должен быть исправлен.
    
    Validates: Requirement 3.4
    """
    # Arrange
    prize = create_prize_from_data(prize_data, with_delivery=True)
    service = create_sync_service()
    
    # Mock для Google Sheets API
    mock_spreadsheet = Mock()
    mock_worksheet = Mock()
    
    captured_batch_data = []
    
    def capture_batch_update(batch_data):
        captured_batch_data.extend(batch_data)
        return None
    
    mock_worksheet.batch_update = Mock(side_effect=capture_batch_update)
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    service.client.open_by_key = Mock(return_value=mock_spreadsheet)
    
    # Act
    updated_count = await service._sync_sheet_delivery_data(
        prize_data['sheet_name'],
        [prize]
    )
    
    # Assert
    assert updated_count == 1, "Должна быть обновлена 1 запись"
    assert len(captured_batch_data) == 1, "Должен быть 1 batch update"
    
    batch_update = captured_batch_data[0]
    cell_range = batch_update['range']
    row_data = batch_update['values'][0]
    
    # Property: Данные доставки записаны корректно
    assert len(row_data) == 12, "Должно быть 12 полей данных доставки"
    
    # Проверяем структуру данных
    assert row_data[0] == prize_data['last_name'], "last_name"
    assert row_data[1] == prize_data['first_name'], "first_name"
    assert row_data[2] == (prize_data['patronymic'] or ''), "patronymic"
    assert row_data[3] == prize_data['city'], "city"
    assert row_data[4] == prize_data['street'], "street"
    assert row_data[5] == prize_data['house'], "house"
    assert row_data[6] == (prize_data['apartment'] or ''), "apartment"
    assert row_data[7] == prize_data['phone'], "phone"
    assert row_data[8] == (prize_data['comment'] or ''), "comment"
    assert row_data[9] == prize_data['country'], "country"
    assert row_data[10] == prize_data['postal_code'], "postal_code"
    assert row_data[11] != '', "claimed_at должен быть заполнен"
    
    # OBSERVATION: На неисправленном коде диапазон будет E:P
    # Для записей без промокода/инструкции это не критично (перезаписываются пустые значения)
    # Но архитектурно неправильно - после исправления диапазон будет G:R
    
    print(f"\nОбратная синхронизация цифрового приза без промокода:")
    print(f"  Sheet: {prize_data['sheet_name']}, Row: {prize_data['row_id']}")
    print(f"  Диапазон: {cell_range}")
    print(f"  Данные доставки записаны корректно ✓")
    print(f"  Примечание: Столбцы E и F пустые, баг не критичен")
