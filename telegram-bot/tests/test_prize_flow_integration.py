"""
Интеграционные тесты для Prize Flow.

Проверяют полный цикл получения приза от нажатия кнопки до выдачи,
включая взаимодействие между handlers, services и repositories.
"""

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from aiogram.types import Message, User
from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.memory import MemoryStorage

from handlers.prize_flow_handler import PrizeFlowHandler
from services.prize_service import PrizeService, PrizeStatus, PrizeResult
from database.repositories.prize_repository import DatabaseUnavailableError
from fsm.states import PrizeFlowStates


@pytest.fixture
def mock_prize_service():
    """Создаёт mock PrizeService для тестов"""
    service = AsyncMock(spec=PrizeService)
    return service


@pytest.fixture
def mock_session_manager():
    """Создаёт mock SessionManager для тестов"""
    manager = AsyncMock()
    manager.save_bot_message = AsyncMock()
    return manager


@pytest.fixture
def prize_flow_handler(mock_prize_service, mock_session_manager):
    """Создаёт PrizeFlowHandler с mock зависимостями"""
    return PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=mock_session_manager,
        webapp_url="https://example.com/webapp"
    )


@pytest.fixture
def mock_message():
    """Создаёт mock Message для тестов"""
    message = MagicMock(spec=Message)
    message.from_user = MagicMock(spec=User)
    message.from_user.id = 12345
    message.from_user.username = "testuser"
    message.from_user.first_name = "Test"
    message.answer = AsyncMock()
    message.text = None
    message.web_app_data = None
    return message


@pytest.fixture
async def fsm_context():
    """Создаёт FSM контекст для тестов"""
    from aiogram.fsm.storage.base import StorageKey
    
    storage = MemoryStorage()
    key = StorageKey(bot_id=123, chat_id=456, user_id=789)
    context = FSMContext(storage=storage, key=key)
    yield context
    await storage.close()


class TestPrizeFlowIntegration:
    """Интеграционные тесты для полного Prize Flow"""
    
    @pytest.mark.asyncio
    async def test_full_digital_prize_flow(
        self,
        prize_flow_handler,
        mock_prize_service,
        mock_session_manager,
        mock_message,
        fsm_context
    ):
        """
        Тест полного флоу получения цифрового приза.
        
        Validates: Requirements 2.1, 3.3, 5.3, 6.1
        
        Сценарий:
        1. Пользователь нажимает "Получить приз"
        2. Пользователь найден, GDPR согласие уже дано
        3. Пользователь вводит верное кодовое слово
        4. Система выдаёт цифровой приз (промокод)
        5. Отображается главное меню, состояние сбрасывается
        """
        # Arrange
        mock_prize_service.check_user_exists.return_value = True
        mock_prize_service.check_gdpr_consent.return_value = True
        mock_prize_service.validate_code_word.return_value = True
        mock_prize_service.check_prize.return_value = PrizeResult(
            status=PrizeStatus.DIGITAL,
            promo_code="PROMO123",
            instructions="Используйте промокод при оформлении заказа",
            prize_id=None
        )
        
        # Act - Шаг 1: Начало Prize Flow
        mock_message.text = "🎁 Получить приз"
        await prize_flow_handler.start_prize_flow(mock_message, fsm_context, session_id=1)
        
        # Assert - Проверяем, что запрошено кодовое слово
        assert await fsm_context.get_state() == PrizeFlowStates.waiting_for_code_word
        assert mock_message.answer.call_count == 1
        assert "кодовое слово" in mock_message.answer.call_args[0][0].lower()
        
        # Act - Шаг 2: Ввод кодового слова
        mock_message.text = "SECRET123"
        mock_message.answer.reset_mock()
        await prize_flow_handler.handle_code_word_input(mock_message, fsm_context, session_id=1)
        
        # Assert - Проверяем выдачу цифрового приза
        assert await fsm_context.get_state() is None  # Состояние сброшено
        assert mock_message.answer.call_count == 3  # Поздравление + инструкция + меню
        
        # Проверяем содержимое сообщений
        calls = [call[0][0] for call in mock_message.answer.call_args_list]
        assert any("PROMO123" in call for call in calls)
        assert any("Поздравляем" in call for call in calls)
        
        # Проверяем, что SessionManager сохранил сообщения
        assert mock_session_manager.save_bot_message.call_count >= 4  # start_flow + 3 в _send_digital_prize


    @pytest.mark.asyncio
    async def test_full_physical_prize_flow(
        self,
        prize_flow_handler,
        mock_prize_service,
        mock_session_manager,
        mock_message,
        fsm_context
    ):
        """
        Тест полного флоу получения физического приза.
        
        Validates: Requirements 2.1, 3.3, 5.3, 7.1
        
        Сценарий:
        1. Пользователь нажимает "Получить приз"
        2. Пользователь найден, GDPR согласие уже дано
        3. Пользователь вводит верное кодовое слово
        4. Система отправляет WebApp форму для физического приза
        5. Состояние устанавливается в waiting_for_delivery_data
        """
        # Arrange
        mock_prize_service.check_user_exists.return_value = True
        mock_prize_service.check_gdpr_consent.return_value = True
        mock_prize_service.validate_code_word.return_value = True
        mock_prize_service.check_prize.return_value = PrizeResult(
            status=PrizeStatus.PHYSICAL,
            promo_code=None,
            instructions=None,
            prize_id=42
        )
        
        # Act - Шаг 1: Начало Prize Flow
        mock_message.text = "🎁 Получить приз"
        await prize_flow_handler.start_prize_flow(mock_message, fsm_context, session_id=1)
        
        # Assert - Проверяем, что запрошено кодовое слово
        assert await fsm_context.get_state() == PrizeFlowStates.waiting_for_code_word
        
        # Act - Шаг 2: Ввод кодового слова
        mock_message.text = "SECRET456"
        mock_message.answer.reset_mock()
        await prize_flow_handler.handle_code_word_input(mock_message, fsm_context, session_id=1)
        
        # Assert - Проверяем отправку WebApp формы
        assert await fsm_context.get_state() == PrizeFlowStates.waiting_for_delivery_data
        assert mock_message.answer.call_count == 2  # Инструкция + кнопка WebApp
        
        # Проверяем содержимое сообщений
        calls = [call[0][0] for call in mock_message.answer.call_args_list]
        assert any("физический приз" in call.lower() for call in calls)
        assert any("данные для доставки" in call.lower() for call in calls)
        
        # Проверяем, что SessionManager сохранил сообщения
        assert mock_session_manager.save_bot_message.call_count >= 3

    @pytest.mark.asyncio
    async def test_flow_with_back_button(
        self,
        prize_flow_handler,
        mock_prize_service,
        mock_session_manager,
        mock_message,
        fsm_context
    ):
        """
        Тест флоу с отменой через кнопку "Назад".
        
        Validates: Requirements 8.2
        
        Сценарий:
        1. Пользователь нажимает "Получить приз"
        2. Пользователь найден, но GDPR согласие не дано
        3. Запрашивается согласие
        4. Пользователь нажимает "Назад"
        5. Отображается главное меню, состояние сбрасывается
        """
        # Arrange
        mock_prize_service.check_user_exists.return_value = True
        mock_prize_service.check_gdpr_consent.return_value = False
        
        # Act - Шаг 1: Начало Prize Flow
        mock_message.text = "🎁 Получить приз"
        await prize_flow_handler.start_prize_flow(mock_message, fsm_context, session_id=1)
        
        # Assert - Проверяем, что запрошено согласие
        assert await fsm_context.get_state() == PrizeFlowStates.waiting_for_consent
        assert mock_message.answer.call_count == 1
        assert "согласие" in mock_message.answer.call_args[0][0].lower()
        
        # Act - Шаг 2: Нажатие кнопки "Назад"
        mock_message.text = "◀️ Назад"
        mock_message.answer.reset_mock()
        await prize_flow_handler.handle_consent_response(mock_message, fsm_context, session_id=1)
        
        # Assert - Проверяем возврат в главное меню
        assert await fsm_context.get_state() is None  # Состояние сброшено
        assert mock_message.answer.call_count == 1
        assert "главное меню" in mock_message.answer.call_args[0][0].lower()
        
        # Проверяем, что согласие НЕ было сохранено
        mock_prize_service.save_gdpr_consent.assert_not_called()

    @pytest.mark.asyncio
    async def test_flow_with_user_not_found(
        self,
        prize_flow_handler,
        mock_prize_service,
        mock_session_manager,
        mock_message,
        fsm_context
    ):
        """
        Тест флоу с пользователем не в таблице.
        
        Validates: Requirements 2.1
        
        Сценарий:
        1. Пользователь нажимает "Получить приз"
        2. Пользователь НЕ найден в таблице
        3. Отображается сообщение об отсутствии в списке победителей
        4. Отображается главное меню
        """
        # Arrange
        mock_prize_service.check_user_exists.return_value = False
        
        # Act
        mock_message.text = "🎁 Получить приз"
        await prize_flow_handler.start_prize_flow(mock_message, fsm_context, session_id=1)
        
        # Assert
        assert await fsm_context.get_state() is None  # Состояние не устанавливается
        assert mock_message.answer.call_count == 1
        
        message_text = mock_message.answer.call_args[0][0]
        assert "отсутствует в списке победителей" in message_text.lower()
        
        # Проверяем, что GDPR согласие не проверялось
        mock_prize_service.check_gdpr_consent.assert_not_called()

    @pytest.mark.asyncio
    async def test_flow_with_invalid_code_word_retry(
        self,
        prize_flow_handler,
        mock_prize_service,
        mock_session_manager,
        mock_message,
        fsm_context
    ):
        """
        Тест флоу с неверным кодовым словом и повторной попыткой.
        
        Validates: Requirements 5.3
        
        Сценарий:
        1. Пользователь нажимает "Получить приз"
        2. Пользователь найден, GDPR согласие уже дано
        3. Пользователь вводит НЕВЕРНОЕ кодовое слово
        4. Система сообщает об ошибке, состояние сохраняется
        5. Пользователь вводит ВЕРНОЕ кодовое слово
        6. Система выдаёт приз
        """
        # Arrange
        mock_prize_service.check_user_exists.return_value = True
        mock_prize_service.check_gdpr_consent.return_value = True
        
        # Act - Шаг 1: Начало Prize Flow
        mock_message.text = "🎁 Получить приз"
        await prize_flow_handler.start_prize_flow(mock_message, fsm_context, session_id=1)
        
        # Assert - Проверяем, что запрошено кодовое слово
        assert await fsm_context.get_state() == PrizeFlowStates.waiting_for_code_word
        
        # Act - Шаг 2: Ввод НЕВЕРНОГО кодового слова
        mock_prize_service.validate_code_word.return_value = False
        mock_message.text = "WRONG123"
        mock_message.answer.reset_mock()
        await prize_flow_handler.handle_code_word_input(mock_message, fsm_context, session_id=1)
        
        # Assert - Проверяем сообщение об ошибке и сохранение состояния
        assert await fsm_context.get_state() == PrizeFlowStates.waiting_for_code_word
        assert mock_message.answer.call_count == 1
        assert "неверно" in mock_message.answer.call_args[0][0].lower()
        
        # Act - Шаг 3: Ввод ВЕРНОГО кодового слова
        mock_prize_service.validate_code_word.return_value = True
        mock_prize_service.check_prize.return_value = PrizeResult(
            status=PrizeStatus.DIGITAL,
            promo_code="CORRECT789",
            instructions="Используйте промокод",
            prize_id=None
        )
        mock_message.text = "CORRECT789"
        mock_message.answer.reset_mock()
        await prize_flow_handler.handle_code_word_input(mock_message, fsm_context, session_id=1)
        
        # Assert - Проверяем выдачу приза
        assert await fsm_context.get_state() is None  # Состояние сброшено
        calls = [call[0][0] for call in mock_message.answer.call_args_list]
        assert any("CORRECT789" in call for call in calls)
        assert any("Поздравляем" in call for call in calls)

    @pytest.mark.asyncio
    async def test_flow_with_gdpr_consent_request(
        self,
        prize_flow_handler,
        mock_prize_service,
        mock_session_manager,
        mock_message,
        fsm_context
    ):
        """
        Тест полного флоу с запросом GDPR согласия.
        
        Validates: Requirements 3.3
        
        Сценарий:
        1. Пользователь нажимает "Получить приз"
        2. Пользователь найден, но GDPR согласие не дано
        3. Запрашивается согласие
        4. Пользователь нажимает "Согласен"
        5. Согласие сохраняется, запрашивается кодовое слово
        """
        # Arrange
        mock_prize_service.check_user_exists.return_value = True
        mock_prize_service.check_gdpr_consent.return_value = False
        
        # Act - Шаг 1: Начало Prize Flow
        mock_message.text = "🎁 Получить приз"
        await prize_flow_handler.start_prize_flow(mock_message, fsm_context, session_id=1)
        
        # Assert - Проверяем запрос согласия
        assert await fsm_context.get_state() == PrizeFlowStates.waiting_for_consent
        assert "согласие" in mock_message.answer.call_args[0][0].lower()
        
        # Act - Шаг 2: Нажатие кнопки "Согласен"
        mock_message.text = "✅ Согласен"
        mock_message.answer.reset_mock()
        await prize_flow_handler.handle_consent_response(mock_message, fsm_context, session_id=1)
        
        # Assert - Проверяем сохранение согласия и запрос кодового слова
        mock_prize_service.save_gdpr_consent.assert_called_once_with(12345)
        assert await fsm_context.get_state() == PrizeFlowStates.waiting_for_code_word
        assert "кодовое слово" in mock_message.answer.call_args[0][0].lower()
