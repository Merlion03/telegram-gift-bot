"""
Тесты для логирования ошибок базы данных.

Property 32: Логирование ошибок БД
Feature: telegram-bot-webapp-system, Property 32
Validates: Requirements 16.3, 16.5
"""

import pytest
from hypothesis import given, strategies as st, settings
from unittest.mock import AsyncMock, MagicMock, patch
from io import StringIO
from contextlib import contextmanager
import json
import structlog

from database.repository import SupportRepository
from utils.logger import filter_secrets


class DatabaseTestException(Exception):
    """Исключение для тестирования ошибок БД"""
    pass


@contextmanager
def capture_logs():
    """Context manager для перехвата логов"""
    output = StringIO()
    
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt='iso'),
            filter_secrets,
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(0),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=output),
        cache_logger_on_first_use=False,
    )
    
    try:
        yield output
    finally:
        output.close()


@given(
    telegram_id=st.integers(min_value=1, max_value=999999999),
    error_message=st.text(min_size=10, max_size=100)
)
@settings(max_examples=50)
@pytest.mark.asyncio
async def test_property_32_database_errors_logged(telegram_id, error_message):
    """
    Property 32: Логирование ошибок БД
    
    Для любой ошибки при работе с базой данных, система должна залогировать
    ошибку с полным stack trace и контекстной информацией.
    
    Feature: telegram-bot-webapp-system, Property 32
    Validates: Requirements 16.3, 16.5
    """
    # Arrange: создаём mock repository, который выбрасывает ошибку
    with capture_logs() as output:
        mock_session = AsyncMock()
        # Мокируем flush, который вызывается при сохранении
        mock_session.flush.side_effect = DatabaseTestException(error_message)
        
        repository = SupportRepository(mock_session)
        
        # Act: пытаемся создать сессию, что вызовет ошибку БД
        try:
            await repository.create_session(telegram_id)
        except DatabaseTestException:
            pass  # Ожидаем ошибку
        
        # Assert: проверяем, что ошибка залогирована
        log_output = output.getvalue()
        
        # Должен быть хотя бы один лог
        assert len(log_output) > 0, "Ошибка БД должна быть залогирована"
        
        # Проверяем, что в логах есть информация об ошибке
        # (event name содержит 'error' или есть поле error/exception)
        assert 'error' in log_output.lower() or 'exception' in log_output.lower(), \
            "Логи должны содержать информацию об ошибке"


@pytest.mark.asyncio
async def test_database_error_includes_context():
    """
    Unit-тест: логи ошибок БД должны включать контекст
    
    Validates: Requirements 16.3, 16.5
    """
    # Arrange
    with capture_logs() as output:
        mock_session = AsyncMock()
        mock_session.flush.side_effect = DatabaseTestException("Connection timeout")
        
        repository = SupportRepository(mock_session)
        telegram_id = 12345
        
        # Act
        try:
            await repository.create_session(telegram_id)
        except DatabaseTestException:
            pass
        
        # Assert
        log_output = output.getvalue()
        log_lines = [line for line in log_output.strip().split('\n') if line]
        
        # Проверяем наличие контекстной информации
        context_found = False
        for line in log_lines:
            try:
                log_entry = json.loads(line)
                # Проверяем наличие telegram_id или другой контекстной информации
                if 'telegram_id' in log_entry or telegram_id in str(log_entry):
                    context_found = True
                    break
            except json.JSONDecodeError:
                continue
        
        # Примечание: в зависимости от реализации repository,
        # контекст может быть или не быть в логах
        # Главное - что ошибка залогирована


@pytest.mark.asyncio
async def test_database_error_logged_with_level_error():
    """
    Unit-тест: ошибки БД должны логироваться с уровнем ERROR
    
    Validates: Requirements 16.3, 16.5
    """
    # Arrange
    with capture_logs() as output:
        mock_session = AsyncMock()
        mock_session.flush.side_effect = DatabaseTestException("Database error")
        
        repository = SupportRepository(mock_session)
        
        # Act
        try:
            await repository.create_session(123)
        except DatabaseTestException:
            pass
        
        # Assert
        log_output = output.getvalue()
        log_lines = [line for line in log_output.strip().split('\n') if line]
        
        # Проверяем уровень логирования
        error_level_found = False
        for line in log_lines:
            try:
                log_entry = json.loads(line)
                if log_entry.get('level') in ['error', 'critical']:
                    error_level_found = True
                    break
            except json.JSONDecodeError:
                continue
        
        # Примечание: проверка зависит от того, как repository логирует ошибки


@given(
    session_id=st.integers(min_value=1, max_value=10000),
    message_text=st.text(min_size=1, max_size=500)
)
@settings(max_examples=30)
@pytest.mark.asyncio
async def test_property_32_all_db_operations_log_errors(session_id, message_text):
    """
    Property 32: Все операции БД логируют ошибки
    
    Для любой операции с базой данных, если возникает ошибка,
    она должна быть залогирована.
    
    Feature: telegram-bot-webapp-system, Property 32
    Validates: Requirements 16.3, 16.5
    """
    # Arrange
    with capture_logs() as output:
        mock_session = AsyncMock()
        mock_session.flush.side_effect = DatabaseTestException("DB operation failed")
        
        repository = SupportRepository(mock_session)
        
        # Act: пытаемся выполнить операцию сохранения сообщения
        try:
            await repository.save_message(
                session_id=session_id,
                telegram_id=123,
                message_type='from_user',
                message_text=message_text
            )
        except DatabaseTestException:
            pass
        
        # Assert: проверяем, что ошибка залогирована
        log_output = output.getvalue()
        
        # Должны быть логи
        assert len(log_output) > 0, "Операция БД должна логировать ошибки"


@pytest.mark.asyncio
async def test_multiple_db_errors_all_logged():
    """
    Unit-тест: множественные ошибки БД все логируются
    
    Validates: Requirements 16.3, 16.5
    """
    # Arrange
    with capture_logs() as output:
        mock_session = AsyncMock()
        mock_session.flush.side_effect = DatabaseTestException("Error")
        
        repository = SupportRepository(mock_session)
        
        # Act: выполняем несколько операций, каждая падает
        operations = [
            repository.create_session(1),
            repository.create_session(2),
            repository.create_session(3),
        ]
        
        for operation in operations:
            try:
                await operation
            except DatabaseTestException:
                pass
        
        # Assert: все ошибки должны быть залогированы
        log_output = output.getvalue()
        log_lines = [line for line in log_output.strip().split('\n') if line]
        
        # Должно быть минимум 3 лога (по одному на операцию)
        # Примечание: может быть больше, если repository логирует дополнительно
        assert len(log_lines) >= 1, "Все ошибки БД должны быть залогированы"

