"""
Property-based тесты для Prize Flow интеграции.

Проверяют универсальные свойства корректности Prize Flow
на большом количестве сгенерированных входных данных.
"""

import pytest
from hypothesis import given, strategies as st, settings, assume
from unittest.mock import AsyncMock, MagicMock
from aiogram.types import Message, User
from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.fsm.storage.base import StorageKey

from handlers.prize_flow_handler import PrizeFlowHandler
from services.prize_service import PrizeService, PrizeStatus, PrizeResult
from fsm.states import PrizeFlowStates


# Стратегии для генерации данных
telegram_ids = st.integers(min_value=1, max_value=999999999)
usernames = st.text(min_size=3, max_size=20, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')))
code_words = st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')))
promo_codes = st.text(min_size=5, max_size=20, alphabet=st.characters(whitelist_categories=('Lu', 'Nd')))
prize_ids = st.integers(min_value=1, max_value=10000)


def create_mock_message(telegram_id: int, username: str, text: str = None):
    """Создаёт mock Message с заданными параметрами"""
    message = MagicMock(spec=Message)
    message.from_user = MagicMock(spec=User)
    message.from_user.id = telegram_id
    message.from_user.username = username
    message.from_user.first_name = username
    message.answer = AsyncMock()
    message.text = text
    message.web_app_data = None
    return message


async def create_fsm_context():
    """Создаёт FSM контекст для тестов"""
    storage = MemoryStorage()
    key = StorageKey(bot_id=123, chat_id=456, user_id=789)
    context = FSMContext(storage=storage, key=key)
    return context, storage


class TestPrizeFlowStateResetProperty:
    """Property 19: FSM State Reset on Completion"""
    
    @pytest.mark.asyncio
    @given(
        telegram_id=telegram_ids,
        username=usernames,
        code_word=code_words,
        promo_code=promo_codes
    )
    @settings(max_examples=50, deadline=5000)
    async def test_fsm_state_reset_on_digital_prize_completion(
        self,
        telegram_id: int,
        username: str,
        code_word: str,
        promo_code: str
    ):
        """
        Property 19: FSM State Reset on Completion (Digital Prize)
        
        Validates: Requirements 4.5, 6.5
        
        Для любого завершённого флоу получения цифрового приза,
        FSM состояние должно быть сброшено в default_state (None).
        """
        # Arrange
        mock_prize_service = AsyncMock(spec=PrizeService)
        mock_session_manager = AsyncMock()
        mock_session_manager.save_bot_message = AsyncMock()
        
        handler = PrizeFlowHandler(
            prize_service=mock_prize_service,
            session_manager=mock_session_manager,
            webapp_url="https://example.com/webapp"
        )
        
        mock_prize_service.check_user_exists.return_value = True
        mock_prize_service.check_gdpr_consent.return_value = True
        mock_prize_service.validate_code_word.return_value = True
        mock_prize_service.check_prize.return_value = PrizeResult(
            status=PrizeStatus.DIGITAL,
            promo_code=promo_code,
            instructions="Test instructions",
            prize_id=None
        )
        
        message = create_mock_message(telegram_id, username, code_word)
        fsm_context, storage = await create_fsm_context()
        
        try:
            # Act - Полный флоу: start -> code_word -> digital prize
            await handler.start_prize_flow(message, fsm_context, session_id=1)
            await handler.handle_code_word_input(message, fsm_context, session_id=1)
            
            # Assert - FSM состояние должно быть сброшено
            final_state = await fsm_context.get_state()
            assert final_state is None, (
                f"FSM state должно быть None после завершения digital prize flow, "
                f"но получено: {final_state}"
            )
        
        finally:
            await storage.close()
    
    @pytest.mark.asyncio
    @given(
        telegram_id=telegram_ids,
        username=usernames,
        code_word=code_words,
        prize_id=prize_ids
    )
    @settings(max_examples=50, deadline=5000)
    async def test_fsm_state_set_on_physical_prize_form_sent(
        self,
        telegram_id: int,
        username: str,
        code_word: str,
        prize_id: int
    ):
        """
        Property 19: FSM State Set on Physical Prize Form Sent
        
        Validates: Requirements 7.3
        
        Для любого физического приза, после отправки WebApp формы,
        FSM состояние должно быть waiting_for_delivery_data.
        """
        # Arrange
        mock_prize_service = AsyncMock(spec=PrizeService)
        mock_session_manager = AsyncMock()
        mock_session_manager.save_bot_message = AsyncMock()
        
        handler = PrizeFlowHandler(
            prize_service=mock_prize_service,
            session_manager=mock_session_manager,
            webapp_url="https://example.com/webapp"
        )
        
        mock_prize_service.check_user_exists.return_value = True
        mock_prize_service.check_gdpr_consent.return_value = True
        mock_prize_service.validate_code_word.return_value = True
        mock_prize_service.check_prize.return_value = PrizeResult(
            status=PrizeStatus.PHYSICAL,
            promo_code=None,
            instructions=None,
            prize_id=prize_id
        )
        
        message = create_mock_message(telegram_id, username, code_word)
        fsm_context, storage = await create_fsm_context()
        
        try:
            # Act - Полный флоу: start -> code_word -> physical prize form
            await handler.start_prize_flow(message, fsm_context, session_id=1)
            await handler.handle_code_word_input(message, fsm_context, session_id=1)
            
            # Assert - FSM состояние должно быть waiting_for_delivery_data
            final_state = await fsm_context.get_state()
            assert final_state == PrizeFlowStates.waiting_for_delivery_data, (
                f"FSM state должно быть waiting_for_delivery_data после отправки physical prize form, "
                f"но получено: {final_state}"
            )
        
        finally:
            await storage.close()
    
    @pytest.mark.asyncio
    @given(
        telegram_id=telegram_ids,
        username=usernames
    )
    @settings(max_examples=50, deadline=5000)
    async def test_fsm_state_reset_on_back_button(
        self,
        telegram_id: int,
        username: str
    ):
        """
        Property 19: FSM State Reset on Back Button
        
        Validates: Requirements 8.3
        
        Для любого пользователя, нажавшего кнопку "Назад" в состоянии waiting_for_consent,
        FSM состояние должно быть сброшено в default_state (None).
        """
        # Arrange
        mock_prize_service = AsyncMock(spec=PrizeService)
        mock_session_manager = AsyncMock()
        mock_session_manager.save_bot_message = AsyncMock()
        
        handler = PrizeFlowHandler(
            prize_service=mock_prize_service,
            session_manager=mock_session_manager,
            webapp_url="https://example.com/webapp"
        )
        
        mock_prize_service.check_user_exists.return_value = True
        mock_prize_service.check_gdpr_consent.return_value = False
        
        message = create_mock_message(telegram_id, username, "◀️ Назад")
        fsm_context, storage = await create_fsm_context()
        
        try:
            # Act - Флоу: start (запрос согласия) -> back button
            await handler.start_prize_flow(message, fsm_context, session_id=1)
            
            # Проверяем, что состояние установлено
            state_after_start = await fsm_context.get_state()
            assert state_after_start == PrizeFlowStates.waiting_for_consent
            
            # Нажатие кнопки "Назад"
            await handler.handle_consent_response(message, fsm_context, session_id=1)
            
            # Assert - FSM состояние должно быть сброшено
            final_state = await fsm_context.get_state()
            assert final_state is None, (
                f"FSM state должно быть None после нажатия кнопки Назад, "
                f"но получено: {final_state}"
            )
        
        finally:
            await storage.close()
    
    @pytest.mark.asyncio
    @given(
        telegram_id=telegram_ids,
        username=usernames
    )
    @settings(max_examples=50, deadline=5000)
    async def test_fsm_state_not_set_on_user_not_found(
        self,
        telegram_id: int,
        username: str
    ):
        """
        Property 19: FSM State Not Set on User Not Found
        
        Validates: Requirements 2.6
        
        Для любого пользователя, не найденного в таблице призов,
        FSM состояние НЕ должно устанавливаться (остаётся None).
        """
        # Arrange
        mock_prize_service = AsyncMock(spec=PrizeService)
        mock_session_manager = AsyncMock()
        mock_session_manager.save_bot_message = AsyncMock()
        
        handler = PrizeFlowHandler(
            prize_service=mock_prize_service,
            session_manager=mock_session_manager,
            webapp_url="https://example.com/webapp"
        )
        
        mock_prize_service.check_user_exists.return_value = False
        
        message = create_mock_message(telegram_id, username, "🎁 Получить приз")
        fsm_context, storage = await create_fsm_context()
        
        try:
            # Act - Флоу: start (пользователь не найден)
            await handler.start_prize_flow(message, fsm_context, session_id=1)
            
            # Assert - FSM состояние НЕ должно быть установлено
            final_state = await fsm_context.get_state()
            assert final_state is None, (
                f"FSM state должно быть None когда пользователь не найден, "
                f"но получено: {final_state}"
            )
        
        finally:
            await storage.close()



class TestMainMenuDisplayProperty:
    """Property 20: Main Menu Display on Completion"""
    
    @pytest.mark.asyncio
    @given(
        telegram_id=telegram_ids,
        username=usernames,
        code_word=code_words,
        promo_code=promo_codes
    )
    @settings(max_examples=50, deadline=5000)
    async def test_main_menu_displayed_on_digital_prize_completion(
        self,
        telegram_id: int,
        username: str,
        code_word: str,
        promo_code: str
    ):
        """
        Property 20: Main Menu Display on Digital Prize Completion
        
        Validates: Requirements 6.4
        
        Для любого завершённого флоу получения цифрового приза,
        главное меню должно быть отображено.
        """
        # Arrange
        mock_prize_service = AsyncMock(spec=PrizeService)
        mock_session_manager = AsyncMock()
        mock_session_manager.save_bot_message = AsyncMock()
        
        handler = PrizeFlowHandler(
            prize_service=mock_prize_service,
            session_manager=mock_session_manager,
            webapp_url="https://example.com/webapp"
        )
        
        mock_prize_service.check_user_exists.return_value = True
        mock_prize_service.check_gdpr_consent.return_value = True
        mock_prize_service.validate_code_word.return_value = True
        mock_prize_service.check_prize.return_value = PrizeResult(
            status=PrizeStatus.DIGITAL,
            promo_code=promo_code,
            instructions="Test instructions",
            prize_id=None
        )
        
        message = create_mock_message(telegram_id, username, code_word)
        fsm_context, storage = await create_fsm_context()
        
        try:
            # Act - Полный флоу: start -> code_word -> digital prize
            await handler.start_prize_flow(message, fsm_context, session_id=1)
            message.answer.reset_mock()
            await handler.handle_code_word_input(message, fsm_context, session_id=1)
            
            # Assert - Главное меню должно быть отображено
            # Проверяем, что был вызов answer с reply_markup
            assert message.answer.call_count >= 1, "Должно быть отправлено хотя бы одно сообщение"
            
            # Проверяем, что хотя бы один вызов содержит reply_markup (главное меню)
            has_keyboard = any(
                'reply_markup' in call.kwargs and call.kwargs['reply_markup'] is not None
                for call in message.answer.call_args_list
            )
            assert has_keyboard, "Главное меню должно быть отображено после выдачи цифрового приза"
        
        finally:
            await storage.close()
    
    @pytest.mark.asyncio
    @given(
        telegram_id=telegram_ids,
        username=usernames
    )
    @settings(max_examples=50, deadline=5000)
    async def test_main_menu_displayed_on_user_not_found(
        self,
        telegram_id: int,
        username: str
    ):
        """
        Property 20: Main Menu Display on User Not Found
        
        Validates: Requirements 2.6
        
        Для любого пользователя, не найденного в таблице призов,
        главное меню должно быть отображено.
        """
        # Arrange
        mock_prize_service = AsyncMock(spec=PrizeService)
        mock_session_manager = AsyncMock()
        mock_session_manager.save_bot_message = AsyncMock()
        
        handler = PrizeFlowHandler(
            prize_service=mock_prize_service,
            session_manager=mock_session_manager,
            webapp_url="https://example.com/webapp"
        )
        
        mock_prize_service.check_user_exists.return_value = False
        
        message = create_mock_message(telegram_id, username, "🎁 Получить приз")
        fsm_context, storage = await create_fsm_context()
        
        try:
            # Act - Флоу: start (пользователь не найден)
            await handler.start_prize_flow(message, fsm_context, session_id=1)
            
            # Assert - Главное меню должно быть отображено
            assert message.answer.call_count >= 1, "Должно быть отправлено хотя бы одно сообщение"
            
            # Проверяем, что был вызов answer с reply_markup
            has_keyboard = any(
                'reply_markup' in call.kwargs and call.kwargs['reply_markup'] is not None
                for call in message.answer.call_args_list
            )
            assert has_keyboard, "Главное меню должно быть отображено когда пользователь не найден"
        
        finally:
            await storage.close()
    
    @pytest.mark.asyncio
    @given(
        telegram_id=telegram_ids,
        username=usernames
    )
    @settings(max_examples=50, deadline=5000)
    async def test_main_menu_displayed_on_back_button(
        self,
        telegram_id: int,
        username: str
    ):
        """
        Property 20: Main Menu Display on Back Button
        
        Validates: Requirements 8.2
        
        Для любого пользователя, нажавшего кнопку "Назад",
        главное меню должно быть отображено.
        """
        # Arrange
        mock_prize_service = AsyncMock(spec=PrizeService)
        mock_session_manager = AsyncMock()
        mock_session_manager.save_bot_message = AsyncMock()
        
        handler = PrizeFlowHandler(
            prize_service=mock_prize_service,
            session_manager=mock_session_manager,
            webapp_url="https://example.com/webapp"
        )
        
        mock_prize_service.check_user_exists.return_value = True
        mock_prize_service.check_gdpr_consent.return_value = False
        
        message = create_mock_message(telegram_id, username, "◀️ Назад")
        fsm_context, storage = await create_fsm_context()
        
        try:
            # Act - Флоу: start (запрос согласия) -> back button
            await handler.start_prize_flow(message, fsm_context, session_id=1)
            message.answer.reset_mock()
            await handler.handle_consent_response(message, fsm_context, session_id=1)
            
            # Assert - Главное меню должно быть отображено
            assert message.answer.call_count >= 1, "Должно быть отправлено хотя бы одно сообщение"
            
            # Проверяем, что был вызов answer с reply_markup
            has_keyboard = any(
                'reply_markup' in call.kwargs and call.kwargs['reply_markup'] is not None
                for call in message.answer.call_args_list
            )
            assert has_keyboard, "Главное меню должно быть отображено после нажатия кнопки Назад"
        
        finally:
            await storage.close()
    
    @pytest.mark.asyncio
    @given(
        telegram_id=telegram_ids,
        username=usernames
    )
    @settings(max_examples=30, deadline=5000)
    async def test_main_menu_idempotence(
        self,
        telegram_id: int,
        username: str
    ):
        """
        Property 20: Main Menu Display Idempotence
        
        Validates: Requirements 2.6, 6.4, 8.2
        
        Отображение главного меню должно быть идемпотентным -
        повторное отображение не должно изменять состояние системы.
        """
        # Arrange
        mock_prize_service = AsyncMock(spec=PrizeService)
        mock_session_manager = AsyncMock()
        mock_session_manager.save_bot_message = AsyncMock()
        
        handler = PrizeFlowHandler(
            prize_service=mock_prize_service,
            session_manager=mock_session_manager,
            webapp_url="https://example.com/webapp"
        )
        
        mock_prize_service.check_user_exists.return_value = False
        
        message = create_mock_message(telegram_id, username, "🎁 Получить приз")
        fsm_context, storage = await create_fsm_context()
        
        try:
            # Act - Вызываем start_prize_flow дважды (пользователь не найден)
            await handler.start_prize_flow(message, fsm_context, session_id=1)
            state_after_first = await fsm_context.get_state()
            
            message.answer.reset_mock()
            await handler.start_prize_flow(message, fsm_context, session_id=1)
            state_after_second = await fsm_context.get_state()
            
            # Assert - Состояние должно остаться неизменным
            assert state_after_first == state_after_second, (
                f"Повторное отображение главного меню должно быть идемпотентным, "
                f"но состояние изменилось с {state_after_first} на {state_after_second}"
            )
            assert state_after_second is None, "Состояние должно оставаться None"
        
        finally:
            await storage.close()
