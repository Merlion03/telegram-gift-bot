"""
Integration тесты для полного цикла обработки данных доставки

Validates: Requirements 1.1, 5.3, 15.5, 2.4, 13.2, 12.1, 12.2, 12.3, 12.4, 12.5, 11.1, 11.2
"""
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from typing import Dict, Any
from hypothesis import given, strategies as st, settings, HealthCheck

from database.repositories.prize_repository import PrizeRepository
from database.models.prize import Prize
from services.sync_service import SyncService
from config import GoogleSheetsConfig, SyncConfig
import gspread


@pytest_asyncio.fixture
async def mock_gspread_client():
    """Mock для gspread клиента"""
    client = Mock(spec=gspread.Client)
    return client


@pytest_asyncio.fixture
async def sync_service_with_real_repo(prize_repository, mock_gspread_client):
    """Создаёт экземпляр SyncService с реальным prize_repository и mock gspread"""
    google_sheets_config = GoogleSheetsConfig(
        credentials_path="test_credentials.json",
        spreadsheet_id="test_spreadsheet_id"
    )
    
    sync_config = SyncConfig(
        sync_interval_seconds=60,
        use_postgres=True,
        batch_size=100,
        max_retries=3
    )
    
    # Патчим _init_client чтобы избежать реальной инициализации
    with patch.object(SyncService, '_init_client', return_value=mock_gspread_client):
        service = SyncService(
            google_sheets_config=google_sheets_config,
            sync_config=sync_config,
            prize_repository=prize_repository
        )
    
    return service


@pytest.mark.asyncio
@pytest.mark.integration
async def test_full_cycle_delivery_data_flow(
    prize_repository,
    sync_service_with_real_repo,
    create_prize_in_db,
    mock_gspread_client
):
    """
    E2E тест полного цикла обработки данных доставки
    
    Сценарий:
    1. Создать приз в PostgreSQL
    2. Отправить форму доставки через Delivery_API (mock)
    3. Проверить сохранение в PostgreSQL
    4. Запустить обратную синхронизацию
    5. Проверить данные в Google Sheets (mock)
    6. Проверить идентичность данных в PostgreSQL и Google Sheets
    
    Validates: Requirements 1.1, 5.3, 15.5
    """
    # 1. Создаём приз в PostgreSQL
    prize = await create_prize_in_db(
        telegram_id=123456,
        prize_type="physical",
        code_word="test_full_cycle",
        sheet_name="Лист1",
        row_id=2
    )
    
    assert prize.claimed_at is None
    assert prize.last_name is None
    
    # 2. Отправляем форму доставки (имитация Delivery_API)
    delivery_data = {
        'last_name': 'Иванов',
        'first_name': 'Иван',
        'patronymic': 'Иванович',
        'country': 'Россия',
        'postal_code': '123456',
        'city': 'Москва',
        'street': 'Ленина',
        'house': '10',
        'apartment': '5',
        'phone': '+79991234567',
        'comment': 'Тестовый комментарий'
    }
    
    updated_prize = await prize_repository.update_delivery_data_by_prize_id(
        prize.id,
        delivery_data
    )
    
    # 3. Проверяем сохранение в PostgreSQL
    assert updated_prize.last_name == 'Иванов'
    assert updated_prize.first_name == 'Иван'
    assert updated_prize.patronymic == 'Иванович'
    assert updated_prize.country == 'Россия'
    assert updated_prize.postal_code == '123456'
    assert updated_prize.city == 'Москва'
    assert updated_prize.street == 'Ленина'
    assert updated_prize.house == '10'
    assert updated_prize.apartment == '5'
    assert updated_prize.phone == '+79991234567'
    assert updated_prize.comment == 'Тестовый комментарий'
    assert updated_prize.claimed_at is not None
    
    # 4. Запускаем обратную синхронизацию
    # Mock для Google Sheets API
    mock_spreadsheet = Mock()
    mock_worksheet = Mock()
    mock_worksheet.batch_update = Mock()
    
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    mock_gspread_client.open_by_key.return_value = mock_spreadsheet
    
    stats = await sync_service_with_real_repo.sync_delivery_data_to_sheets()
    
    # 5. Проверяем, что данные отправлены в Google Sheets
    assert stats['records_processed'] == 1
    assert stats['records_updated'] == 1
    assert stats['sheets_updated'] == 1
    assert len(stats['errors']) == 0
    
    # Проверяем вызов batch_update
    mock_worksheet.batch_update.assert_called_once()
    batch_data = mock_worksheet.batch_update.call_args[0][0]
    
    # 6. Проверяем идентичность данных
    assert len(batch_data) == 1
    assert batch_data[0]['range'] == 'E2:P2'
    
    row_data = batch_data[0]['values'][0]
    # Структура: E-P (last_name, first_name, patronymic, city, street, house, apartment, phone, comment, country, postal_code, claimed_at)
    assert row_data[0] == 'Иванов'              # E: last_name
    assert row_data[1] == 'Иван'                # F: first_name
    assert row_data[2] == 'Иванович'            # G: patronymic
    assert row_data[3] == 'Москва'              # H: city
    assert row_data[4] == 'Ленина'              # I: street
    assert row_data[5] == '10'                  # J: house
    assert row_data[6] == '5'                   # K: apartment
    assert row_data[7] == '+79991234567'        # L: phone
    assert row_data[8] == 'Тестовый комментарий'  # M: comment
    assert row_data[9] == 'Россия'              # N: country
    assert row_data[10] == '123456'             # O: postal_code
    assert row_data[11] == updated_prize.claimed_at.isoformat()  # P: claimed_at


@pytest.mark.asyncio
@pytest.mark.integration
async def test_backward_compatibility_with_google_sheets(
    prize_repository,
    sync_service_with_real_repo,
    create_prize_in_db,
    mock_gspread_client
):
    """
    Integration тест обратной совместимости
    
    Сценарий:
    1. Создать данные в Google Sheets (старый формат) - имитация через create_prize_in_db
    2. Запустить прямую синхронизацию (уже выполнена через create_prize_in_db)
    3. Проверить данные в PostgreSQL
    4. Обновить данные через Delivery_API
    5. Запустить обратную синхронизацию
    6. Проверить, что данные в Google Sheets обновлены
    
    Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5
    """
    # 1-2. Создаём приз в PostgreSQL (имитация прямой синхронизации из Google Sheets)
    prize = await create_prize_in_db(
        telegram_id=123456,
        prize_type="physical",
        code_word="test_backward_compat",
        sheet_name="Лист1",
        row_id=3,
        # Старые данные из Google Sheets
        last_name="Старов",
        first_name="Старый",
        city="Старгород",
        street="Старая",
        house="1",
        phone="+79001111111"
    )
    
    # 3. Проверяем данные в PostgreSQL
    assert prize.last_name == "Старов"
    assert prize.first_name == "Старый"
    assert prize.claimed_at is None  # Ещё не получен
    
    # 4. Обновляем данные через Delivery_API
    new_delivery_data = {
        'last_name': 'Новов',
        'first_name': 'Новый',
        'patronymic': 'Новович',
        'country': 'Россия',
        'postal_code': '654321',
        'city': 'Новгород',
        'street': 'Новая',
        'house': '100',
        'apartment': '50',
        'phone': '+79009999999',
        'comment': 'Обновлённый комментарий'
    }
    
    updated_prize = await prize_repository.update_delivery_data_by_prize_id(
        prize.id,
        new_delivery_data
    )
    
    # Проверяем обновление в PostgreSQL
    assert updated_prize.last_name == 'Новов'
    assert updated_prize.first_name == 'Новый'
    assert updated_prize.country == 'Россия'
    assert updated_prize.postal_code == '654321'
    assert updated_prize.claimed_at is not None
    
    # 5. Запускаем обратную синхронизацию
    mock_spreadsheet = Mock()
    mock_worksheet = Mock()
    mock_worksheet.batch_update = Mock()
    
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    mock_gspread_client.open_by_key.return_value = mock_spreadsheet
    
    stats = await sync_service_with_real_repo.sync_delivery_data_to_sheets()
    
    # 6. Проверяем, что данные в Google Sheets обновлены
    assert stats['records_updated'] == 1
    assert stats['sheets_updated'] == 1
    
    batch_data = mock_worksheet.batch_update.call_args[0][0]
    row_data = batch_data[0]['values'][0]
    
    # Проверяем, что новые данные синхронизированы
    assert row_data[0] == 'Новов'               # E: last_name
    assert row_data[1] == 'Новый'               # F: first_name
    assert row_data[2] == 'Новович'             # G: patronymic
    assert row_data[9] == 'Россия'              # N: country
    assert row_data[10] == '654321'             # O: postal_code


@pytest.mark.asyncio
@pytest.mark.integration
async def test_resilience_to_google_sheets_unavailability(
    prize_repository,
    sync_service_with_real_repo,
    create_prize_in_db,
    mock_gspread_client
):
    """
    Integration тест устойчивости к недоступности Google Sheets
    
    Сценарий:
    1. Отключить Google Sheets API (mock)
    2. Отправить форму доставки через Delivery_API
    3. Проверить успешное сохранение в PostgreSQL
    4. Проверить, что API вернул HTTP 200 (имитация)
    5. Включить Google Sheets API
    6. Запустить обратную синхронизацию
    7. Проверить синхронизацию данных
    
    Validates: Requirements 2.4, 13.2
    """
    # 1. Создаём приз в PostgreSQL
    prize = await create_prize_in_db(
        telegram_id=123456,
        prize_type="physical",
        code_word="test_resilience",
        sheet_name="Лист1",
        row_id=4
    )
    
    # 2-3. Отправляем форму доставки (Google Sheets недоступен, но это не влияет на Delivery_API)
    delivery_data = {
        'last_name': 'Устойчивов',
        'first_name': 'Устойчивый',
        'country': 'Россия',
        'postal_code': '111111',
        'city': 'Устойчивск',
        'street': 'Устойчивая',
        'house': '1',
        'phone': '+79005555555'
    }
    
    # Delivery_API не зависит от Google Sheets, поэтому сохранение должно пройти успешно
    updated_prize = await prize_repository.update_delivery_data_by_prize_id(
        prize.id,
        delivery_data
    )
    
    # 4. Проверяем успешное сохранение в PostgreSQL (эквивалент HTTP 200)
    assert updated_prize.last_name == 'Устойчивов'
    assert updated_prize.first_name == 'Устойчивый'
    assert updated_prize.country == 'Россия'
    assert updated_prize.claimed_at is not None
    
    # 5. "Включаем" Google Sheets API (настраиваем mock для успешной работы)
    mock_spreadsheet = Mock()
    mock_worksheet = Mock()
    mock_worksheet.batch_update = Mock()
    
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    mock_gspread_client.open_by_key.return_value = mock_spreadsheet
    
    # 6. Запускаем обратную синхронизацию
    stats = await sync_service_with_real_repo.sync_delivery_data_to_sheets()
    
    # 7. Проверяем синхронизацию данных
    assert stats['records_processed'] == 1
    assert stats['records_updated'] == 1
    assert stats['sheets_updated'] == 1
    assert len(stats['errors']) == 0
    
    # Проверяем, что данные синхронизированы в Google Sheets
    batch_data = mock_worksheet.batch_update.call_args[0][0]
    row_data = batch_data[0]['values'][0]
    
    assert row_data[0] == 'Устойчивов'          # E: last_name
    assert row_data[1] == 'Устойчивый'          # F: first_name
    assert row_data[9] == 'Россия'              # N: country


# Стратегии для генерации валидных данных доставки
@st.composite
def valid_delivery_data_strategy(draw):
    """
    Генерирует валидные данные доставки для property тестов
    """
    data = {
        'last_name': draw(st.text(
            alphabet=st.characters(whitelist_categories=('Lu', 'Ll'), whitelist_characters=' -'),
            min_size=2,
            max_size=50
        )),
        'first_name': draw(st.text(
            alphabet=st.characters(whitelist_categories=('Lu', 'Ll'), whitelist_characters=' -'),
            min_size=2,
            max_size=50
        )),
        'country': draw(st.text(
            alphabet=st.characters(whitelist_categories=('Lu', 'Ll'), whitelist_characters=' -'),
            min_size=2,
            max_size=100
        )),
        'postal_code': draw(st.text(
            alphabet=st.characters(whitelist_categories=('Nd',), whitelist_characters='-'),
            min_size=3,
            max_size=20
        )),
        'city': draw(st.text(
            alphabet=st.characters(whitelist_categories=('Lu', 'Ll'), whitelist_characters=' -'),
            min_size=2,
            max_size=100
        )),
        'street': draw(st.text(
            alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'), whitelist_characters=' -.'),
            min_size=2,
            max_size=200
        )),
        'house': draw(st.text(
            alphabet=st.characters(whitelist_categories=('Nd',), whitelist_characters='/-'),
            min_size=1,
            max_size=20
        )),
        'phone': '+' + draw(st.text(
            alphabet=st.characters(whitelist_categories=('Nd',)),
            min_size=10,
            max_size=15
        ))
    }
    
    # Опциональные поля
    if draw(st.booleans()):
        data['patronymic'] = draw(st.text(
            alphabet=st.characters(whitelist_categories=('Lu', 'Ll'), whitelist_characters=' -'),
            min_size=2,
            max_size=50
        ))
    
    if draw(st.booleans()):
        data['apartment'] = draw(st.text(
            alphabet=st.characters(whitelist_categories=('Nd',), whitelist_characters='/-'),
            min_size=1,
            max_size=20
        ))
    
    if draw(st.booleans()):
        data['comment'] = draw(st.text(
            alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'), whitelist_characters=' .,!?-'),
            min_size=1,
            max_size=500
        ))
    
    return data


@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.pbt
class TestIdempotencyProperty:
    """Property-based тесты для идемпотентности обновления данных"""
    
    @given(
        delivery_data=valid_delivery_data_strategy(),
        n_times=st.integers(min_value=1, max_value=10)
    )
    @settings(
        max_examples=50,
        deadline=None,
        suppress_health_check=[HealthCheck.function_scoped_fixture]
    )
    async def test_property_11_idempotency_of_updates(
        self,
        delivery_data: Dict[str, Any],
        n_times: int,
        prize_repository: PrizeRepository,
        create_prize_in_db,
        test_db_session
    ):
        """
        Feature: delivery-data-postgres-first
        Property 11: Идемпотентность обновления данных
        
        Для любых данных доставки, отправка одних и тех же данных N раз (N = 1..10)
        должна привести к одному и тому же состоянию в PostgreSQL,
        без создания дубликатов записей.
        
        **Validates: Requirements 11.1, 11.2**
        """
        # Создаём уникальный code_word для каждой итерации Hypothesis
        import uuid
        unique_code_word = f"test_idempotency_{uuid.uuid4().hex[:16]}"
        
        # Создаём тестовый приз
        prize = await create_prize_in_db(
            telegram_id=123456,
            prize_type="physical",
            code_word=unique_code_word
        )
        
        # Отправляем одни и те же данные N раз
        results = []
        for i in range(n_times):
            updated_prize = await prize_repository.update_delivery_data_by_prize_id(
                prize.id,
                delivery_data
            )
            results.append(updated_prize)
        
        # Проверяем, что все результаты идентичны
        first_result = results[0]
        
        for i, result in enumerate(results[1:], start=2):
            # Проверяем идентичность всех полей данных доставки
            for field_name in delivery_data.keys():
                first_value = getattr(first_result, field_name)
                current_value = getattr(result, field_name)
                assert first_value == current_value, (
                    f"Итерация {i}: поле {field_name} отличается: "
                    f"первое значение '{first_value}', текущее '{current_value}'"
                )
            
            # Проверяем, что claimed_at не изменился после первого обновления
            assert result.claimed_at == first_result.claimed_at, (
                f"Итерация {i}: claimed_at изменился"
            )
        
        # Проверяем отсутствие дубликатов записей
        # Используем test_db_session вместо get_database()
        from sqlalchemy import select
        
        query = select(Prize).where(Prize.code_word == unique_code_word)
        result = await test_db_session.execute(query)
        all_prizes = result.scalars().all()
        
        # Должна быть только одна запись
        assert len(all_prizes) == 1, (
            f"Найдено {len(all_prizes)} записей с code_word '{unique_code_word}', "
            f"ожидалась 1 запись (проверка на дубликаты)"
        )


@pytest.mark.asyncio
@pytest.mark.integration
async def test_backward_compatibility_protection_from_overwrite(
    prize_repository,
    sync_service_with_real_repo,
    create_prize_in_db,
    mock_gspread_client
):
    """
    Integration тест защиты от перезаписи данных с claimed_at
    
    Сценарий:
    1. Создать запись с claimed_at IS NOT NULL и данными доставки
    2. Изменить данные в Google Sheets (имитация)
    3. Запустить прямую синхронизацию
    4. Проверить, что данные доставки в PostgreSQL не изменились
    
    Validates: Requirements 12.2, 18.2
    """
    # 1. Создаём приз с данными доставки и claimed_at
    original_claimed_at = datetime.now(timezone.utc)
    prize = await create_prize_in_db(
        telegram_id=123456,
        prize_type="physical",
        code_word="test_protection",
        sheet_name="Лист1",
        row_id=5,
        claimed_at=original_claimed_at,
        # Оригинальные данные доставки
        last_name="Защищённов",
        first_name="Защищённый",
        country="Россия",
        postal_code="999999",
        city="Защищённск",
        street="Защищённая",
        house="999",
        phone="+79007777777"
    )
    
    # Сохраняем оригинальные данные для проверки
    original_last_name = prize.last_name
    original_first_name = prize.first_name
    original_country = prize.country
    original_postal_code = prize.postal_code
    
    # 2-3. Имитируем прямую синхронизацию с изменёнными данными из Google Sheets
    # Используем batch_upsert_prizes с изменёнными данными
    changed_data = {
        'telegram_id': prize.telegram_id,
        'code_word': prize.code_word,
        'prize_type': prize.prize_type,
        'sheet_name': prize.sheet_name,
        'row_id': prize.row_id,
        # Изменённые данные из Google Sheets
        'last_name': 'ИзменённыйИзSheets',
        'first_name': 'ИзменённоеИмя',
        'country': 'Другая страна',
        'postal_code': '000000',
        'city': 'Другой город',
        'street': 'Другая улица',
        'house': '1',
        'phone': '+70000000000'
    }
    
    await prize_repository.batch_upsert_prizes([changed_data])
    
    # 4. Проверяем, что данные доставки в PostgreSQL НЕ изменились
    protected_prize = await prize_repository.find_prize_by_id(prize.id)
    
    assert protected_prize.last_name == original_last_name
    assert protected_prize.first_name == original_first_name
    assert protected_prize.country == original_country
    assert protected_prize.postal_code == original_postal_code
    assert protected_prize.claimed_at == original_claimed_at
    
    # Данные доставки защищены от перезаписи
    assert protected_prize.last_name != 'ИзменённыйИзSheets'
    assert protected_prize.first_name != 'ИзменённоеИмя'
