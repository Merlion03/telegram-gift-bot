"""
Integration тесты для полного цикла синхронизации

Проверяет полный цикл: создание тестового листа → синхронизация → проверка данных в PostgreSQL → удаление листа
"""
import pytest
import asyncio
import time
import os
from typing import List, Dict, Any

import gspread
from google.oauth2.service_account import Credentials

from config import get_config
from services.sync_service import SyncService
from database.repositories.prize_repository import PrizeRepository
from database.connection import get_database


@pytest.fixture(scope="session", autouse=True)
def reload_env():
    """Перезагружает переменные окружения перед тестами"""
    from dotenv import load_dotenv
    import config
    
    # Перезагружаем .env
    load_dotenv(override=True)
    
    # Сбрасываем кэш конфигурации
    config.config = None


@pytest.fixture(autouse=True)
async def init_db():
    """Инициализирует подключение к базе данных для тестов"""
    from database.connection import init_database, get_database
    from config import get_config
    
    config = get_config()
    
    # Инициализируем БД (синхронная функция)
    init_database(
        database_url=config.database.connection_url,
        pool_size=config.database.pool_size,
        max_overflow=config.database.max_overflow,
        pool_pre_ping=config.database.pool_pre_ping
    )
    
    yield
    
    # Закрываем подключение после теста
    await get_database().close()


@pytest.fixture
async def test_worksheet_name():
    """Генерирует уникальное имя для тестового листа"""
    return f"test_sync_{int(time.time())}"


@pytest.fixture
async def gspread_client():
    """Создает клиент gspread для управления тестовыми листами"""
    config = get_config()
    
    scopes = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]
    
    credentials = Credentials.from_service_account_file(
        config.google_sheets.credentials_path,
        scopes=scopes
    )
    
    client = gspread.authorize(credentials)
    return client


@pytest.fixture
async def test_spreadsheet(gspread_client):
    """Открывает тестовую таблицу"""
    config = get_config()
    return gspread_client.open_by_key(config.google_sheets.spreadsheet_id)


def create_test_worksheet(
    spreadsheet: gspread.Spreadsheet,
    worksheet_name: str,
    test_data: List[List[Any]]
) -> gspread.Worksheet:
    """
    Создает тестовый лист с данными
    
    Args:
        spreadsheet: Объект таблицы
        worksheet_name: Имя листа
        test_data: Данные для заполнения (включая заголовки)
    
    Returns:
        Созданный worksheet
    """
    # Создаем новый лист
    worksheet = spreadsheet.add_worksheet(
        title=worksheet_name,
        rows=len(test_data) + 10,
        cols=13  # A-M столбцы
    )
    
    # Заполняем данные
    if test_data:
        worksheet.update(values=test_data, range_name=f'A1:M{len(test_data)}')
    
    return worksheet


def delete_test_worksheet(
    spreadsheet: gspread.Spreadsheet,
    worksheet_name: str
):
    """
    Удаляет тестовый лист
    
    Args:
        spreadsheet: Объект таблицы
        worksheet_name: Имя листа для удаления
    """
    try:
        worksheet = spreadsheet.worksheet(worksheet_name)
        spreadsheet.del_worksheet(worksheet)
    except gspread.exceptions.WorksheetNotFound:
        pass  # Лист уже удален


@pytest.mark.asyncio
async def test_full_sync_cycle_digital_prizes(
    test_worksheet_name,
    gspread_client,
    test_spreadsheet
):
    """
    Feature: telegram-bot-postgres-sync
    Integration Test: Полный цикл синхронизации для цифровых призов
    
    Validates: Requirements 2.1, 2.2, 2.3, 2.4
    
    Проверяет:
    1. Создание тестового листа с цифровыми призами
    2. Запуск синхронизации
    3. Проверку данных в PostgreSQL
    4. Удаление тестового листа
    """
    config = get_config()
    prize_repository = PrizeRepository()
    
    # Подготовка тестовых данных
    test_data = [
        # Заголовки
        ['telegram_id', 'prize_type', 'promo_code', 'instructions', 'last_name', 'first_name', 'patronymic', 'city', 'street', 'house', 'apartment', 'phone', 'comment'],
        # Цифровые призы
        ['123456789', 'digital', 'PROMO123', 'Используйте промокод на сайте example.com', '', '', '', '', '', '', '', '', ''],
        ['987654321', 'digital', 'PROMO456', 'Активируйте код в приложении', '', '', '', '', '', '', '', '', ''],
        ['555555555', 'digital', 'PROMO789', 'Введите код при оформлении заказа', '', '', '', '', '', '', '', '', ''],
    ]
    
    worksheet = None
    
    try:
        # Шаг 1: Создаем тестовый лист
        print(f"\n[TEST] Создание тестового листа: {test_worksheet_name}")
        loop = asyncio.get_event_loop()
        worksheet = await loop.run_in_executor(
            None,
            create_test_worksheet,
            test_spreadsheet,
            test_worksheet_name,
            test_data
        )
        
        # Даем Google Sheets время на обработку
        await asyncio.sleep(2)
        
        # Шаг 2: Запускаем синхронизацию
        print(f"[TEST] Запуск синхронизации")
        sync_service = SyncService(
            google_sheets_config=config.google_sheets,
            sync_config=config.sync,
            prize_repository=prize_repository
        )
        
        stats = await sync_service.sync_sheet(test_worksheet_name)
        
        print(f"[TEST] Статистика синхронизации: {stats}")
        
        # Проверяем статистику
        assert stats['total_records'] == 3, f"Ожидалось 3 записи, получено {stats['total_records']}"
        assert stats['elapsed_seconds'] < 30, f"Синхронизация заняла слишком много времени: {stats['elapsed_seconds']}s"
        
        # Шаг 3: Проверяем данные в PostgreSQL
        print(f"[TEST] Проверка данных в PostgreSQL")
        
        # Проверяем первый приз
        prize1 = await prize_repository.find_prize(123456789, test_worksheet_name)
        assert prize1 is not None, "Приз 1 не найден в БД"
        assert prize1.telegram_id == 123456789
        assert prize1.prize_type == 'digital'
        assert prize1.promo_code == 'PROMO123'
        assert prize1.instructions == 'Используйте промокод на сайте example.com'
        assert prize1.sheet_name == test_worksheet_name
        assert prize1.code_word == test_worksheet_name
        assert prize1.row_id == 2  # Вторая строка (первая - заголовки)
        
        # Проверяем второй приз
        prize2 = await prize_repository.find_prize(987654321, test_worksheet_name)
        assert prize2 is not None, "Приз 2 не найден в БД"
        assert prize2.telegram_id == 987654321
        assert prize2.prize_type == 'digital'
        assert prize2.promo_code == 'PROMO456'
        assert prize2.row_id == 3
        
        # Проверяем третий приз
        prize3 = await prize_repository.find_prize(555555555, test_worksheet_name)
        assert prize3 is not None, "Приз 3 не найден в БД"
        assert prize3.telegram_id == 555555555
        assert prize3.prize_type == 'digital'
        assert prize3.promo_code == 'PROMO789'
        assert prize3.row_id == 4
        
        print(f"[TEST] ✓ Все данные корректно синхронизированы")
        
    finally:
        # Шаг 4: Удаляем тестовый лист
        if worksheet:
            print(f"[TEST] Удаление тестового листа")
            await loop.run_in_executor(
                None,
                delete_test_worksheet,
                test_spreadsheet,
                test_worksheet_name
            )


@pytest.mark.asyncio
async def test_full_sync_cycle_physical_prizes(
    test_worksheet_name,
    gspread_client,
    test_spreadsheet
):
    """
    Feature: telegram-bot-postgres-sync
    Integration Test: Полный цикл синхронизации для физических призов
    
    Validates: Requirements 2.1, 2.2, 2.3, 2.4
    
    Проверяет синхронизацию физических призов с данными доставки
    """
    config = get_config()
    prize_repository = PrizeRepository()
    
    # Подготовка тестовых данных
    test_data = [
        # Заголовки
        ['telegram_id', 'prize_type', 'promo_code', 'instructions', 'last_name', 'first_name', 'patronymic', 'city', 'street', 'house', 'apartment', 'phone', 'comment'],
        # Физические призы с данными доставки
        ['111111111', 'physical', '', '', 'Иванов', 'Иван', 'Иванович', 'Москва', 'Ленина', '10', '5', '+79991234567', 'Позвонить перед доставкой'],
        ['222222222', 'physical', '', '', 'Петров', 'Петр', 'Петрович', 'Санкт-Петербург', 'Невский проспект', '20', '', '+79997654321', ''],
    ]
    
    worksheet = None
    
    try:
        # Создаем тестовый лист
        print(f"\n[TEST] Создание тестового листа: {test_worksheet_name}")
        loop = asyncio.get_event_loop()
        worksheet = await loop.run_in_executor(
            None,
            create_test_worksheet,
            test_spreadsheet,
            test_worksheet_name,
            test_data
        )
        
        await asyncio.sleep(2)
        
        # Запускаем синхронизацию
        print(f"[TEST] Запуск синхронизации")
        sync_service = SyncService(
            google_sheets_config=config.google_sheets,
            sync_config=config.sync,
            prize_repository=prize_repository
        )
        
        stats = await sync_service.sync_sheet(test_worksheet_name)
        
        print(f"[TEST] Статистика синхронизации: {stats}")
        
        # Проверяем статистику
        assert stats['total_records'] == 2
        
        # Проверяем данные в PostgreSQL
        print(f"[TEST] Проверка данных в PostgreSQL")
        
        # Проверяем первый физический приз
        prize1 = await prize_repository.find_prize(111111111, test_worksheet_name)
        assert prize1 is not None
        assert prize1.prize_type == 'physical'
        assert prize1.last_name == 'Иванов'
        assert prize1.first_name == 'Иван'
        assert prize1.patronymic == 'Иванович'
        assert prize1.city == 'Москва'
        assert prize1.street == 'Ленина'
        assert prize1.house == '10'
        assert prize1.apartment == '5'
        assert prize1.phone == '+79991234567'
        assert prize1.comment == 'Позвонить перед доставкой'
        
        # Проверяем второй физический приз
        prize2 = await prize_repository.find_prize(222222222, test_worksheet_name)
        assert prize2 is not None
        assert prize2.prize_type == 'physical'
        assert prize2.last_name == 'Петров'
        assert prize2.city == 'Санкт-Петербург'
        
        print(f"[TEST] ✓ Все данные корректно синхронизированы")
        
    finally:
        # Удаляем тестовый лист
        if worksheet:
            print(f"[TEST] Удаление тестового листа")
            await loop.run_in_executor(
                None,
                delete_test_worksheet,
                test_spreadsheet,
                test_worksheet_name
            )


@pytest.mark.asyncio
async def test_sync_idempotency(
    test_worksheet_name,
    gspread_client,
    test_spreadsheet
):
    """
    Feature: telegram-bot-postgres-sync
    Integration Test: Идемпотентность синхронизации
    
    Validates: Requirements 2.4, 8.6
    
    Проверяет, что повторная синхронизация не создает дубликаты
    """
    config = get_config()
    prize_repository = PrizeRepository()
    
    test_data = [
        ['telegram_id', 'prize_type', 'promo_code', 'instructions', 'last_name', 'first_name', 'patronymic', 'city', 'street', 'house', 'apartment', 'phone', 'comment'],
        ['999999999', 'digital', 'IDEMPOTENT', 'Test idempotency', '', '', '', '', '', '', '', '', ''],
    ]
    
    worksheet = None
    
    try:
        # Создаем тестовый лист
        print(f"\n[TEST] Создание тестового листа: {test_worksheet_name}")
        loop = asyncio.get_event_loop()
        worksheet = await loop.run_in_executor(
            None,
            create_test_worksheet,
            test_spreadsheet,
            test_worksheet_name,
            test_data
        )
        
        await asyncio.sleep(2)
        
        sync_service = SyncService(
            google_sheets_config=config.google_sheets,
            sync_config=config.sync,
            prize_repository=prize_repository
        )
        
        # Первая синхронизация
        print(f"[TEST] Первая синхронизация")
        stats1 = await sync_service.sync_sheet(test_worksheet_name)
        assert stats1['total_records'] == 1
        
        prize_after_first = await prize_repository.find_prize(999999999, test_worksheet_name)
        assert prize_after_first is not None
        first_id = prize_after_first.id
        first_created_at = prize_after_first.created_at
        
        # Вторая синхронизация (должна обновить, а не создать новую запись)
        print(f"[TEST] Вторая синхронизация")
        await asyncio.sleep(1)
        stats2 = await sync_service.sync_sheet(test_worksheet_name)
        assert stats2['total_records'] == 1
        
        prize_after_second = await prize_repository.find_prize(999999999, test_worksheet_name)
        assert prize_after_second is not None
        
        # Проверяем идемпотентность
        assert prize_after_second.id == first_id, "ID должен остаться тем же (не создана новая запись)"
        assert prize_after_second.created_at == first_created_at, "created_at не должен измениться"
        assert prize_after_second.updated_at > first_created_at, "updated_at должен обновиться"
        
        print(f"[TEST] ✓ Идемпотентность подтверждена")
        
    finally:
        if worksheet:
            print(f"[TEST] Удаление тестового листа")
            await loop.run_in_executor(
                None,
                delete_test_worksheet,
                test_spreadsheet,
                test_worksheet_name
            )


@pytest.mark.asyncio
async def test_sync_all_sheets_integration(
    test_worksheet_name,
    gspread_client,
    test_spreadsheet
):
    """
    Feature: telegram-bot-postgres-sync
    Integration Test: Синхронизация всех листов
    
    Validates: Requirements 2.1, 2.2
    
    Проверяет синхронизацию нескольких листов одновременно
    """
    config = get_config()
    prize_repository = PrizeRepository()
    
    # Создаем два тестовых листа
    worksheet1_name = f"{test_worksheet_name}_1"
    worksheet2_name = f"{test_worksheet_name}_2"
    
    test_data1 = [
        ['telegram_id', 'prize_type', 'promo_code', 'instructions', 'last_name', 'first_name', 'patronymic', 'city', 'street', 'house', 'apartment', 'phone', 'comment'],
        ['111111111', 'digital', 'SHEET1', 'From sheet 1', '', '', '', '', '', '', '', '', ''],
    ]
    
    test_data2 = [
        ['telegram_id', 'prize_type', 'promo_code', 'instructions', 'last_name', 'first_name', 'patronymic', 'city', 'street', 'house', 'apartment', 'phone', 'comment'],
        ['222222222', 'digital', 'SHEET2', 'From sheet 2', '', '', '', '', '', '', '', '', ''],
    ]
    
    worksheet1 = None
    worksheet2 = None
    
    try:
        # Создаем листы
        print(f"\n[TEST] Создание тестовых листов")
        loop = asyncio.get_event_loop()
        
        worksheet1 = await loop.run_in_executor(
            None,
            create_test_worksheet,
            test_spreadsheet,
            worksheet1_name,
            test_data1
        )
        
        worksheet2 = await loop.run_in_executor(
            None,
            create_test_worksheet,
            test_spreadsheet,
            worksheet2_name,
            test_data2
        )
        
        await asyncio.sleep(2)
        
        # Запускаем синхронизацию всех листов
        print(f"[TEST] Запуск синхронизации всех листов")
        sync_service = SyncService(
            google_sheets_config=config.google_sheets,
            sync_config=config.sync,
            prize_repository=prize_repository
        )
        
        stats = await sync_service.sync_all_sheets()
        
        print(f"[TEST] Статистика синхронизации: {stats}")
        
        # Проверяем, что оба листа синхронизированы
        assert stats['sheets_processed'] >= 2, "Должно быть синхронизировано минимум 2 листа"
        
        # Проверяем данные из первого листа
        prize1 = await prize_repository.find_prize(111111111, worksheet1_name)
        assert prize1 is not None
        assert prize1.promo_code == 'SHEET1'
        assert prize1.sheet_name == worksheet1_name
        
        # Проверяем данные из второго листа
        prize2 = await prize_repository.find_prize(222222222, worksheet2_name)
        assert prize2 is not None
        assert prize2.promo_code == 'SHEET2'
        assert prize2.sheet_name == worksheet2_name
        
        print(f"[TEST] ✓ Все листы корректно синхронизированы")
        
    finally:
        # Удаляем тестовые листы
        if worksheet1:
            print(f"[TEST] Удаление тестового листа 1")
            await loop.run_in_executor(
                None,
                delete_test_worksheet,
                test_spreadsheet,
                worksheet1_name
            )
        
        if worksheet2:
            print(f"[TEST] Удаление тестового листа 2")
            await loop.run_in_executor(
                None,
                delete_test_worksheet,
                test_spreadsheet,
                worksheet2_name
            )
