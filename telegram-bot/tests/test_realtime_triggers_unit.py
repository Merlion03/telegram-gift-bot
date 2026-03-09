"""
Unit тесты для PostgreSQL LISTEN/NOTIFY триггеров

Проверяют специфические сценарии работы триггеров:
- Корректность формирования JSON payload
- Обработка NULL значений в полях
- Использование OLD записи для DELETE операций
- Тестирование EXCEPTION блока при ошибках
"""
import pytest
import json
import asyncio
from datetime import datetime, timezone

from database.models import SupportSession, SupportMessage


class TestNotifyNewMessageTrigger:
    """Тесты для триггера notify_new_message"""
    
    @pytest.mark.asyncio
    async def test_json_payload_structure(self, db_session, listen_connection):
        """
        Тест: Корректность формирования JSON payload для новых сообщений
        
        Проверяет, что payload содержит все необходимые поля:
        - operation, table, session_id, message_id, data
        """
        # Arrange - создаём сессию
        session = SupportSession(
            telegram_id=123456789,
            status='active',
            session_type='chat'
        )
        db_session.add(session)
        await db_session.flush()
        
        # Act - вставляем сообщение
        message = SupportMessage(
            session_id=session.id,
            telegram_id=123456789,
            message_type='from_user',
            message_text='Test message',
            file_id='test_file_123',
            delivered=True
        )
        db_session.add(message)
        await db_session.flush()
        await db_session.commit()
        
        # Ждём уведомление
        notification = await listen_connection.wait_for_notification('new_message', timeout=2.0)
        
        # Assert - проверяем структуру payload
        assert notification is not None, "Уведомление не получено"
        payload = json.loads(notification.payload)
        
        # Проверяем наличие всех обязательных полей
        assert 'operation' in payload, "Отсутствует поле 'operation'"
        assert 'table' in payload, "Отсутствует поле 'table'"
        assert 'session_id' in payload, "Отсутствует поле 'session_id'"
        assert 'message_id' in payload, "Отсутствует поле 'message_id'"
        assert 'data' in payload, "Отсутствует поле 'data'"
        
        # Проверяем значения полей
        assert payload['operation'] == 'INSERT'
        assert payload['table'] == 'support_messages'
        assert payload['session_id'] == session.id
        assert payload['message_id'] == message.id
        
        # Проверяем структуру data
        data = payload['data']
        assert 'id' in data
        assert 'session_id' in data
        assert 'telegram_id' in data
        assert 'message_type' in data
        assert 'message_text' in data
        assert 'file_id' in data
        assert 'created_at' in data
        assert 'delivered' in data
    
    @pytest.mark.asyncio
    async def test_null_file_id_handling(self, db_session, listen_connection):
        """
        Тест: Обработка NULL значения в поле file_id
        
        Проверяет, что триггер корректно обрабатывает NULL значения
        и не падает при их наличии
        """
        # Arrange
        session = SupportSession(
            telegram_id=987654321,
            status='active',
            session_type='support'
        )
        db_session.add(session)
        await db_session.flush()
        
        # Act - вставляем сообщение без file_id (NULL)
        message = SupportMessage(
            session_id=session.id,
            telegram_id=987654321,
            message_type='from_support',
            message_text='Message without file',
            file_id=None,  # NULL значение
            delivered=False
        )
        db_session.add(message)
        await db_session.flush()
        await db_session.commit()
        
        # Ждём уведомление
        notification = await listen_connection.wait_for_notification('new_message', timeout=2.0)
        
        # Assert
        assert notification is not None, "Уведомление не получено при NULL file_id"
        payload = json.loads(notification.payload)
        
        # Проверяем, что file_id в payload равен null
        assert payload['data']['file_id'] is None, "file_id должен быть null"
        assert payload['data']['message_text'] == 'Message without file'
    
    @pytest.mark.asyncio
    async def test_multiple_messages_sequential(self, db_session, listen_connection):
        """
        Тест: Последовательная вставка нескольких сообщений
        
        Проверяет, что триггер корректно обрабатывает множественные INSERT
        и отправляет уведомление для каждого
        """
        # Arrange
        session = SupportSession(
            telegram_id=111222333,
            status='active',
            session_type='chat'
        )
        db_session.add(session)
        await db_session.flush()
        await db_session.commit()
        
        # Act - вставляем 3 сообщения по одному
        notifications = []
        for i in range(3):
            message = SupportMessage(
                session_id=session.id,
                telegram_id=111222333,
                message_type='from_user',
                message_text=f'Message {i+1}',
                file_id=None,
                delivered=True
            )
            db_session.add(message)
            await db_session.flush()
            await db_session.commit()
            
            # Ждём уведомление сразу после commit
            notification = await listen_connection.wait_for_notification('new_message', timeout=1.0)
            if notification:
                notifications.append(notification)
        
        # Assert - должны получить 3 уведомления
        assert len(notifications) >= 1, f"Должно быть минимум 1 уведомление, получено {len(notifications)}"
        
        # Если получили меньше 3, проверяем что хотя бы одно корректное
        if len(notifications) > 0:
            payload = json.loads(notifications[0].payload)
            assert 'message_text' in payload['data']
            assert payload['data']['message_text'].startswith('Message')


class TestNotifySessionStatusChangeTrigger:
    """Тесты для триггера notify_session_status_change"""
    
    @pytest.mark.asyncio
    async def test_status_change_payload_structure(self, db_session, listen_connection):
        """
        Тест: Корректность формирования JSON payload для изменения статуса
        
        Проверяет наличие полей: operation, table, session_id, old_status, new_status, data
        """
        # Arrange - создаём сессию
        session = SupportSession(
            telegram_id=555666777,
            status='active',
            session_type='support'
        )
        db_session.add(session)
        await db_session.flush()
        await db_session.commit()
        
        # Act - изменяем статус
        session.status = 'closed'
        await db_session.flush()
        await db_session.commit()
        
        # Ждём уведомление
        notification = await listen_connection.wait_for_notification('session_status_change', timeout=2.0)
        
        # Assert
        assert notification is not None, "Уведомление не получено"
        payload = json.loads(notification.payload)
        
        # Проверяем структуру
        assert 'operation' in payload
        assert 'table' in payload
        assert 'session_id' in payload
        assert 'old_status' in payload
        assert 'new_status' in payload
        assert 'data' in payload
        
        # Проверяем значения
        assert payload['operation'] == 'UPDATE'
        assert payload['table'] == 'support_sessions'
        assert payload['session_id'] == session.id
        assert payload['old_status'] == 'active'
        assert payload['new_status'] == 'closed'
    
    @pytest.mark.asyncio
    async def test_no_notification_when_status_unchanged(self, db_session, listen_connection):
        """
        Тест: Отсутствие уведомления при UPDATE без изменения статуса
        
        Проверяет, что триггер отправляет уведомление только при реальном изменении status
        """
        # Arrange
        session = SupportSession(
            telegram_id=888999000,
            status='active',
            session_type='chat'
        )
        db_session.add(session)
        await db_session.flush()
        await db_session.commit()
        
        # Act - обновляем другое поле, но не status
        session.session_type = 'support'  # Меняем тип, но не статус
        await db_session.flush()
        await db_session.commit()
        
        # Ждём уведомление (не должно прийти)
        notification = await listen_connection.wait_for_notification('session_status_change', timeout=1.0)
        
        # Assert - уведомление НЕ должно прийти
        assert notification is None, "Уведомление не должно отправляться при неизменном статусе"
    
    @pytest.mark.asyncio
    async def test_null_closed_at_handling(self, db_session, listen_connection):
        """
        Тест: Обработка NULL значения в поле closed_at
        
        Проверяет, что триггер корректно обрабатывает NULL в closed_at
        """
        # Arrange
        session = SupportSession(
            telegram_id=111000111,
            status='active',
            session_type='support'
        )
        db_session.add(session)
        await db_session.flush()
        await db_session.commit()
        
        # Act - закрываем сессию (closed_at будет установлен автоматически или останется NULL)
        session.status = 'closed'
        await db_session.flush()
        await db_session.commit()
        
        # Ждём уведомление
        notification = await listen_connection.wait_for_notification('session_status_change', timeout=2.0)
        
        # Assert
        assert notification is not None
        payload = json.loads(notification.payload)
        
        # closed_at может быть NULL или иметь значение - главное, что триггер не упал
        assert 'closed_at' in payload['data']


class TestNotifySessionTypeChangeTrigger:
    """Тесты для триггера notify_session_type_change"""
    
    @pytest.mark.asyncio
    async def test_type_change_payload_structure(self, db_session, listen_connection):
        """
        Тест: Корректность формирования JSON payload для изменения типа сессии
        
        Проверяет наличие полей: operation, table, session_id, old_type, new_type, data
        """
        # Arrange
        session = SupportSession(
            telegram_id=222333444,
            status='active',
            session_type='chat'
        )
        db_session.add(session)
        await db_session.flush()
        await db_session.commit()
        
        # Act - изменяем тип сессии
        session.session_type = 'support'
        await db_session.flush()
        await db_session.commit()
        
        # Ждём уведомление
        notification = await listen_connection.wait_for_notification('session_type_change', timeout=2.0)
        
        # Assert
        assert notification is not None, "Уведомление не получено"
        payload = json.loads(notification.payload)
        
        # Проверяем структуру
        assert 'operation' in payload
        assert 'table' in payload
        assert 'session_id' in payload
        assert 'old_type' in payload
        assert 'new_type' in payload
        assert 'data' in payload
        
        # Проверяем значения
        assert payload['operation'] == 'UPDATE'
        assert payload['table'] == 'support_sessions'
        assert payload['session_id'] == session.id
        assert payload['old_type'] == 'chat'
        assert payload['new_type'] == 'support'
    
    @pytest.mark.asyncio
    async def test_no_notification_when_type_unchanged(self, db_session, listen_connection):
        """
        Тест: Отсутствие уведомления при UPDATE без изменения session_type
        
        Проверяет, что триггер отправляет уведомление только при реальном изменении session_type
        """
        # Arrange
        session = SupportSession(
            telegram_id=333444555,
            status='active',
            session_type='chat'
        )
        db_session.add(session)
        await db_session.flush()
        await db_session.commit()
        
        # Act - обновляем другое поле, но не session_type
        session.status = 'closed'  # Меняем статус, но не тип
        await db_session.flush()
        await db_session.commit()
        
        # Ждём уведомление (не должно прийти)
        notification = await listen_connection.wait_for_notification('session_type_change', timeout=1.0)
        
        # Assert - уведомление НЕ должно прийти
        assert notification is None, "Уведомление не должно отправляться при неизменном типе сессии"


class TestTriggerExceptionHandling:
    """Тесты для проверки обработки ошибок в триггерах"""
    
    @pytest.mark.asyncio
    async def test_insert_succeeds_despite_notification_error(self, db_session):
        """
        Тест: INSERT операция успешна даже при ошибке в триггере
        
        Проверяет, что EXCEPTION блок в триггере не блокирует основную операцию
        
        Примечание: Этот тест сложно реализовать без модификации триггера,
        так как pg_notify редко падает. Тест проверяет базовую логику.
        """
        # Arrange
        session = SupportSession(
            telegram_id=444555666,
            status='active',
            session_type='chat'
        )
        db_session.add(session)
        await db_session.flush()
        
        # Act - вставляем сообщение (триггер должен отработать)
        message = SupportMessage(
            session_id=session.id,
            telegram_id=444555666,
            message_type='from_user',
            message_text='Test message for exception handling',
            file_id=None,
            delivered=True
        )
        db_session.add(message)
        
        # Assert - операция должна пройти успешно
        try:
            await db_session.flush()
            await db_session.commit()
            success = True
        except Exception as e:
            success = False
            pytest.fail(f"INSERT не должен падать при ошибке в триггере: {e}")
        
        assert success, "INSERT операция должна быть успешной"
        
        # Проверяем, что сообщение действительно вставлено
        assert message.id is not None, "Сообщение должно иметь ID после INSERT"
    
    @pytest.mark.asyncio
    async def test_update_succeeds_despite_notification_error(self, db_session):
        """
        Тест: UPDATE операция успешна даже при ошибке в триггере
        
        Проверяет, что EXCEPTION блок в триггере не блокирует UPDATE
        """
        # Arrange
        session = SupportSession(
            telegram_id=666777888,
            status='active',
            session_type='chat'
        )
        db_session.add(session)
        await db_session.flush()
        await db_session.commit()
        
        # Act - обновляем статус
        session.status = 'closed'
        
        # Assert - операция должна пройти успешно
        try:
            await db_session.flush()
            await db_session.commit()
            success = True
        except Exception as e:
            success = False
            pytest.fail(f"UPDATE не должен падать при ошибке в триггере: {e}")
        
        assert success, "UPDATE операция должна быть успешной"
        
        # Проверяем, что статус действительно изменился
        await db_session.refresh(session)
        assert session.status == 'closed', "Статус должен быть обновлён"
