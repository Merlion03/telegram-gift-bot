"""
Unit-тесты для SessionManager

Проверяют конкретные примеры, граничные случаи и обработку ошибок.
"""
import pytest
from datetime import datetime, timezone, timedelta

from services.session_manager import SessionManager
from database.models import SupportSession, SupportMessage


@pytest.fixture
def session_manager(support_repository):
    """Фикстура для создания SessionManager"""
    return SessionManager(repository=support_repository)


class TestGetOrCreateSession:
    """Тесты для метода get_or_create_session"""
    
    @pytest.mark.asyncio
    async def test_creates_new_session_for_first_message(self, session_manager, support_repository):
        """Проверяет создание новой сессии для первого сообщения"""
        # Arrange
        telegram_id = 123456789
        
        # Act
        session_id = await session_manager.get_or_create_session(telegram_id)
        
        # Assert
        assert session_id > 0, "ID сессии должен быть положительным"
        session = await support_repository.get_session_by_id(session_id)
        assert session is not None, "Сессия должна быть создана"
        assert session.telegram_id == telegram_id, "telegram_id должен совпадать"
        assert session.session_type == 'chat', "Тип по умолчанию должен быть 'chat'"
        assert session.status == 'active', "Статус должен быть 'active'"
    
    @pytest.mark.asyncio
    async def test_reuses_existing_active_session(self, session_manager, support_repository):
        """Проверяет переиспользование существующей активной сессии"""
        # Arrange
        telegram_id = 987654321
        first_session_id = await session_manager.get_or_create_session(telegram_id)
        
        # Act
        second_session_id = await session_manager.get_or_create_session(telegram_id)
        
        # Assert
        assert first_session_id == second_session_id, "Должна использоваться та же сессия"
    
    @pytest.mark.asyncio
    async def test_creates_support_session_when_specified(self, session_manager, support_repository):
        """Проверяет создание сессии типа 'support'"""
        # Arrange
        telegram_id = 111222333
        
        # Act
        session_id = await session_manager.get_or_create_session(
            telegram_id,
            session_type='support'
        )
        
        # Assert
        session = await support_repository.get_session_by_id(session_id)
        assert session.session_type == 'support', "Тип должен быть 'support'"
    
    @pytest.mark.asyncio
    async def test_raises_error_for_invalid_session_type(self, session_manager):
        """Проверяет ошибку при невалидном типе сессии"""
        # Arrange
        telegram_id = 444555666
        
        # Act & Assert
        with pytest.raises(ValueError) as exc_info:
            await session_manager.get_or_create_session(
                telegram_id,
                session_type='invalid_type'
            )
        
        assert "Invalid session_type" in str(exc_info.value)


class TestConvertToSupportSession:
    """Тесты для метода convert_to_support_session"""
    
    @pytest.mark.asyncio
    async def test_converts_chat_to_support_session(self, session_manager, support_repository):
        """Проверяет преобразование Chat_Session в Support_Session"""
        # Arrange
        telegram_id = 777888999
        session_id = await session_manager.get_or_create_session(telegram_id)
        
        # Act
        success = await session_manager.convert_to_support_session(session_id)
        
        # Assert
        assert success is True, "Преобразование должно быть успешным"
        session = await support_repository.get_session_by_id(session_id)
        assert session.session_type == 'support', "Тип должен измениться на 'support'"
    
    @pytest.mark.asyncio
    async def test_preserves_messages_during_conversion(self, session_manager, support_repository):
        """Проверяет сохранение истории при преобразовании в Support_Session"""
        # Arrange
        telegram_id = 123123123
        session_id = await session_manager.get_or_create_session(telegram_id)
        
        # Добавляем сообщения
        msg1_id = await session_manager.save_user_message(
            session_id, telegram_id, "Привет"
        )
        msg2_id = await session_manager.save_bot_message(
            session_id, "Здравствуйте!"
        )
        
        # Act
        success = await session_manager.convert_to_support_session(session_id)
        
        # Assert
        assert success is True
        session = await support_repository.get_session_by_id(session_id)
        assert session.session_type == 'support'
        
        messages = await support_repository.get_messages(session_id)
        assert len(messages) == 2, "Все сообщения должны сохраниться"
        assert messages[0].id == msg1_id
        assert messages[1].id == msg2_id
    
    @pytest.mark.asyncio
    async def test_returns_false_for_nonexistent_session(self, session_manager):
        """Проверяет возврат False для несуществующей сессии"""
        # Arrange
        nonexistent_session_id = 999999
        
        # Act
        success = await session_manager.convert_to_support_session(nonexistent_session_id)
        
        # Assert
        assert success is False, "Должен вернуть False для несуществующей сессии"
    
    @pytest.mark.asyncio
    async def test_idempotent_conversion(self, session_manager, support_repository):
        """Проверяет идемпотентность преобразования"""
        # Arrange
        telegram_id = 456456456
        session_id = await session_manager.get_or_create_session(telegram_id)
        
        # Act - преобразуем дважды
        first_result = await session_manager.convert_to_support_session(session_id)
        second_result = await session_manager.convert_to_support_session(session_id)
        
        # Assert
        assert first_result is True
        assert second_result is True
        session = await support_repository.get_session_by_id(session_id)
        assert session.session_type == 'support'


class TestCloseInactiveSessions:
    """Тесты для метода close_inactive_sessions"""
    
    @pytest.mark.asyncio
    async def test_closes_inactive_sessions(self, session_manager, support_repository, db_session):
        """Проверяет закрытие неактивных сессий"""
        # Arrange - создаём старую сессию
        old_time = datetime.now(timezone.utc) - timedelta(hours=25)
        old_session = SupportSession(
            telegram_id=111111111,
            status='active',
            session_type='chat',
            created_at=old_time,
            last_activity=old_time  # КРИТИЧЕСКИ ВАЖНО: устанавливаем last_activity
        )
        db_session.add(old_session)
        await db_session.flush()
        old_session_id = old_session.id
        
        # Создаём свежую сессию
        fresh_session_id = await session_manager.get_or_create_session(222222222)
        
        # Act
        closed_count = await session_manager.close_inactive_sessions(inactive_hours=24)
        
        # Assert
        assert closed_count == 1, "Должна быть закрыта одна сессия"
        
        old_session_check = await support_repository.get_session_by_id(old_session_id)
        assert old_session_check.status == 'closed', "Старая сессия должна быть закрыта"
        
        fresh_session_check = await support_repository.get_session_by_id(fresh_session_id)
        assert fresh_session_check.status == 'active', "Свежая сессия должна остаться активной"
    
    @pytest.mark.asyncio
    async def test_considers_message_activity(self, session_manager, support_repository, db_session):
        """Проверяет учёт активности по сообщениям"""
        # Arrange - создаём старую сессию
        old_time = datetime.now(timezone.utc) - timedelta(hours=25)
        session = SupportSession(
            telegram_id=333333333,
            status='active',
            session_type='chat',
            created_at=old_time
        )
        db_session.add(session)
        await db_session.flush()
        session_id = session.id
        
        # Добавляем свежее сообщение
        recent_time = datetime.now(timezone.utc) - timedelta(hours=1)
        message = SupportMessage(
            session_id=session_id,
            telegram_id=333333333,
            message_type='from_user',
            message_text='Недавнее сообщение',
            created_at=recent_time
        )
        db_session.add(message)
        await db_session.flush()
        
        # Act
        closed_count = await session_manager.close_inactive_sessions(inactive_hours=24)
        
        # Assert
        assert closed_count == 0, "Сессия с недавним сообщением не должна закрываться"
        session_check = await support_repository.get_session_by_id(session_id)
        assert session_check.status == 'active'
    
    @pytest.mark.asyncio
    async def test_returns_zero_when_no_inactive_sessions(self, session_manager):
        """Проверяет возврат 0 при отсутствии неактивных сессий"""
        # Arrange - создаём только свежую сессию
        await session_manager.get_or_create_session(444444444)
        
        # Act
        closed_count = await session_manager.close_inactive_sessions(inactive_hours=24)
        
        # Assert
        assert closed_count == 0, "Не должно быть закрытых сессий"


class TestSaveUserMessage:
    """Тесты для метода save_user_message"""
    
    @pytest.mark.asyncio
    async def test_saves_text_message(self, session_manager, support_repository):
        """Проверяет сохранение текстового сообщения"""
        # Arrange
        telegram_id = 555555555
        session_id = await session_manager.get_or_create_session(telegram_id)
        message_text = "Тестовое сообщение"
        
        # Act
        message_id = await session_manager.save_user_message(
            session_id=session_id,
            telegram_id=telegram_id,
            message_text=message_text
        )
        
        # Assert
        assert message_id > 0, "ID сообщения должен быть положительным"
        messages = await support_repository.get_messages(session_id)
        assert len(messages) == 1
        assert messages[0].message_text == message_text
        assert messages[0].message_type == 'from_user'
        assert messages[0].telegram_id == telegram_id
    
    @pytest.mark.asyncio
    async def test_saves_media_message_with_file_id(self, session_manager, support_repository):
        """Проверяет сохранение медиа-сообщения с file_id"""
        # Arrange
        telegram_id = 666666666
        session_id = await session_manager.get_or_create_session(telegram_id)
        message_text = "Фото"
        file_id = "AgACAgIAAxkBAAIC"
        
        # Act
        message_id = await session_manager.save_user_message(
            session_id=session_id,
            telegram_id=telegram_id,
            message_text=message_text,
            file_id=file_id
        )
        
        # Assert
        messages = await support_repository.get_messages(session_id)
        assert len(messages) == 1
        assert messages[0].file_id == file_id
        assert messages[0].message_text == message_text
    
    @pytest.mark.asyncio
    async def test_saves_empty_message(self, session_manager, support_repository):
        """Проверяет сохранение пустого сообщения (только медиа без caption)"""
        # Arrange
        telegram_id = 777777777
        session_id = await session_manager.get_or_create_session(telegram_id)
        
        # Act
        message_id = await session_manager.save_user_message(
            session_id=session_id,
            telegram_id=telegram_id,
            message_text="",
            file_id="FileID123"
        )
        
        # Assert
        messages = await support_repository.get_messages(session_id)
        assert len(messages) == 1
        assert messages[0].message_text == ""
        assert messages[0].file_id == "FileID123"


class TestSaveBotMessage:
    """Тесты для метода save_bot_message"""
    
    @pytest.mark.asyncio
    async def test_saves_bot_response(self, session_manager, support_repository):
        """Проверяет сохранение ответа бота"""
        # Arrange
        telegram_id = 888888888
        session_id = await session_manager.get_or_create_session(telegram_id)
        bot_response = "Ответ бота"
        
        # Act
        message_id = await session_manager.save_bot_message(
            session_id=session_id,
            message_text=bot_response
        )
        
        # Assert
        assert message_id > 0
        messages = await support_repository.get_messages(session_id)
        assert len(messages) == 1
        assert messages[0].message_text == bot_response
        assert messages[0].message_type == 'from_bot'
        assert messages[0].telegram_id == 0, "Для бота должен использоваться telegram_id = 0"
    
    @pytest.mark.asyncio
    async def test_saves_conversation_sequence(self, session_manager, support_repository):
        """Проверяет сохранение последовательности диалога"""
        # Arrange
        telegram_id = 999999999
        session_id = await session_manager.get_or_create_session(telegram_id)
        
        # Act - создаём диалог
        await session_manager.save_user_message(session_id, telegram_id, "Привет")
        await session_manager.save_bot_message(session_id, "Здравствуйте!")
        await session_manager.save_user_message(session_id, telegram_id, "Как дела?")
        await session_manager.save_bot_message(session_id, "Отлично!")
        
        # Assert
        messages = await support_repository.get_messages(session_id)
        assert len(messages) == 4
        assert messages[0].message_type == 'from_user'
        assert messages[1].message_type == 'from_bot'
        assert messages[2].message_type == 'from_user'
        assert messages[3].message_type == 'from_bot'


class TestErrorHandling:
    """Тесты обработки ошибок"""
    
    @pytest.mark.asyncio
    async def test_handles_invalid_session_type(self, session_manager):
        """Проверяет обработку невалидного типа сессии"""
        with pytest.raises(ValueError) as exc_info:
            await session_manager.get_or_create_session(
                telegram_id=123,
                session_type='invalid'
            )
        assert "Invalid session_type" in str(exc_info.value)
