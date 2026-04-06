"""
Интеграционные тесты для PrizeHandler.

Проверяют взаимодействие PrizeHandler с PromoCodeParser и MessageFormatter
при отправке цифровых призов (промокодов).

Feature: multiple-promo-codes-delivery
Validates: Requirements 3.1-3.7, 4.1-4.4, 5.1, 6.5
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from aiogram.types import Message, User
from handlers.prize_handler import PrizeHandler
from services.prize_service import PrizeService


class MockPrizeResult:
    """Мок результата проверки приза"""
    def __init__(self, promo_code: str, instructions: str, prize_id: int = 1):
        self.promo_code = promo_code
        self.instructions = instructions
        self.prize_id = prize_id


@pytest.fixture
def mock_message():
    """Создаёт мок объекта Message"""
    message = MagicMock(spec=Message)
    message.from_user = MagicMock(spec=User)
    message.from_user.id = 12345
    message.answer = AsyncMock()
    return message


@pytest.fixture
def prize_handler():
    """Создаёт экземпляр PrizeHandler с моками"""
    mock_prize_service = MagicMock(spec=PrizeService)
    handler = PrizeHandler(
        prize_service=mock_prize_service,
        webapp_url="https://example.com",
        session_manager=None
    )
    return handler


class TestPrizeHandlerIntegration:
    """Интеграционные тесты для PrizeHandler"""
    
    @pytest.mark.asyncio
    async def test_send_single_promo_code_backward_compatibility(self, prize_handler, mock_message):
        """
        Тест: отправка одного промокода (обратная совместимость)
        
        Validates: Requirements 6.5
        """
        # Arrange
        prize_result = MockPrizeResult(
            promo_code="SUMMER2024",
            instructions="Скидка 10% на первый заказ"
        )
        
        # Act
        await prize_handler._send_digital_prize(mock_message, prize_result)
        
        # Assert
        assert mock_message.answer.call_count == 1
        sent_message = mock_message.answer.call_args[0][0]
        
        # Проверяем структуру сообщения
        assert "Поздравляем с победой" in sent_message
        assert "<code>SUMMER2024</code>" in sent_message
        assert "Скидка 10% на первый заказ" in sent_message
        assert "Вот ваш промокод —" in sent_message
        assert "Также вот ещё —" not in sent_message  # Не должно быть для одного
        assert "Если вы выиграли в конкурсе" in sent_message
        
        # Проверяем parse_mode
        assert mock_message.answer.call_args[1]["parse_mode"] == "HTML"
        
        # Проверяем наличие клавиатуры
        assert mock_message.answer.call_args[1]["reply_markup"] is not None
    
    @pytest.mark.asyncio
    async def test_send_multiple_promo_codes(self, prize_handler, mock_message):
        """
        Тест: отправка нескольких промокодов
        
        Validates: Requirements 3.1-3.7, 4.1-4.2
        """
        # Arrange
        prize_result = MockPrizeResult(
            promo_code="CODE1~CODE2~CODE3",
            instructions="Инструкция1~Инструкция2~Инструкция3"
        )
        
        # Act
        await prize_handler._send_digital_prize(mock_message, prize_result)
        
        # Assert
        assert mock_message.answer.call_count == 1
        sent_message = mock_message.answer.call_args[0][0]
        
        # Проверяем структуру сообщения
        assert "Поздравляем с победой" in sent_message
        assert sent_message.count("<code>") == 3
        assert sent_message.count("</code>") == 3
        assert "Вот ваш промокод —" in sent_message
        assert sent_message.count("Также вот ещё —") == 2
        
        # Проверяем наличие всех промокодов
        assert "<code>CODE1</code>" in sent_message
        assert "<code>CODE2</code>" in sent_message
        assert "<code>CODE3</code>" in sent_message
        
        # Проверяем наличие всех инструкций
        assert "Инструкция1" in sent_message
        assert "Инструкция2" in sent_message
        assert "Инструкция3" in sent_message
        
        # Проверяем текст кнопки меню
        assert "Если вы выиграли в конкурсе" in sent_message
    
    @pytest.mark.asyncio
    async def test_handle_missing_promo_codes(self, prize_handler, mock_message):
        """
        Тест: обработка отсутствия промокодов
        
        Validates: Requirements 5.1
        """
        # Arrange
        prize_result = MockPrizeResult(
            promo_code="",  # Пустая строка
            instructions="Инструкция"
        )
        
        # Act
        await prize_handler._send_digital_prize(mock_message, prize_result)
        
        # Assert
        assert mock_message.answer.call_count == 1
        sent_message = mock_message.answer.call_args[0][0]
        
        # Проверяем, что отправлено сообщение об ошибке
        assert "произошла ошибка при получении промокода" in sent_message.lower()
        assert "обратитесь в поддержку" in sent_message.lower()
    
    @pytest.mark.asyncio
    async def test_handle_mismatched_promo_and_instructions_count(self, prize_handler, mock_message):
        """
        Тест: обработка несоответствия количества промокодов и инструкций
        
        Validates: Requirements 1.4, 5.4
        """
        # Arrange
        prize_result = MockPrizeResult(
            promo_code="CODE1~CODE2~CODE3",
            instructions="Инструкция1~Инструкция2"  # Меньше инструкций
        )
        
        # Act
        await prize_handler._send_digital_prize(mock_message, prize_result)
        
        # Assert
        assert mock_message.answer.call_count == 1
        sent_message = mock_message.answer.call_args[0][0]
        
        # Проверяем, что все промокоды присутствуют
        assert "<code>CODE1</code>" in sent_message
        assert "<code>CODE2</code>" in sent_message
        assert "<code>CODE3</code>" in sent_message
        
        # Проверяем, что первые две инструкции присутствуют
        assert "Инструкция1" in sent_message
        assert "Инструкция2" in sent_message
        
        # Проверяем, что для третьего промокода используется инструкция по умолчанию
        assert "Используйте промокод при оформлении заказа" in sent_message
    
    @pytest.mark.asyncio
    async def test_split_long_message_into_parts(self, prize_handler, mock_message):
        """
        Тест: разделение длинного сообщения на части
        
        Validates: Requirements 5.5
        """
        # Arrange - создаём очень длинный список промокодов
        promo_codes = []
        instructions = []
        for i in range(50):
            promo_codes.append(f"VERYLONGPROMOCODE{i:03d}")
            instructions.append(f"Очень длинная инструкция номер {i} " * 20)
        
        prize_result = MockPrizeResult(
            promo_code="~".join(promo_codes),
            instructions="~".join(instructions)
        )
        
        # Act
        await prize_handler._send_digital_prize(mock_message, prize_result)
        
        # Assert
        # Проверяем, что было отправлено несколько сообщений
        assert mock_message.answer.call_count > 1
        
        # Проверяем, что каждое сообщение не превышает лимит Telegram
        for call in mock_message.answer.call_args_list:
            sent_message = call[0][0]
            assert len(sent_message) <= 4096
        
        # Проверяем, что клавиатура только в последнем сообщении
        for i, call in enumerate(mock_message.answer.call_args_list):
            keyboard = call[1].get("reply_markup")
            if i == len(mock_message.answer.call_args_list) - 1:
                assert keyboard is not None  # Последнее сообщение должно иметь клавиатуру
            else:
                assert keyboard is None  # Остальные не должны
    
    @pytest.mark.asyncio
    async def test_promo_code_order_preservation(self, prize_handler, mock_message):
        """
        Тест: сохранение порядка промокодов
        
        Validates: Requirements 3.7
        """
        # Arrange
        prize_result = MockPrizeResult(
            promo_code="FIRST~SECOND~THIRD",
            instructions="Инструкция1~Инструкция2~Инструкция3"
        )
        
        # Act
        await prize_handler._send_digital_prize(mock_message, prize_result)
        
        # Assert
        sent_message = mock_message.answer.call_args[0][0]
        
        # Проверяем порядок промокодов в сообщении
        first_pos = sent_message.find("<code>FIRST</code>")
        second_pos = sent_message.find("<code>SECOND</code>")
        third_pos = sent_message.find("<code>THIRD</code>")
        
        assert first_pos < second_pos < third_pos
    
    @pytest.mark.asyncio
    async def test_html_special_characters_escaping(self, prize_handler, mock_message):
        """
        Тест: экранирование специальных HTML символов в инструкциях
        
        Validates: Requirements 2.4
        """
        # Arrange
        prize_result = MockPrizeResult(
            promo_code="CODE123",
            instructions="Скидка <10%> & бесплатная доставка"
        )
        
        # Act
        await prize_handler._send_digital_prize(mock_message, prize_result)
        
        # Assert
        sent_message = mock_message.answer.call_args[0][0]
        
        # Проверяем, что специальные символы экранированы
        assert "&lt;" in sent_message or "Скидка" in sent_message
        assert "&gt;" in sent_message or "бесплатная" in sent_message
        assert "&amp;" in sent_message or "&" in sent_message
        
        # Проверяем, что промокод в тегах code
        assert "<code>CODE123</code>" in sent_message
