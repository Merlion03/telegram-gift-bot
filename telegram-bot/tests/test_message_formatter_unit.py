"""
Unit-тесты для MessageFormatter.

Эти тесты проверяют конкретные примеры использования, граничные случаи
и условия ошибок для форматирования сообщений с промокодами.
"""

import pytest
from utils.message_formatter import MessageFormatter
from utils.promo_parser import PromoCodeData


class TestEscapeHtml:
    """Тесты для метода escape_html."""
    
    def test_escape_less_than(self):
        """Тест: экранирование символа <"""
        result = MessageFormatter.escape_html("Test <script>")
        assert result == "Test &lt;script&gt;"
    
    def test_escape_greater_than(self):
        """Тест: экранирование символа >"""
        result = MessageFormatter.escape_html("Test >")
        assert result == "Test &gt;"
    
    def test_escape_ampersand(self):
        """Тест: экранирование символа &"""
        result = MessageFormatter.escape_html("Test & more")
        assert result == "Test &amp; more"
    
    def test_escape_all_special_chars(self):
        """Тест: экранирование всех специальных символов"""
        result = MessageFormatter.escape_html("<script>alert('XSS')</script> & more")
        assert "&lt;" in result
        assert "&gt;" in result
        assert "&amp;" in result
        assert "<script>" not in result
    
    def test_escape_no_special_chars(self):
        """Тест: текст без специальных символов остаётся неизменным"""
        text = "Normal text without special chars"
        result = MessageFormatter.escape_html(text)
        assert result == text


class TestFormatSinglePromo:
    """Тесты для метода format_single_promo."""
    
    def test_format_single_promo_basic(self):
        """Тест: базовое форматирование одного промокода"""
        promo_data = PromoCodeData(
            promo_code="SUMMER2024",
            instructions="Скидка 10% на первый заказ"
        )
        
        result = MessageFormatter.format_single_promo(promo_data)
        
        assert "Вот ваш промокод —" in result
        assert "<code>SUMMER2024</code>" in result
        assert "Скидка 10% на первый заказ" in result
    
    def test_format_single_promo_with_special_chars(self):
        """Тест: промокод со специальными символами (не экранируются в этом методе)"""
        promo_data = PromoCodeData(
            promo_code="CODE<123>",
            instructions="Инструкция"
        )
        
        result = MessageFormatter.format_single_promo(promo_data)
        
        # Метод format_single_promo не экранирует символы
        assert "<code>CODE<123></code>" in result


class TestFormatMultiplePromos:
    """Тесты для метода format_multiple_promos."""
    
    def test_format_single_promo_backward_compatibility(self):
        """
        Тест: форматирование одного промокода (обратная совместимость).
        
        Validates: Requirements 6.5
        """
        promo_data = PromoCodeData(
            promo_code="SUMMER2024",
            instructions="Скидка 10%"
        )
        
        result = MessageFormatter.format_multiple_promos([promo_data], telegram_id=12345)
        
        # Проверяем структуру сообщения
        assert MessageFormatter.CONGRATULATIONS_TEXT in result
        assert "<code>SUMMER2024</code>" in result
        assert "Скидка 10%" in result
        assert "Вот ваш промокод —" in result
        assert "Также вот ещё —" not in result  # Не должно быть для одного промокода
        assert MessageFormatter.MENU_PROMPT_TEXT in result
    
    def test_format_multiple_promos_basic(self):
        """
        Тест: форматирование нескольких промокодов.
        
        Validates: Requirements 3.1-3.7, 4.1, 4.2
        """
        promo_data_list = [
            PromoCodeData("CODE1", "Инструкция 1"),
            PromoCodeData("CODE2", "Инструкция 2"),
            PromoCodeData("CODE3", "Инструкция 3")
        ]
        
        result = MessageFormatter.format_multiple_promos(promo_data_list, telegram_id=12345)
        
        # Проверяем поздравление
        assert result.startswith(MessageFormatter.CONGRATULATIONS_TEXT)
        
        # Проверяем все промокоды присутствуют
        assert "<code>CODE1</code>" in result
        assert "<code>CODE2</code>" in result
        assert "<code>CODE3</code>" in result
        
        # Проверяем формат первого промокода
        assert "Вот ваш промокод — <code>CODE1</code>" in result
        
        # Проверяем формат последующих промокодов
        assert "Также вот ещё — <code>CODE2</code>" in result
        assert "Также вот ещё — <code>CODE3</code>" in result
        
        # Проверяем инструкции
        assert "Инструкция 1" in result
        assert "Инструкция 2" in result
        assert "Инструкция 3" in result
        
        # Проверяем текст кнопки меню в конце
        assert result.endswith(MessageFormatter.MENU_PROMPT_TEXT)
    
    def test_format_multiple_promos_order_preserved(self):
        """
        Тест: сохранение порядка промокодов.
        
        Validates: Requirements 3.7
        """
        promo_data_list = [
            PromoCodeData("FIRST", "Первый"),
            PromoCodeData("SECOND", "Второй"),
            PromoCodeData("THIRD", "Третий")
        ]
        
        result = MessageFormatter.format_multiple_promos(promo_data_list, telegram_id=12345)
        
        # Находим позиции промокодов
        pos_first = result.find("<code>FIRST</code>")
        pos_second = result.find("<code>SECOND</code>")
        pos_third = result.find("<code>THIRD</code>")
        
        # Проверяем порядок
        assert pos_first < pos_second < pos_third
    
    def test_format_empty_list(self):
        """Граничный случай: пустой список промокодов"""
        result = MessageFormatter.format_multiple_promos([], telegram_id=12345)
        assert result == ""
    
    def test_format_with_long_instructions(self):
        """Тест: промокоды с длинными инструкциями"""
        promo_data_list = [
            PromoCodeData(
                "CODE1",
                "Очень длинная инструкция " * 20
            ),
            PromoCodeData(
                "CODE2",
                "Ещё одна длинная инструкция " * 20
            )
        ]
        
        result = MessageFormatter.format_multiple_promos(promo_data_list, telegram_id=12345)
        
        # Проверяем, что все элементы присутствуют
        assert "<code>CODE1</code>" in result
        assert "<code>CODE2</code>" in result
        assert "Очень длинная инструкция" in result
        assert "Ещё одна длинная инструкция" in result


class TestSplitMessageIfNeeded:
    """Тесты для метода split_message_if_needed."""
    
    def test_short_message_not_split(self):
        """Тест: короткое сообщение не разделяется"""
        message = "Короткое сообщение"
        result = MessageFormatter.split_message_if_needed(message, telegram_id=12345)
        
        assert len(result) == 1
        assert result[0] == message
    
    def test_message_at_limit_not_split(self):
        """Граничный случай: сообщение ровно на лимите"""
        message = "A" * MessageFormatter.TELEGRAM_MESSAGE_LIMIT
        result = MessageFormatter.split_message_if_needed(message, telegram_id=12345)
        
        assert len(result) == 1
        assert result[0] == message
    
    def test_long_message_split(self):
        """
        Тест: разделение длинного сообщения.
        
        Validates: Requirements 5.5
        """
        # Создаём сообщение длиннее лимита
        promo_data_list = [
            PromoCodeData(f"CODE{i}", "Инструкция " * 100)
            for i in range(30)
        ]
        
        message = MessageFormatter.format_multiple_promos(promo_data_list, telegram_id=12345)
        
        # Убеждаемся, что сообщение действительно длинное
        assert len(message) > MessageFormatter.TELEGRAM_MESSAGE_LIMIT
        
        # Разделяем
        parts = MessageFormatter.split_message_if_needed(message, telegram_id=12345)
        
        # Проверяем, что разделено на несколько частей
        assert len(parts) > 1
        
        # Проверяем, что каждая часть не превышает лимит
        for part in parts:
            assert len(part) <= MessageFormatter.TELEGRAM_MESSAGE_LIMIT
    
    def test_split_preserves_structure(self):
        """Тест: разделение сохраняет структуру блоков"""
        # Создаём сообщение с чёткими блоками
        blocks = [f"Блок {i}\n\n" for i in range(100)]
        message = "".join(blocks)
        
        # Убеждаемся, что сообщение длинное
        assert len(message) > MessageFormatter.TELEGRAM_MESSAGE_LIMIT
        
        parts = MessageFormatter.split_message_if_needed(message, telegram_id=12345)
        
        # Проверяем, что разделено
        assert len(parts) > 1
        
        # Проверяем, что каждая часть не превышает лимит
        for part in parts:
            assert len(part) <= MessageFormatter.TELEGRAM_MESSAGE_LIMIT
    
    def test_empty_message(self):
        """Граничный случай: пустое сообщение"""
        result = MessageFormatter.split_message_if_needed("", telegram_id=12345)
        assert len(result) == 1
        assert result[0] == ""


class TestIntegration:
    """Интеграционные тесты для проверки взаимодействия методов."""
    
    def test_full_flow_single_promo(self):
        """Интеграция: полный поток для одного промокода"""
        promo_data = PromoCodeData("TEST2024", "Тестовая инструкция")
        
        # Форматируем
        message = MessageFormatter.format_multiple_promos([promo_data], telegram_id=12345)
        
        # Разделяем если нужно
        parts = MessageFormatter.split_message_if_needed(message, telegram_id=12345)
        
        # Проверяем результат
        assert len(parts) == 1
        assert MessageFormatter.CONGRATULATIONS_TEXT in parts[0]
        assert "<code>TEST2024</code>" in parts[0]
        assert "Тестовая инструкция" in parts[0]
        assert MessageFormatter.MENU_PROMPT_TEXT in parts[0]
    
    def test_full_flow_multiple_promos(self):
        """Интеграция: полный поток для нескольких промокодов"""
        promo_data_list = [
            PromoCodeData("CODE1", "Инструкция 1"),
            PromoCodeData("CODE2", "Инструкция 2"),
            PromoCodeData("CODE3", "Инструкция 3")
        ]
        
        # Форматируем
        message = MessageFormatter.format_multiple_promos(promo_data_list, telegram_id=12345)
        
        # Разделяем если нужно
        parts = MessageFormatter.split_message_if_needed(message, telegram_id=12345)
        
        # Проверяем результат
        assert len(parts) == 1  # Не должно разделяться для 3 промокодов
        
        full_message = parts[0]
        assert "<code>CODE1</code>" in full_message
        assert "<code>CODE2</code>" in full_message
        assert "<code>CODE3</code>" in full_message
        assert "Вот ваш промокод —" in full_message
        assert full_message.count("Также вот ещё —") == 2
