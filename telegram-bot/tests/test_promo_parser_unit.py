"""
Unit Tests для PromoCodeParser

Эти тесты проверяют конкретные примеры, граничные случаи и условия ошибок
для парсера промокодов.
"""
import pytest

from utils.promo_parser import PromoCodeParser, PromoCodeData


class TestPromoCodeParserParsing:
    """Тесты для методов парсинга промокодов и инструкций"""
    
    def test_parse_single_promo_code_without_separator(self):
        """
        Граничный случай: один промокод без разделителя
        
        Validates: Requirements 1.1, 5.2
        """
        # Arrange
        promo_string = "SUMMER2024"
        
        # Act
        result = PromoCodeParser.parse_promo_codes(promo_string)
        
        # Assert
        assert len(result) == 1, "Должен вернуть массив с одним элементом"
        assert result[0] == "SUMMER2024", "Промокод должен совпадать с исходным"
    
    def test_parse_empty_string_promo_codes(self):
        """
        Граничный случай: пустая строка промокодов
        
        Validates: Requirements 1.5
        """
        # Arrange
        promo_string = ""
        
        # Act
        result = PromoCodeParser.parse_promo_codes(promo_string)
        
        # Assert
        assert result == [], "Должен вернуть пустой массив для пустой строки"
    
    def test_parse_none_promo_codes(self):
        """
        Граничный случай: None вместо строки промокодов
        
        Validates: Requirements 1.5
        """
        # Arrange
        promo_string = None
        
        # Act
        result = PromoCodeParser.parse_promo_codes(promo_string)
        
        # Assert
        assert result == [], "Должен вернуть пустой массив для None"
    
    def test_parse_whitespace_only_promo_codes(self):
        """
        Граничный случай: строка только из пробелов
        
        Validates: Requirements 1.5
        """
        # Arrange
        promo_string = "   "
        
        # Act
        result = PromoCodeParser.parse_promo_codes(promo_string)
        
        # Assert
        assert result == [], "Должен вернуть пустой массив для строки из пробелов"
    
    def test_parse_multiple_promo_codes(self):
        """
        Пример: несколько промокодов с разделителем
        
        Validates: Requirements 1.1
        """
        # Arrange
        promo_string = "CODE1~CODE2~CODE3"
        
        # Act
        result = PromoCodeParser.parse_promo_codes(promo_string)
        
        # Assert
        assert len(result) == 3, "Должен вернуть массив с тремя элементами"
        assert result == ["CODE1", "CODE2", "CODE3"], "Промокоды должны совпадать"
    
    def test_parse_promo_codes_with_multiple_consecutive_separators(self):
        """
        Граничный случай: множественные последовательные разделители
        
        Validates: Requirements 5.3
        """
        # Arrange
        promo_string = "CODE1~~CODE2~~~CODE3"
        
        # Act
        result = PromoCodeParser.parse_promo_codes(promo_string)
        
        # Assert
        assert len(result) == 3, "Должен отфильтровать пустые элементы"
        assert result == ["CODE1", "CODE2", "CODE3"], "Промокоды должны совпадать"
    
    def test_parse_promo_codes_with_whitespace(self):
        """
        Пример: промокоды с пробелами вокруг
        
        Validates: Requirements 1.1
        """
        # Arrange
        promo_string = " CODE1 ~ CODE2 ~ CODE3 "
        
        # Act
        result = PromoCodeParser.parse_promo_codes(promo_string)
        
        # Assert
        assert len(result) == 3, "Должен вернуть массив с тремя элементами"
        assert result == ["CODE1", "CODE2", "CODE3"], "Пробелы должны быть удалены"
    
    def test_parse_single_instruction_without_separator(self):
        """
        Граничный случай: одна инструкция без разделителя
        
        Validates: Requirements 1.2, 5.2
        """
        # Arrange
        instructions_string = "Используйте промокод при оформлении заказа"
        
        # Act
        result = PromoCodeParser.parse_instructions(instructions_string)
        
        # Assert
        assert len(result) == 1, "Должен вернуть массив с одним элементом"
        assert result[0] == "Используйте промокод при оформлении заказа"
    
    def test_parse_empty_string_instructions(self):
        """
        Граничный случай: пустая строка инструкций
        
        Validates: Requirements 1.5
        """
        # Arrange
        instructions_string = ""
        
        # Act
        result = PromoCodeParser.parse_instructions(instructions_string)
        
        # Assert
        assert result == [], "Должен вернуть пустой массив для пустой строки"
    
    def test_parse_none_instructions(self):
        """
        Граничный случай: None вместо строки инструкций
        
        Validates: Requirements 1.5
        """
        # Arrange
        instructions_string = None
        
        # Act
        result = PromoCodeParser.parse_instructions(instructions_string)
        
        # Assert
        assert result == [], "Должен вернуть пустой массив для None"
    
    def test_parse_multiple_instructions(self):
        """
        Пример: несколько инструкций с разделителем
        
        Validates: Requirements 1.2
        """
        # Arrange
        instructions_string = "Инструкция1~Инструкция2~Инструкция3"
        
        # Act
        result = PromoCodeParser.parse_instructions(instructions_string)
        
        # Assert
        assert len(result) == 3, "Должен вернуть массив с тремя элементами"
        assert result == ["Инструкция1", "Инструкция2", "Инструкция3"]
    
    def test_parse_instructions_with_multiple_consecutive_separators(self):
        """
        Граничный случай: множественные последовательные разделители в инструкциях
        
        Validates: Requirements 5.3
        """
        # Arrange
        instructions_string = "Инструкция1~~Инструкция2~~~Инструкция3"
        
        # Act
        result = PromoCodeParser.parse_instructions(instructions_string)
        
        # Assert
        assert len(result) == 3, "Должен отфильтровать пустые элементы"
        assert result == ["Инструкция1", "Инструкция2", "Инструкция3"]


class TestPromoCodeParserCombining:
    """Тесты для метода объединения промокодов и инструкций"""
    
    def test_combine_equal_length_arrays(self):
        """
        Пример: массивы одинаковой длины
        
        Validates: Requirements 1.3
        """
        # Arrange
        promo_codes = ["CODE1", "CODE2", "CODE3"]
        instructions = ["Инструкция1", "Инструкция2", "Инструкция3"]
        telegram_id = 12345
        
        # Act
        result = PromoCodeParser.combine_promo_data(
            promo_codes=promo_codes,
            instructions=instructions,
            telegram_id=telegram_id
        )
        
        # Assert
        assert len(result) == 3, "Должен вернуть массив с тремя элементами"
        
        for i in range(3):
            assert isinstance(result[i], PromoCodeData), "Элемент должен быть PromoCodeData"
            assert result[i].promo_code == promo_codes[i], f"Промокод {i} должен совпадать"
            assert result[i].instructions == instructions[i], f"Инструкция {i} должна совпадать"
    
    def test_combine_more_promo_codes_than_instructions(self):
        """
        Пример: несоответствие количества - промокодов больше
        
        Validates: Requirements 1.4, 5.4
        """
        # Arrange
        promo_codes = ["CODE1", "CODE2", "CODE3"]
        instructions = ["Инструкция1", "Инструкция2"]
        telegram_id = 12345
        
        # Act
        result = PromoCodeParser.combine_promo_data(
            promo_codes=promo_codes,
            instructions=instructions,
            telegram_id=telegram_id
        )
        
        # Assert
        assert len(result) == 3, "Должен вернуть массив с тремя элементами"
        
        # Первые два элемента должны иметь соответствующие инструкции
        assert result[0].promo_code == "CODE1"
        assert result[0].instructions == "Инструкция1"
        
        assert result[1].promo_code == "CODE2"
        assert result[1].instructions == "Инструкция2"
        
        # Третий элемент должен иметь инструкцию по умолчанию
        assert result[2].promo_code == "CODE3"
        assert result[2].instructions == PromoCodeParser.DEFAULT_INSTRUCTION
    
    def test_combine_more_instructions_than_promo_codes(self):
        """
        Пример: несоответствие количества - инструкций больше
        
        Validates: Requirements 1.3, 1.4
        """
        # Arrange
        promo_codes = ["CODE1", "CODE2"]
        instructions = ["Инструкция1", "Инструкция2", "Инструкция3"]
        telegram_id = 12345
        
        # Act
        result = PromoCodeParser.combine_promo_data(
            promo_codes=promo_codes,
            instructions=instructions,
            telegram_id=telegram_id
        )
        
        # Assert
        assert len(result) == 2, "Должен вернуть массив с двумя элементами (по количеству промокодов)"
        
        # Оба элемента должны иметь соответствующие инструкции
        assert result[0].promo_code == "CODE1"
        assert result[0].instructions == "Инструкция1"
        
        assert result[1].promo_code == "CODE2"
        assert result[1].instructions == "Инструкция2"
        
        # Третья инструкция должна быть проигнорирована
    
    def test_combine_single_promo_code_and_instruction(self):
        """
        Граничный случай: один промокод и одна инструкция
        
        Validates: Requirements 1.3
        """
        # Arrange
        promo_codes = ["SUMMER2024"]
        instructions = ["Скидка 10% на первый заказ"]
        telegram_id = 12345
        
        # Act
        result = PromoCodeParser.combine_promo_data(
            promo_codes=promo_codes,
            instructions=instructions,
            telegram_id=telegram_id
        )
        
        # Assert
        assert len(result) == 1, "Должен вернуть массив с одним элементом"
        assert result[0].promo_code == "SUMMER2024"
        assert result[0].instructions == "Скидка 10% на первый заказ"
    
    def test_combine_promo_codes_with_empty_instructions(self):
        """
        Граничный случай: промокоды есть, инструкций нет
        
        Validates: Requirements 1.4, 5.4
        """
        # Arrange
        promo_codes = ["CODE1", "CODE2"]
        instructions = []
        telegram_id = 12345
        
        # Act
        result = PromoCodeParser.combine_promo_data(
            promo_codes=promo_codes,
            instructions=instructions,
            telegram_id=telegram_id
        )
        
        # Assert
        assert len(result) == 2, "Должен вернуть массив с двумя элементами"
        
        # Все элементы должны иметь инструкцию по умолчанию
        for i in range(2):
            assert result[i].promo_code == promo_codes[i]
            assert result[i].instructions == PromoCodeParser.DEFAULT_INSTRUCTION
    
    def test_combine_with_prize_id(self):
        """
        Пример: объединение с указанием prize_id для логирования
        
        Validates: Requirements 1.3
        """
        # Arrange
        promo_codes = ["CODE1"]
        instructions = ["Инструкция1"]
        telegram_id = 12345
        prize_id = 999
        
        # Act
        result = PromoCodeParser.combine_promo_data(
            promo_codes=promo_codes,
            instructions=instructions,
            telegram_id=telegram_id,
            prize_id=prize_id
        )
        
        # Assert
        assert len(result) == 1, "Должен вернуть массив с одним элементом"
        assert result[0].promo_code == "CODE1"
        assert result[0].instructions == "Инструкция1"


class TestPromoCodeParserIntegration:
    """Интеграционные тесты для полного цикла парсинга и объединения"""
    
    def test_full_cycle_single_promo_code(self):
        """
        Интеграция: полный цикл для одного промокода
        
        Validates: Requirements 1.1, 1.2, 1.3
        """
        # Arrange
        promo_string = "SUMMER2024"
        instructions_string = "Скидка 10% на первый заказ"
        telegram_id = 12345
        
        # Act
        promo_codes = PromoCodeParser.parse_promo_codes(promo_string)
        instructions = PromoCodeParser.parse_instructions(instructions_string)
        result = PromoCodeParser.combine_promo_data(
            promo_codes=promo_codes,
            instructions=instructions,
            telegram_id=telegram_id
        )
        
        # Assert
        assert len(result) == 1
        assert result[0].promo_code == "SUMMER2024"
        assert result[0].instructions == "Скидка 10% на первый заказ"
    
    def test_full_cycle_multiple_promo_codes(self):
        """
        Интеграция: полный цикл для нескольких промокодов
        
        Validates: Requirements 1.1, 1.2, 1.3
        """
        # Arrange
        promo_string = "CODE1~CODE2~CODE3"
        instructions_string = "Инструкция1~Инструкция2~Инструкция3"
        telegram_id = 12345
        
        # Act
        promo_codes = PromoCodeParser.parse_promo_codes(promo_string)
        instructions = PromoCodeParser.parse_instructions(instructions_string)
        result = PromoCodeParser.combine_promo_data(
            promo_codes=promo_codes,
            instructions=instructions,
            telegram_id=telegram_id
        )
        
        # Assert
        assert len(result) == 3
        
        expected = [
            ("CODE1", "Инструкция1"),
            ("CODE2", "Инструкция2"),
            ("CODE3", "Инструкция3")
        ]
        
        for i, (expected_code, expected_instr) in enumerate(expected):
            assert result[i].promo_code == expected_code
            assert result[i].instructions == expected_instr
    
    def test_full_cycle_with_mismatch(self):
        """
        Интеграция: полный цикл с несоответствием количества
        
        Validates: Requirements 1.1, 1.2, 1.3, 1.4, 5.4
        """
        # Arrange
        promo_string = "CODE1~CODE2~CODE3"
        instructions_string = "Инструкция1~Инструкция2"
        telegram_id = 12345
        
        # Act
        promo_codes = PromoCodeParser.parse_promo_codes(promo_string)
        instructions = PromoCodeParser.parse_instructions(instructions_string)
        result = PromoCodeParser.combine_promo_data(
            promo_codes=promo_codes,
            instructions=instructions,
            telegram_id=telegram_id
        )
        
        # Assert
        assert len(result) == 3
        assert result[0].instructions == "Инструкция1"
        assert result[1].instructions == "Инструкция2"
        assert result[2].instructions == PromoCodeParser.DEFAULT_INSTRUCTION
    
    def test_full_cycle_with_multiple_separators(self):
        """
        Интеграция: полный цикл с множественными разделителями
        
        Validates: Requirements 1.1, 1.2, 1.3, 5.3
        """
        # Arrange
        promo_string = "CODE1~~CODE2~~~CODE3"
        instructions_string = "Инструкция1~~Инструкция2~~Инструкция3"
        telegram_id = 12345
        
        # Act
        promo_codes = PromoCodeParser.parse_promo_codes(promo_string)
        instructions = PromoCodeParser.parse_instructions(instructions_string)
        result = PromoCodeParser.combine_promo_data(
            promo_codes=promo_codes,
            instructions=instructions,
            telegram_id=telegram_id
        )
        
        # Assert
        assert len(result) == 3
        assert result[0].promo_code == "CODE1"
        assert result[1].promo_code == "CODE2"
        assert result[2].promo_code == "CODE3"
