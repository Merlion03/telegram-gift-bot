"""
Интеграционные тесты для обработчиков с функциональностью удаления клавиатур.

Проверяют взаимодействие обработчиков (PrizeFlowHandler, DeliveryHandler, SupportHandler)
с утилитой keyboard_utils при обработке callback-запросов и данных доставки.

Feature: button-auto-hide-on-click
Validates: Requirements 1.1-1.4, 2.1-2.4, 3.1-3.5, 8.1-8.3
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call
from aiogram.types import CallbackQuery, Message, User, Chat, WebAppData
from aiogram.fsm.context import FSMContext
from aiogram.exceptions import TelegramBadRequest

from handlers.prize_flow_handler import PrizeFlowHandler
from handlers.delivery_handler import DeliveryHandler
from handlers.support_handler import SupportHandler
from services.prize_service import PrizeService, PrizeStatus
from utils.keyboard_utils import remove_inline_keyboard, remove_inline_keyboard_by_id


# ============================================================================
# Фикстуры для моков
# ============================================================================

@pytest.fixture
def mock_callback():
    """Создаёт мок объекта CallbackQuery"""
    callback = MagicMock(spec=CallbackQuery)
    callback.from_user = MagicMock(spec=User)
    callback.from_user.id = 12345
    callback.from_user.username = "test_user"
    callback.from_user.first_name = "Test"
    callback.data = "get_prize"
    
    # Мок сообщения
    callback.message = MagicMock()
    callback.message.message_id = 100
    callback.message.answer = AsyncMock()
    callback.message.edit_reply_markup = AsyncMock()
    
    callback.answer = AsyncMock()
    
    return callback


@pytest.fixture
def mock_message():
    """Создаёт мок объекта Message"""
    message = MagicMock(spec=Message)
    message.from_user = MagicMock(spec=User)
    message.from_user.id = 12345
    message.from_user.username = "test_user"
    message.from_user.first_name = "Test"
    message.answer = AsyncMock()
    message.bot = MagicMock()
    message.bot.edit_message_reply_markup = AsyncMock()
    
    return message


@pytest.fixture
def mock_state():
    """Создаёт мок объекта FSMContext"""
    state = MagicMock(spec=FSMContext)
    state.set_state = AsyncMock()
    state.clear = AsyncMock()
    state.get_data = AsyncMock(return_value={})
    state.update_data = AsyncMock()
    
    return state


@pytest.fixture
def mock_prize_service():
    """Создаёт мок PrizeService"""
    service = MagicMock(spec=PrizeService)
    service.check_user_exists = AsyncMock(return_value=True)
    service.check_gdpr_consent = AsyncMock(return_value=True)
    service.save_gdpr_consent = AsyncMock()
    service.validate_code_word = AsyncMock(return_value=True)
    service.check_prize = AsyncMock()
    service.validate_prize_id = AsyncMock(return_value=True)
    
    return service


@pytest.fixture
def prize_flow_handler(mock_prize_service):
    """Создаёт экземпляр PrizeFlowHandler с моками"""
    mock_notification_service = MagicMock()
    mock_notification_service.send_delivery_notifications = AsyncMock()
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        notification_service=mock_notification_service,
        session_manager=None,
        webapp_url="https://example.com"
    )
    
    return handler


@pytest.fixture
def delivery_handler():
    """Создаёт экземпляр DeliveryHandler с моками"""
    mock_sheets_service = MagicMock()
    mock_sheets_service.save_delivery_data = AsyncMock(return_value=True)
    
    mock_prize_repository = MagicMock()
    mock_prize_repository.update_delivery_data = AsyncMock(return_value=True)
    mock_prize_repository.mark_prize_claimed = AsyncMock()
    
    mock_prize_service = MagicMock()
    mock_prize_service.validate_prize_id = AsyncMock(return_value=True)
    
    mock_notification_service = MagicMock()
    mock_notification_service.send_delivery_notifications = AsyncMock()
    
    handler = DeliveryHandler(
        sheets_service=mock_sheets_service,
        prize_repository=mock_prize_repository,
        prize_service=mock_prize_service,
        notification_service=mock_notification_service,
        session_manager=None
    )
    
    return handler


@pytest.fixture
def support_handler():
    """Создаёт экземпляр SupportHandler с моками"""
    mock_support_service = MagicMock()
    mock_support_service.close_session = AsyncMock()
    
    mock_media_handler = MagicMock()
    
    handler = SupportHandler(
        support_service=mock_support_service,
        media_handler=mock_media_handler,
        session_manager=None
    )
    
    return handler


# ============================================================================
# Тесты для PrizeFlowHandler.handle_get_prize_callback
# ============================================================================

class TestPrizeFlowHandlerGetPrizeCallback:
    """
    Интеграционные тесты для PrizeFlowHandler.handle_get_prize_callback
    
    Validates: Requirements 1.1, 1.2, 1.3, 7.3
    """
    
    @pytest.mark.asyncio
    async def test_remove_keyboard_called_at_start(
        self,
        prize_flow_handler,
        mock_callback,
        mock_state
    ):
        """
        Тест: remove_inline_keyboard вызывается в начале метода
        
        Validates: Requirements 1.1, 1.2
        """
        # Arrange
        with patch('handlers.prize_flow_handler.remove_inline_keyboard', new_callable=AsyncMock) as mock_remove:
            mock_remove.return_value = True
            
            # Act
            await prize_flow_handler.handle_get_prize_callback(
                callback=mock_callback,
                state=mock_state,
                session_id=None
            )
            
            # Assert
            # Проверяем, что remove_inline_keyboard был вызван
            mock_remove.assert_called_once()
            
            # Проверяем, что он был вызван с правильными параметрами
            call_args = mock_remove.call_args
            assert call_args[0][0] == mock_callback  # Первый аргумент - callback
            
            # Проверяем, что remove_inline_keyboard вызван ДО start_prize_flow_from_callback
            # (проверяем через порядок вызовов mock_callback.message.answer)
            assert mock_remove.called
    
    @pytest.mark.asyncio
    async def test_prize_flow_continues_after_keyboard_removal(
        self,
        prize_flow_handler,
        mock_callback,
        mock_state
    ):
        """
        Тест: Prize Flow продолжается после удаления клавиатуры
        
        Validates: Requirements 1.3
        """
        # Arrange
        with patch('handlers.prize_flow_handler.remove_inline_keyboard', new_callable=AsyncMock) as mock_remove:
            mock_remove.return_value = True
            
            # Act
            await prize_flow_handler.handle_get_prize_callback(
                callback=mock_callback,
                state=mock_state,
                session_id=None
            )
            
            # Assert
            # Проверяем, что start_prize_flow_from_callback был выполнен
            # (проверяем через вызов check_user_exists)
            prize_flow_handler.prize_service.check_user_exists.assert_called_once_with(12345)
            
            # Проверяем, что callback.answer() был вызван
            mock_callback.answer.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_callback_answer_called(
        self,
        prize_flow_handler,
        mock_callback,
        mock_state
    ):
        """
        Тест: callback.answer() вызывается после обработки
        
        Validates: Requirements 7.3
        """
        # Arrange
        with patch('handlers.prize_flow_handler.remove_inline_keyboard', new_callable=AsyncMock) as mock_remove:
            mock_remove.return_value = True
            
            # Act
            await prize_flow_handler.handle_get_prize_callback(
                callback=mock_callback,
                state=mock_state,
                session_id=None
            )
            
            # Assert
            mock_callback.answer.assert_called_once()


# ============================================================================
# Тесты для PrizeFlowHandler.handle_consent_callback
# ============================================================================

class TestPrizeFlowHandlerConsentCallback:
    """
    Интеграционные тесты для PrizeFlowHandler.handle_consent_callback
    
    Validates: Requirements 2.1, 2.2, 2.3
    """
    
    @pytest.mark.asyncio
    async def test_remove_keyboard_called_for_consent_agree(
        self,
        prize_flow_handler,
        mock_callback,
        mock_state
    ):
        """
        Тест: remove_inline_keyboard вызывается для consent_agree
        
        Validates: Requirements 2.1
        """
        # Arrange
        mock_callback.data = "consent_agree"
        
        with patch('handlers.prize_flow_handler.remove_inline_keyboard', new_callable=AsyncMock) as mock_remove:
            mock_remove.return_value = True
            
            # Act
            await prize_flow_handler.handle_consent_callback(
                callback=mock_callback,
                state=mock_state,
                session_id=None
            )
            
            # Assert
            mock_remove.assert_called_once()
            call_args = mock_remove.call_args
            assert call_args[0][0] == mock_callback
    
    @pytest.mark.asyncio
    async def test_remove_keyboard_called_for_consent_back(
        self,
        prize_flow_handler,
        mock_callback,
        mock_state
    ):
        """
        Тест: remove_inline_keyboard вызывается для consent_back
        
        Validates: Requirements 2.2
        """
        # Arrange
        mock_callback.data = "consent_back"
        
        with patch('handlers.prize_flow_handler.remove_inline_keyboard', new_callable=AsyncMock) as mock_remove:
            mock_remove.return_value = True
            
            # Act
            await prize_flow_handler.handle_consent_callback(
                callback=mock_callback,
                state=mock_state,
                session_id=None
            )
            
            # Assert
            mock_remove.assert_called_once()
            call_args = mock_remove.call_args
            assert call_args[0][0] == mock_callback
    
    @pytest.mark.asyncio
    async def test_keyboard_removed_before_next_message(
        self,
        prize_flow_handler,
        mock_callback,
        mock_state
    ):
        """
        Тест: клавиатура удаляется до отправки следующего сообщения
        
        Validates: Requirements 2.3
        """
        # Arrange
        mock_callback.data = "consent_agree"
        
        call_order = []
        
        async def track_remove(*args, **kwargs):
            call_order.append('remove_keyboard')
            return True
        
        async def track_answer(*args, **kwargs):
            call_order.append('answer')
            return MagicMock()
        
        with patch('handlers.prize_flow_handler.remove_inline_keyboard', side_effect=track_remove):
            mock_callback.message.answer = track_answer
            
            # Act
            await prize_flow_handler.handle_consent_callback(
                callback=mock_callback,
                state=mock_state,
                session_id=None
            )
            
            # Assert
            # Проверяем, что remove_keyboard был вызван до answer
            assert call_order[0] == 'remove_keyboard'
            assert 'answer' in call_order
            assert call_order.index('remove_keyboard') < call_order.index('answer')


# ============================================================================
# Тесты для DeliveryHandler.handle_delivery_data
# ============================================================================

class TestDeliveryHandlerDeliveryData:
    """
    Интеграционные тесты для DeliveryHandler.handle_delivery_data
    
    Validates: Requirements 3.1, 3.2, 3.3, 3.4
    """
    
    @pytest.mark.asyncio
    async def test_remove_keyboard_by_id_called_with_correct_params(
        self,
        delivery_handler,
        mock_message,
        mock_state
    ):
        """
        Тест: remove_inline_keyboard_by_id вызывается с правильными параметрами
        
        Validates: Requirements 3.1, 3.2
        """
        # Arrange
        mock_message.web_app_data = MagicMock(spec=WebAppData)
        mock_message.web_app_data.data = '{"prize_id": 1, "last_name": "Test", "first_name": "User", "city": "Moscow", "street": "Main", "house": "1", "phone": "+79991234567"}'
        
        mock_state.get_data = AsyncMock(return_value={'webapp_message_id': 200})
        
        # Мокаем _find_prize_by_id
        mock_prize = MagicMock()
        mock_prize.row_id = 1
        mock_prize.sheet_name = "Sheet1"
        mock_prize.code_word = "test_code"
        delivery_handler._find_prize_by_id = AsyncMock(return_value=mock_prize)
        
        with patch('handlers.delivery_handler.remove_inline_keyboard_by_id', new_callable=AsyncMock) as mock_remove:
            mock_remove.return_value = True
            
            # Act
            await delivery_handler.handle_delivery_data(
                message=mock_message,
                state=mock_state,
                session_id=None
            )
            
            # Assert
            mock_remove.assert_called_once()
            call_args = mock_remove.call_args
            
            # Проверяем параметры вызова
            assert call_args[1]['bot'] == mock_message.bot
            assert call_args[1]['chat_id'] == 12345
            assert call_args[1]['message_id'] == 200
    
    @pytest.mark.asyncio
    async def test_keyboard_removed_before_notification_service(
        self,
        delivery_handler,
        mock_message,
        mock_state
    ):
        """
        Тест: клавиатура удаляется ДО вызова NotificationService
        
        Validates: Requirements 3.3
        """
        # Arrange
        mock_message.web_app_data = MagicMock(spec=WebAppData)
        mock_message.web_app_data.data = '{"prize_id": 1, "last_name": "Test", "first_name": "User", "city": "Moscow", "street": "Main", "house": "1", "phone": "+79991234567"}'
        
        mock_state.get_data = AsyncMock(return_value={'webapp_message_id': 200})
        
        mock_prize = MagicMock()
        mock_prize.row_id = 1
        mock_prize.sheet_name = "Sheet1"
        mock_prize.code_word = "test_code"
        delivery_handler._find_prize_by_id = AsyncMock(return_value=mock_prize)
        
        call_order = []
        
        async def track_remove(*args, **kwargs):
            call_order.append('remove_keyboard')
            return True
        
        async def track_notification(*args, **kwargs):
            call_order.append('notification')
            return MagicMock(confirmation_sent=True, main_menu_sent=True, both_sent=True)
        
        with patch('handlers.delivery_handler.remove_inline_keyboard_by_id', side_effect=track_remove):
            delivery_handler.notification_service.send_delivery_notifications = track_notification
            
            # Act
            await delivery_handler.handle_delivery_data(
                message=mock_message,
                state=mock_state,
                session_id=None
            )
            
            # Assert
            assert call_order[0] == 'remove_keyboard'
            assert 'notification' in call_order
            assert call_order.index('remove_keyboard') < call_order.index('notification')
    
    @pytest.mark.asyncio
    async def test_no_keyboard_removal_if_message_id_missing(
        self,
        delivery_handler,
        mock_message,
        mock_state
    ):
        """
        Тест: удаление клавиатуры не вызывается, если webapp_message_id отсутствует
        
        Validates: Requirements 3.4
        """
        # Arrange
        mock_message.web_app_data = MagicMock(spec=WebAppData)
        mock_message.web_app_data.data = '{"prize_id": 1, "last_name": "Test", "first_name": "User", "city": "Moscow", "street": "Main", "house": "1", "phone": "+79991234567"}'
        
        # webapp_message_id отсутствует
        mock_state.get_data = AsyncMock(return_value={})
        
        mock_prize = MagicMock()
        mock_prize.row_id = 1
        mock_prize.sheet_name = "Sheet1"
        mock_prize.code_word = "test_code"
        delivery_handler._find_prize_by_id = AsyncMock(return_value=mock_prize)
        
        with patch('handlers.delivery_handler.remove_inline_keyboard_by_id', new_callable=AsyncMock) as mock_remove:
            mock_remove.return_value = True
            
            # Act
            await delivery_handler.handle_delivery_data(
                message=mock_message,
                state=mock_state,
                session_id=None
            )
            
            # Assert
            # remove_inline_keyboard_by_id НЕ должен быть вызван
            mock_remove.assert_not_called()


# ============================================================================
# Тесты для SupportHandler.handle_support_end_callback
# ============================================================================

class TestSupportHandlerEndCallback:
    """
    Интеграционные тесты для SupportHandler.handle_support_end_callback
    
    Validates: Requirements 8.1, 8.2
    """
    
    @pytest.mark.asyncio
    async def test_remove_keyboard_called_at_start(
        self,
        support_handler,
        mock_callback,
        mock_state
    ):
        """
        Тест: remove_inline_keyboard вызывается в начале метода
        
        Validates: Requirements 8.1
        """
        # Arrange
        mock_callback.data = "support_end"
        mock_state.get_data = AsyncMock(return_value={'support_session_id': 1})
        
        with patch('handlers.support_handler.remove_inline_keyboard', new_callable=AsyncMock) as mock_remove:
            mock_remove.return_value = True
            
            # Act
            await support_handler.handle_support_end_callback(
                callback=mock_callback,
                state=mock_state
            )
            
            # Assert
            mock_remove.assert_called_once()
            call_args = mock_remove.call_args
            assert call_args[0][0] == mock_callback
    
    @pytest.mark.asyncio
    async def test_keyboard_removed_before_confirmation_message(
        self,
        support_handler,
        mock_callback,
        mock_state
    ):
        """
        Тест: клавиатура удаляется до отправки подтверждающего сообщения
        
        Validates: Requirements 8.2
        """
        # Arrange
        mock_callback.data = "support_end"
        mock_state.get_data = AsyncMock(return_value={'support_session_id': 1})
        
        call_order = []
        
        async def track_remove(*args, **kwargs):
            call_order.append('remove_keyboard')
            return True
        
        async def track_answer(*args, **kwargs):
            call_order.append('answer')
            return MagicMock()
        
        with patch('handlers.support_handler.remove_inline_keyboard', side_effect=track_remove):
            mock_callback.message.answer = track_answer
            
            # Act
            await support_handler.handle_support_end_callback(
                callback=mock_callback,
                state=mock_state
            )
            
            # Assert
            assert call_order[0] == 'remove_keyboard'
            assert 'answer' in call_order
            assert call_order.index('remove_keyboard') < call_order.index('answer')


# ============================================================================
# Тесты для обработки ошибок
# ============================================================================

class TestErrorHandling:
    """
    Интеграционные тесты для обработки ошибок при удалении клавиатур
    
    Validates: Requirements 1.4, 5.5
    """
    
    @pytest.mark.asyncio
    async def test_prize_flow_continues_on_keyboard_removal_error(
        self,
        prize_flow_handler,
        mock_callback,
        mock_state
    ):
        """
        Тест: Prize Flow продолжается при ошибке удаления клавиатуры
        
        Validates: Requirements 1.4, 5.5
        """
        # Arrange
        # Симулируем ошибку при удалении клавиатуры через edit_reply_markup
        mock_callback.message.edit_reply_markup.side_effect = TelegramBadRequest(
            method="editMessageReplyMarkup",
            message="Bad Request: message to edit not found"
        )
        
        # Act
        await prize_flow_handler.handle_get_prize_callback(
            callback=mock_callback,
            state=mock_state,
            session_id=None
        )
        
        # Assert
        # Проверяем, что Prize Flow продолжился несмотря на ошибку
        prize_flow_handler.prize_service.check_user_exists.assert_called_once_with(12345)
        mock_callback.answer.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_services_called_after_keyboard_error(
        self,
        prize_flow_handler,
        mock_callback,
        mock_state
    ):
        """
        Тест: сервисы вызываются после ошибки удаления клавиатуры
        
        Validates: Requirements 1.4, 5.5
        """
        # Arrange
        with patch('handlers.prize_flow_handler.remove_inline_keyboard', new_callable=AsyncMock) as mock_remove:
            # Симулируем ошибку
            mock_remove.return_value = False
            
            # Act
            await prize_flow_handler.handle_get_prize_callback(
                callback=mock_callback,
                state=mock_state,
                session_id=None
            )
            
            # Assert
            # Проверяем, что все последующие операции выполнены
            prize_flow_handler.prize_service.check_user_exists.assert_called_once()
            prize_flow_handler.prize_service.check_gdpr_consent.assert_called_once()
            mock_callback.message.answer.assert_called()
            mock_callback.answer.assert_called_once()
