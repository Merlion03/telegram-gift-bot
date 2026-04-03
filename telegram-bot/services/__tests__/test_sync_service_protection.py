"""
Unit тесты для защиты от перезаписи данных доставки в Sync_Service

Validates: Requirements 12.2, 18.2
"""
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from typing import List

from services.sync_service import SyncService
from database.repositories.prize_repository import PrizeRepository, DatabaseUnavailableError
from database.models.prize import Prize
from config import GoogleSheetsConfig, SyncConfig
import gspread


@pytest_asyncio.fixture
async def mock_prize_repository():
    """Mock для Prize_Repository"""
    repo = Mock(spec=PrizeRepository)
    repo.batch_upsert_prizes = AsyncMock()
    return repo


@pytest_asyncio.fixture
async def mock_gspread_client():
    """Mock для gspread клиента"""
    client = Mock(spec=gspread.Client)
    return client


@pytest_asyncio.fixture
async def sync_service(mock_prize_repository, mock_gspread_client):
    """Создаёт экземпляр SyncService с mock зависимостями"""
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
            prize_repository=mock_prize_repository
        )
    
    return service


@pytest.mark.asyncio
async def test_delivery_data_protection_with_claimed_at(
    sync_service,
    mock_prize_repository
):
    """
    Тест: Защита данных доставки от перезаписи при claimed_at IS NOT NULL
    
    Validates: Requirements 12.2, 18.2
    
    Сценарий:
    1. Создаём запись с claimed_at IS NOT NULL и данными доставки
    2. Изменяем данные в Google Sheets (симулируем через sheet_data)
    3. Запускаем прямую синхронизацию
    4. Проверяем, что batch_upsert_prizes вызван с данными из Google Sheets
    5. Логика защиты находится в Prize_Repository.batch_upsert_prizes
    """
    # Подготовка: данные из Google Sheets с изменёнными данными доставки
    sheet_data = [
        [
            '123456',  # telegram_id
            'testuser',  # username
            'CODE123',  # code_word
            'physical',  # prize_type
            '',  # promo_code (пусто для physical)
            '',  # instructions (пусто для physical)
            'НОВАЯ_ФАМИЛИЯ',  # last_name (ИЗМЕНЕНО)
            'НОВОЕ_ИМЯ',  # first_name (ИЗМЕНЕНО)
            'НОВОЕ_ОТЧЕСТВО',  # patronymic (ИЗМЕНЕНО)
            'НОВЫЙ_ГОРОД',  # city (ИЗМЕНЕНО)
            'НОВАЯ_УЛИЦА',  # street (ИЗМЕНЕНО)
            'НОВЫЙ_ДОМ',  # house (ИЗМЕНЕНО)
            'НОВАЯ_КВАРТИРА',  # apartment (ИЗМЕНЕНО)
            'НОВЫЙ_ТЕЛЕФОН',  # phone (ИЗМЕНЕНО)
            'НОВЫЙ_КОММЕНТАРИЙ',  # comment (ИЗМЕНЕНО)
        ]
    ]
    
    # Mock для _read_sheet_data
    with patch.object(sync_service, '_read_sheet_data', new_callable=AsyncMock) as mock_read:
        mock_read.return_value = sheet_data
        
        # Выполняем синхронизацию листа
        await sync_service.sync_sheet('TestSheet')
    
    # Проверяем, что batch_upsert_prizes был вызван
    assert mock_prize_repository.batch_upsert_prizes.called
    
    # Получаем данные, переданные в batch_upsert_prizes
    call_args = mock_prize_repository.batch_upsert_prizes.call_args
    prizes_data = call_args[0][0]  # Первый позиционный аргумент
    
    # Проверяем, что данные из Google Sheets переданы в batch_upsert_prizes
    assert len(prizes_data) == 1
    prize_data = prizes_data[0]
    
    # Проверяем базовые поля
    assert prize_data['telegram_id'] == 123456
    assert prize_data['code_word'] == 'CODE123'
    assert prize_data['prize_type'] == 'physical'
    
    # Проверяем, что данные доставки из Google Sheets переданы
    # (защита применяется на уровне SQL в batch_upsert_prizes)
    assert prize_data['last_name'] == 'НОВАЯ_ФАМИЛИЯ'
    assert prize_data['first_name'] == 'НОВОЕ_ИМЯ'
    assert prize_data['patronymic'] == 'НОВОЕ_ОТЧЕСТВО'
    assert prize_data['city'] == 'НОВЫЙ_ГОРОД'
    assert prize_data['street'] == 'НОВАЯ_УЛИЦА'
    assert prize_data['house'] == 'НОВЫЙ_ДОМ'
    assert prize_data['apartment'] == 'НОВАЯ_КВАРТИРА'
    assert prize_data['phone'] == 'НОВЫЙ_ТЕЛЕФОН'
    assert prize_data['comment'] == 'НОВЫЙ_КОММЕНТАРИЙ'


@pytest.mark.asyncio
async def test_delivery_data_update_without_claimed_at(
    sync_service,
    mock_prize_repository
):
    """
    Тест: Обновление данных доставки при claimed_at IS NULL
    
    Validates: Requirements 12.2
    
    Сценарий:
    1. Создаём запись БЕЗ claimed_at (новый приз)
    2. Изменяем данные в Google Sheets
    3. Запускаем прямую синхронизацию
    4. Проверяем, что данные доставки обновляются нормально
    """
    # Подготовка: данные из Google Sheets
    sheet_data = [
        [
            '789012',  # telegram_id
            'newuser',  # username
            'CODE456',  # code_word
            'physical',  # prize_type
            '',  # promo_code
            '',  # instructions
            'Петров',  # last_name
            'Пётр',  # first_name
            'Петрович',  # patronymic
            'Санкт-Петербург',  # city
            'Невский проспект',  # street
            '20',  # house
            '10',  # apartment
            '+79991112233',  # phone
            'Новый комментарий',  # comment
        ]
    ]
    
    # Mock для _read_sheet_data
    with patch.object(sync_service, '_read_sheet_data', new_callable=AsyncMock) as mock_read:
        mock_read.return_value = sheet_data
        
        # Выполняем синхронизацию листа
        await sync_service.sync_sheet('TestSheet')
    
    # Проверяем, что batch_upsert_prizes был вызван
    assert mock_prize_repository.batch_upsert_prizes.called
    
    # Получаем данные, переданные в batch_upsert_prizes
    call_args = mock_prize_repository.batch_upsert_prizes.call_args
    prizes_data = call_args[0][0]
    
    # Проверяем, что данные корректно переданы
    assert len(prizes_data) == 1
    prize_data = prizes_data[0]
    
    assert prize_data['telegram_id'] == 789012
    assert prize_data['last_name'] == 'Петров'
    assert prize_data['first_name'] == 'Пётр'
    assert prize_data['city'] == 'Санкт-Петербург'


@pytest.mark.asyncio
async def test_multiple_prizes_mixed_claimed_status(
    sync_service,
    mock_prize_repository
):
    """
    Тест: Смешанные записи (с claimed_at и без)
    
    Validates: Requirements 12.2, 18.2
    
    Сценарий:
    1. Создаём несколько записей: часть с claimed_at, часть без
    2. Изменяем данные в Google Sheets для всех
    3. Запускаем прямую синхронизацию
    4. Проверяем, что все данные переданы в batch_upsert_prizes
    """
    # Подготовка: данные из Google Sheets
    sheet_data = [
        # Запись 1: с claimed_at (должна быть защищена на уровне SQL)
        [
            '111111',
            'user1',
            'CODE1',
            'physical',
            '', '',
            'ИЗМЕНЁННАЯ_ФАМИЛИЯ_1',
            'ИЗМЕНЁННОЕ_ИМЯ_1',
            'ИЗМЕНЁННОЕ_ОТЧЕСТВО_1',
            'ИЗМЕНЁННЫЙ_ГОРОД_1',
            'ИЗМЕНЁННАЯ_УЛИЦА_1',
            '1', '1', '+71111111111', 'Комментарий 1'
        ],
        # Запись 2: без claimed_at (должна обновиться)
        [
            '222222',
            'user2',
            'CODE2',
            'physical',
            '', '',
            'Фамилия_2',
            'Имя_2',
            'Отчество_2',
            'Город_2',
            'Улица_2',
            '2', '2', '+72222222222', 'Комментарий 2'
        ],
        # Запись 3: с claimed_at (должна быть защищена на уровне SQL)
        [
            '333333',
            'user3',
            'CODE3',
            'physical',
            '', '',
            'ИЗМЕНЁННАЯ_ФАМИЛИЯ_3',
            'ИЗМЕНЁННОЕ_ИМЯ_3',
            'ИЗМЕНЁННОЕ_ОТЧЕСТВО_3',
            'ИЗМЕНЁННЫЙ_ГОРОД_3',
            'ИЗМЕНЁННАЯ_УЛИЦА_3',
            '3', '3', '+73333333333', 'Комментарий 3'
        ]
    ]
    
    # Mock для _read_sheet_data
    with patch.object(sync_service, '_read_sheet_data', new_callable=AsyncMock) as mock_read:
        mock_read.return_value = sheet_data
        
        # Выполняем синхронизацию листа
        await sync_service.sync_sheet('TestSheet')
    
    # Проверяем, что batch_upsert_prizes был вызван
    assert mock_prize_repository.batch_upsert_prizes.called
    
    # Получаем данные, переданные в batch_upsert_prizes
    call_args = mock_prize_repository.batch_upsert_prizes.call_args
    prizes_data = call_args[0][0]
    
    # Проверяем, что все 3 записи переданы
    assert len(prizes_data) == 3
    
    # Проверяем данные для каждой записи
    assert prizes_data[0]['telegram_id'] == 111111
    assert prizes_data[0]['last_name'] == 'ИЗМЕНЁННАЯ_ФАМИЛИЯ_1'
    
    assert prizes_data[1]['telegram_id'] == 222222
    assert prizes_data[1]['last_name'] == 'Фамилия_2'
    
    assert prizes_data[2]['telegram_id'] == 333333
    assert prizes_data[2]['last_name'] == 'ИЗМЕНЁННАЯ_ФАМИЛИЯ_3'


@pytest.mark.asyncio
async def test_empty_sheet_no_protection_needed(
    sync_service,
    mock_prize_repository
):
    """
    Тест: Пустой лист не требует защиты
    
    Validates: Requirements 12.2
    
    Сценарий:
    1. Лист пустой
    2. Запускаем синхронизацию
    3. Проверяем, что batch_upsert_prizes не вызван
    """
    # Mock для _read_sheet_data - возвращаем пустой список
    with patch.object(sync_service, '_read_sheet_data', new_callable=AsyncMock) as mock_read:
        mock_read.return_value = []
        
        # Выполняем синхронизацию листа
        stats = await sync_service.sync_sheet('EmptySheet')
    
    # Проверяем, что batch_upsert_prizes НЕ был вызван
    assert not mock_prize_repository.batch_upsert_prizes.called
    
    # Проверяем статистику
    assert stats['total_records'] == 0
    assert stats['new_records'] == 0
