"""
Тесты на проверку защиты от SQL-инъекций
Проверяет, что система корректно обрабатывает потенциально опасные входные данные
"""
import pytest
from hypothesis import given, strategies as st, settings, HealthCheck
from sqlalchemy import text

from database.repository import SupportRepository
from database.models import SupportSession, SupportMessage


# Стратегии для генерации потенциально опасных SQL-инъекций
sql_injection_payloads = st.sampled_from([
    # Классические SQL-инъекции
    "'; DROP TABLE support_sessions; --",
    "' OR '1'='1",
    "' OR 1=1 --",
    "admin'--",
    "' OR 'x'='x",
    "1' UNION SELECT NULL, NULL, NULL --",
    
    # Попытки извлечения данных
    "' UNION SELECT * FROM support_sessions --",
    "' UNION SELECT telegram_id, message_text FROM support_messages --",
    
    # Временные атаки
    "'; WAITFOR DELAY '00:00:05' --",
    "'; SELECT pg_sleep(5) --",
    
    # Попытки обхода аутентификации
    "' OR telegram_id IS NOT NULL --",
    "' OR session_id > 0 --",
    
    # Комментарии и специальные символы
    "test'; -- comment",
    "test'/**/OR/**/1=1",
    "test' AND '1'='1",
    
    # Экранирование кавычек
    "test\\'",
    "test''",
    "test\\\"",
    
    # Hex и Unicode инъекции
    "0x27 OR 1=1",
    "\\u0027 OR 1=1",
    
    # Stacked queries
    "'; DELETE FROM support_messages WHERE 1=1; --",
    "'; UPDATE support_sessions SET status='closed'; --",
])


class TestSQLInjectionProtection:
    """Тесты защиты от SQL-инъекций"""
    
    @pytest.mark.asyncio
    async def test_create_session_with_malicious_telegram_id(
        self,
        db_session,
        support_repository
    ):
        """
        Проверяет, что создание сессии с вредоносным telegram_id не приводит к инъекции
        
        Примечание: telegram_id - это integer, поэтому прямая инъекция невозможна,
        но тест проверяет корректность обработки
        """
        # Попытка передать строку вместо числа должна вызвать ошибку типа или DataError
        from sqlalchemy.exc import DataError, DBAPIError
        with pytest.raises((TypeError, ValueError, DataError, DBAPIError)):
            await support_repository.create_session("'; DROP TABLE support_sessions; --")
    
    @pytest.mark.asyncio
    @given(malicious_text=sql_injection_payloads)
    @settings(
        max_examples=20,
        deadline=5000,
        suppress_health_check=[HealthCheck.function_scoped_fixture]
    )
    async def test_save_message_with_sql_injection_in_text(
        self,
        db_session,
        support_repository,
        malicious_text
    ):
        """
        Проверяет, что сохранение сообщения с SQL-инъекцией в тексте безопасно
        
        Args:
            malicious_text: Потенциально опасный текст с SQL-инъекцией
        """
        # Создаём тестовую сессию
        session_id = await support_repository.create_session(telegram_id=12345)
        
        # Сохраняем сообщение с вредоносным текстом
        message_id = await support_repository.save_message(
            session_id=session_id,
            telegram_id=12345,
            message_type='from_user',
            message_text=malicious_text
        )
        
        # Проверяем, что сообщение сохранено корректно
        assert message_id > 0
        
        # Проверяем, что текст сохранён как есть (экранирован)
        messages = await support_repository.get_messages(session_id)
        assert len(messages) == 1
        assert messages[0].message_text == malicious_text
        
        # Проверяем, что таблицы не были удалены/изменены
        # Если бы инъекция сработала, следующий запрос бы упал
        sessions = await support_repository.get_active_sessions()
        assert len(sessions) >= 1
    
    @pytest.mark.asyncio
    async def test_get_messages_with_sql_injection_in_session_id(
        self,
        db_session,
        support_repository
    ):
        """
        Проверяет, что получение сообщений с вредоносным session_id безопасно
        """
        # Попытка передать строку вместо числа должна вызвать ошибку типа или ProgrammingError
        from sqlalchemy.exc import ProgrammingError
        with pytest.raises((TypeError, ValueError, ProgrammingError)):
            await support_repository.get_messages("1 OR 1=1")
    
    @pytest.mark.asyncio
    @given(malicious_file_id=sql_injection_payloads)
    @settings(
        max_examples=20,
        deadline=5000,
        suppress_health_check=[HealthCheck.function_scoped_fixture]
    )
    async def test_save_message_with_sql_injection_in_file_id(
        self,
        db_session,
        support_repository,
        malicious_file_id
    ):
        """
        Проверяет, что сохранение сообщения с SQL-инъекцией в file_id безопасно
        
        Args:
            malicious_file_id: Потенциально опасный file_id
        """
        # Создаём тестовую сессию
        session_id = await support_repository.create_session(telegram_id=67890)
        
        # Сохраняем сообщение с вредоносным file_id
        message_id = await support_repository.save_message(
            session_id=session_id,
            telegram_id=67890,
            message_type='from_user',
            message_text="Test message",
            file_id=malicious_file_id
        )
        
        # Проверяем, что сообщение сохранено корректно
        assert message_id > 0
        
        # Проверяем, что file_id сохранён как есть
        messages = await support_repository.get_messages(session_id)
        assert len(messages) == 1
        assert messages[0].file_id == malicious_file_id
    
    @pytest.mark.asyncio
    async def test_close_session_with_sql_injection(
        self,
        db_session,
        support_repository
    ):
        """
        Проверяет, что закрытие сессии с вредоносным session_id безопасно
        """
        # Попытка передать строку вместо числа должна вызвать ошибку типа или ProgrammingError
        from sqlalchemy.exc import ProgrammingError
        with pytest.raises((TypeError, ValueError, ProgrammingError)):
            await support_repository.close_session("1'; DROP TABLE support_sessions; --")
    
    @pytest.mark.asyncio
    async def test_database_integrity_after_injection_attempts(
        self,
        db_session,
        support_repository
    ):
        """
        Проверяет целостность базы данных после множественных попыток инъекций
        """
        # Создаём несколько сессий с вредоносными данными
        injection_payloads = [
            "'; DROP TABLE support_sessions; --",
            "' OR '1'='1",
            "' UNION SELECT * FROM support_messages --",
        ]
        
        session_ids = []
        for i, payload in enumerate(injection_payloads):
            session_id = await support_repository.create_session(telegram_id=10000 + i)
            session_ids.append(session_id)
            
            # Сохраняем сообщения с вредоносным текстом
            await support_repository.save_message(
                session_id=session_id,
                telegram_id=10000 + i,
                message_type='from_user',
                message_text=payload
            )
        
        # Проверяем, что все сессии существуют
        for session_id in session_ids:
            session = await support_repository.get_session_by_id(session_id)
            assert session is not None
            assert session.status == 'active'
        
        # Проверяем, что можем получить все активные сессии
        active_sessions = await support_repository.get_active_sessions()
        assert len(active_sessions) >= len(session_ids)
        
        # Проверяем, что таблицы не были удалены
        # Выполняем прямой SQL-запрос для проверки существования таблиц
        result = await db_session.execute(
            text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('support_sessions', 'support_messages')
            """)
        )
        tables = [row[0] for row in result.fetchall()]
        assert 'support_sessions' in tables
        assert 'support_messages' in tables
    
    @pytest.mark.asyncio
    @given(
        message_text=st.text(min_size=1, max_size=1000),
        telegram_id=st.integers(min_value=1, max_value=999999999)
    )
    @settings(
        max_examples=50,
        deadline=5000,
        suppress_health_check=[HealthCheck.function_scoped_fixture]
    )
    async def test_arbitrary_text_handling(
        self,
        db_session,
        support_repository,
        message_text,
        telegram_id
    ):
        """
        Property-based тест: проверяет, что любой текст обрабатывается безопасно
        
        Args:
            message_text: Произвольный текст сообщения
            telegram_id: Произвольный telegram ID
        """
        # Создаём сессию
        session_id = await support_repository.create_session(telegram_id=telegram_id)
        
        # Сохраняем сообщение с произвольным текстом
        message_id = await support_repository.save_message(
            session_id=session_id,
            telegram_id=telegram_id,
            message_type='from_user',
            message_text=message_text
        )
        
        # Проверяем, что сообщение сохранено корректно
        messages = await support_repository.get_messages(session_id)
        assert len(messages) == 1
        # NUL bytes удаляются для совместимости с PostgreSQL
        expected_text = message_text.replace('\x00', '')
        assert messages[0].message_text == expected_text
        assert messages[0].telegram_id == telegram_id
    
    @pytest.mark.asyncio
    async def test_special_characters_in_message(
        self,
        db_session,
        support_repository
    ):
        """
        Проверяет обработку специальных символов в сообщениях
        """
        special_chars = [
            "Test with 'single quotes'",
            'Test with "double quotes"',
            "Test with `backticks`",
            "Test with \\ backslashes \\",
            "Test with \n newlines \n",
            "Test with \t tabs \t",
            "Test with % percent",
            "Test with _ underscore",
            "Test with ; semicolon;",
            "Test with -- comment",
            "Test with /* comment */",
        ]
        
        session_id = await support_repository.create_session(telegram_id=99999)
        
        for i, text in enumerate(special_chars):
            message_id = await support_repository.save_message(
                session_id=session_id,
                telegram_id=99999,
                message_type='from_user',
                message_text=text
            )
            assert message_id > 0
        
        # Проверяем, что все сообщения сохранены корректно
        messages = await support_repository.get_messages(session_id)
        assert len(messages) == len(special_chars)
        
        for i, message in enumerate(messages):
            assert message.message_text == special_chars[i]
