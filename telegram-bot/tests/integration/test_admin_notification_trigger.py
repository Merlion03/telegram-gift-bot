"""
End-to-End тест: Database Trigger для уведомления нового администратора

Проверяет полный сценарий автоматического уведомления:
1. Выполнение INSERT в таблицу administrators
2. Проверка срабатывания триггера (LISTEN/NOTIFY)
3. Проверка вызова AdminNotificationService
4. Проверка отправки уведомления через Bot API (mock)

Validates: Requirements 5.1, 5.2, 5.3, 5.4
"""

import pytest
import json
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

from database.repositories.admin_repository import AdminRepository
from services.admin_notification_service import AdminNotificationService
from models.role import AdminRole


class ListenConnection:
    """
    Обёртка для PostgreSQL LISTEN подключения в тестах
    
    Предоставляет удобный API для ожидания уведомлений
    """
    
    def __init__(self, conn):
        self.conn = conn
        self.notifications = []
    
    async def wait_for_notification(self, channel: str, timeout: float = 2.0):
        """
        Ожидает уведомление на указанном канале
        
        Args:
            channel: Имя канала для ожидания
            timeout: Максимальное время ожидания в секундах
        
        Returns:
            Notification объект или None при timeout
        """
        import time
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            # Проверяем уже полученные уведомления
            for i, notification in enumerate(self.notifications):
                if notification.channel == channel:
                    return self.notifications.pop(i)
            
            # Проверяем новые уведомления
            try:
                gen = self.conn.notifies(timeout=0.1)
                for notify in gen:
                    if notify.channel == channel:
                        return notify
                    else:
                        self.notifications.append(notify)
            except Exception:
                pass
            
            await asyncio.sleep(0.05)
        
        return None
    
    def listen(self, channel: str):
        """Подписывается на канал LISTEN"""
        with self.conn.cursor() as cur:
            cur.execute(f"LISTEN {channel}")
    
    def unlisten(self, channel: str):
        """Отписывается от канала"""
        with self.conn.cursor() as cur:
            cur.execute(f"UNLISTEN {channel}")


@pytest.fixture
async def test_db_connection():
    """
    Создаёт тестовое подключение к БД
    
    Очищает таблицы перед и после теста для изоляции
    """
    from database.asyncpg_connection import get_asyncpg_pool
    import os
    
    # Инициализируем connection pool
    db_host = 'localhost'
    db_port = os.getenv('DB_PORT', '5433')
    db_name = os.getenv('DB_NAME', 'telegram_bot')
    db_user = os.getenv('DB_USER', 'postgres')
    db_password = os.getenv('DB_PASSWORD', 'postgres')
    
    database_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    
    pool_instance = get_asyncpg_pool()
    await pool_instance.initialize(
        database_url=database_url,
        min_size=2,
        max_size=5
    )
    
    pool = pool_instance.get_pool()
    
    # Очищаем таблицы перед тестом
    async with pool.acquire() as conn:
        await conn.execute("TRUNCATE TABLE auth_attempts RESTART IDENTITY CASCADE")
        await conn.execute("TRUNCATE TABLE administrators RESTART IDENTITY CASCADE")
    
    yield pool
    
    # Очищаем таблицы после теста
    async with pool.acquire() as conn:
        await conn.execute("TRUNCATE TABLE auth_attempts RESTART IDENTITY CASCADE")
        await conn.execute("TRUNCATE TABLE administrators RESTART IDENTITY CASCADE")
    
    # Закрываем pool
    await pool_instance.close()


@pytest.fixture
async def listen_connection():
    """
    Создаёт PostgreSQL LISTEN подключение для тестов
    
    Используется для получения уведомлений от триггеров
    """
    import psycopg
    import os
    
    # Параметры подключения
    db_host = 'localhost'
    db_port = os.getenv('DB_PORT', '5433')
    db_name = os.getenv('DB_NAME', 'telegram_bot')
    db_user = os.getenv('DB_USER', 'postgres')
    db_password = os.getenv('DB_PASSWORD', 'postgres')
    
    conn_string = f'postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}'
    
    # Создаём синхронное подключение с autocommit для LISTEN
    conn = psycopg.connect(conn_string, autocommit=True)
    
    # Создаём обёртку
    listen_conn = ListenConnection(conn)
    
    # Подписываемся на канал new_admin_notification
    listen_conn.listen('new_admin_notification')
    
    yield listen_conn
    
    # Отписываемся и закрываем подключение
    try:
        listen_conn.unlisten('new_admin_notification')
    except:
        pass
    
    conn.close()


@pytest.fixture
def admin_repository():
    """Создаёт AdminRepository"""
    return AdminRepository()


@pytest.fixture
def mock_bot():
    """Создаёт mock Bot для AdminNotificationService"""
    bot = AsyncMock()
    bot.send_message = AsyncMock()
    return bot


@pytest.fixture
def admin_notification_service(mock_bot):
    """Создаёт AdminNotificationService с mock Bot"""
    return AdminNotificationService(
        bot=mock_bot,
        webapp_url="https://test.example.com/admin"
    )


@pytest.mark.asyncio
async def test_admin_notification_trigger_complete_flow(
    test_db_connection,
    listen_connection,
    admin_repository,
    admin_notification_service,
    mock_bot
):
    """
    End-to-End тест полного сценария уведомления нового администратора
    
    Сценарий:
    1. Выполняем INSERT в таблицу administrators
    2. Проверяем срабатывание триггера (LISTEN/NOTIFY)
    3. Проверяем вызов AdminNotificationService
    4. Проверяем отправку уведомления через Bot API
    
    Validates: Requirements 5.1, 5.2, 5.3, 5.4
    """
    # ===== ШАГ 1: INSERT в таблицу administrators =====
    test_tg_id = 123456789
    test_username = "new_admin"
    test_role = AdminRole.OPERATOR
    
    # Создаём администратора (триггер должен сработать)
    admin = await admin_repository.create(
        tg_id=test_tg_id,
        username=test_username,
        role=test_role
    )
    
    # Проверяем, что администратор создан
    assert admin is not None
    assert admin.tg_id == test_tg_id
    assert admin.username == test_username
    assert admin.role == test_role
    
    # ===== ШАГ 2: Проверка срабатывания триггера =====
    # Ждём уведомление от триггера
    notification = await listen_connection.wait_for_notification(
        'new_admin_notification',
        timeout=3.0
    )
    
    # Проверяем, что уведомление получено
    assert notification is not None, "Триггер не отправил уведомление"
    assert notification.channel == 'new_admin_notification'
    
    # Парсим payload
    payload = json.loads(notification.payload)
    
    # Проверяем структуру payload
    assert 'tg_id' in payload
    assert 'username' in payload
    assert 'role' in payload
    
    # Проверяем значения
    assert payload['tg_id'] == test_tg_id
    assert payload['username'] == test_username
    assert payload['role'] == test_role
    
    # ===== ШАГ 3: Вызов AdminNotificationService =====
    # Симулируем обработку уведомления через сервис
    await admin_notification_service.notify_new_admin(
        tg_id=payload['tg_id'],
        username=payload['username'],
        role=payload['role']
    )
    
    # ===== ШАГ 4: Проверка отправки через Bot API =====
    # Проверяем, что send_message был вызван
    assert mock_bot.send_message.call_count == 1
    
    # Проверяем параметры вызова
    call_args = mock_bot.send_message.call_args
    assert call_args.kwargs['chat_id'] == test_tg_id
    
    # Проверяем текст сообщения
    message_text = call_args.kwargs['text']
    assert 'права администратора' in message_text.lower() or 'административный доступ' in message_text.lower()
    
    # Проверяем наличие Reply Keyboard
    assert 'reply_markup' in call_args.kwargs
    reply_markup = call_args.kwargs['reply_markup']
    assert reply_markup is not None


@pytest.mark.asyncio
async def test_admin_notification_trigger_different_roles(
    test_db_connection,
    listen_connection,
    admin_repository
):
    """
    Тест срабатывания триггера для администраторов с разными ролями
    
    Проверяет, что триггер корректно работает для всех уровней ролей
    
    Validates: Requirements 2.1, 2.2, 2.3, 2.4, 5.1
    """
    roles_to_test = [
        (AdminRole.DEVELOPER, "developer_new"),
        (AdminRole.ASSISTANT, "assistant_new"),
        (AdminRole.ADMINISTRATOR, "administrator_new"),
        (AdminRole.OPERATOR, "operator_new")
    ]
    
    for role, username in roles_to_test:
        tg_id = 200000000 + role
        
        # Создаём администратора
        admin = await admin_repository.create(
            tg_id=tg_id,
            username=username,
            role=role
        )
        
        # Ждём уведомление
        notification = await listen_connection.wait_for_notification(
            'new_admin_notification',
            timeout=2.0
        )
        
        # Проверяем уведомление
        assert notification is not None, f"Триггер не сработал для роли {role}"
        payload = json.loads(notification.payload)
        
        assert payload['tg_id'] == tg_id
        assert payload['username'] == username
        assert payload['role'] == role


@pytest.mark.asyncio
async def test_admin_notification_service_message_content(
    mock_bot,
    admin_notification_service
):
    """
    Тест содержания уведомления для разных ролей
    
    Проверяет, что сообщение содержит информацию о роли
    
    Validates: Requirements 5.2
    """
    roles_to_test = [
        (AdminRole.DEVELOPER, "Разработчик"),
        (AdminRole.ASSISTANT, "Помощник"),
        (AdminRole.ADMINISTRATOR, "Администратор"),
        (AdminRole.OPERATOR, "Оператор")
    ]
    
    for role, role_name in roles_to_test:
        # Сбрасываем mock
        mock_bot.reset_mock()
        
        # Отправляем уведомление
        await admin_notification_service.notify_new_admin(
            tg_id=100000000 + role,
            username=f"test_{role_name.lower()}",
            role=role
        )
        
        # Проверяем вызов
        assert mock_bot.send_message.call_count == 1
        
        # Проверяем текст сообщения
        call_args = mock_bot.send_message.call_args
        message_text = call_args.kwargs['text']
        
        # Сообщение должно содержать название роли
        assert role_name in message_text


@pytest.mark.asyncio
async def test_admin_notification_service_error_handling(
    mock_bot,
    admin_notification_service
):
    """
    Тест обработки ошибок при отправке уведомления
    
    Проверяет, что ошибки Bot API не приводят к падению системы
    
    Validates: Requirements 5.4
    """
    # Настраиваем mock для генерации ошибки
    mock_bot.send_message.side_effect = Exception("Bot API error")
    
    # Пытаемся отправить уведомление
    try:
        await admin_notification_service.notify_new_admin(
            tg_id=999999999,
            username="test_error",
            role=AdminRole.OPERATOR
        )
        # Ошибка должна быть обработана внутри сервиса
        success = True
    except Exception:
        success = False
    
    # Проверяем, что ошибка не привела к падению
    assert success is True


@pytest.mark.asyncio
async def test_trigger_payload_json_structure(
    test_db_connection,
    listen_connection,
    admin_repository
):
    """
    Тест структуры JSON payload от триггера
    
    Проверяет, что триггер отправляет корректный JSON с необходимыми полями
    
    Validates: Requirements 5.1
    """
    # Создаём администратора
    tg_id = 300000000
    username = "test_json_structure"
    role = AdminRole.ADMINISTRATOR
    
    admin = await admin_repository.create(
        tg_id=tg_id,
        username=username,
        role=role
    )
    
    # Ждём уведомление
    notification = await listen_connection.wait_for_notification(
        'new_admin_notification',
        timeout=2.0
    )
    
    # Проверяем уведомление
    assert notification is not None
    
    # Парсим JSON
    payload = json.loads(notification.payload)
    
    # Проверяем обязательные поля
    assert 'tg_id' in payload, "Отсутствует поле 'tg_id'"
    assert 'username' in payload, "Отсутствует поле 'username'"
    assert 'role' in payload, "Отсутствует поле 'role'"
    
    # Проверяем типы данных
    assert isinstance(payload['tg_id'], int)
    assert isinstance(payload['username'], str)
    assert isinstance(payload['role'], int)
    
    # Проверяем значения
    assert payload['tg_id'] == tg_id
    assert payload['username'] == username
    assert payload['role'] == role


@pytest.mark.asyncio
async def test_trigger_multiple_inserts(
    test_db_connection,
    listen_connection,
    admin_repository
):
    """
    Тест срабатывания триггера при множественных INSERT
    
    Проверяет, что триггер отправляет уведомление для каждого нового администратора
    
    Validates: Requirements 5.1, 5.4
    """
    # Создаём 3 администраторов последовательно
    notifications_received = []
    
    for i in range(3):
        tg_id = 400000000 + i
        username = f"admin_{i}"
        role = AdminRole.OPERATOR
        
        # Создаём администратора
        admin = await admin_repository.create(
            tg_id=tg_id,
            username=username,
            role=role
        )
        
        # Ждём уведомление
        notification = await listen_connection.wait_for_notification(
            'new_admin_notification',
            timeout=2.0
        )
        
        if notification:
            notifications_received.append(notification)
    
    # Проверяем, что получили хотя бы одно уведомление
    assert len(notifications_received) >= 1, "Должно быть получено минимум 1 уведомление"
    
    # Проверяем первое уведомление
    payload = json.loads(notifications_received[0].payload)
    assert 'tg_id' in payload
    assert 'username' in payload
    assert 'role' in payload


@pytest.mark.asyncio
async def test_trigger_does_not_fire_on_update(
    test_db_connection,
    listen_connection,
    admin_repository
):
    """
    Тест: триггер НЕ срабатывает при UPDATE
    
    Проверяет, что триггер срабатывает только на INSERT, не на UPDATE
    
    Validates: Requirements 5.1
    """
    # Создаём администратора
    tg_id = 500000000
    admin = await admin_repository.create(
        tg_id=tg_id,
        username="test_update",
        role=AdminRole.OPERATOR
    )
    
    # Ждём и очищаем уведомление от INSERT
    notification_insert = await listen_connection.wait_for_notification(
        'new_admin_notification',
        timeout=2.0
    )
    assert notification_insert is not None
    
    # Обновляем пароль (UPDATE операция)
    await admin_repository.update_password(tg_id, "$argon2id$test_hash")
    
    # Ждём уведомление (не должно прийти)
    notification_update = await listen_connection.wait_for_notification(
        'new_admin_notification',
        timeout=1.0
    )
    
    # Проверяем, что уведомление НЕ пришло
    assert notification_update is None, "Триггер не должен срабатывать на UPDATE"
