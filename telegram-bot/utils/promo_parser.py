"""
Модуль парсинга промокодов и инструкций из базы данных.

Этот модуль отвечает за разбор строк с промокодами и инструкциями,
разделёнными символом тильды (~), и объединение их в структурированные данные.
"""

from typing import List, Optional
from dataclasses import dataclass
from utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class PromoCodeData:
    """
    Структура данных для одного промокода с инструкцией.
    
    Attributes:
        promo_code: Промокод
        instructions: Инструкция по использованию
    """
    promo_code: str
    instructions: str


class PromoCodeParser:
    """Парсер промокодов и инструкций из базы данных."""
    
    SEPARATOR: str = "~"
    DEFAULT_INSTRUCTION: str = "Используйте промокод при оформлении заказа"
    
    @staticmethod
    def parse_promo_codes(promo_code_string: Optional[str]) -> List[str]:
        """
        Парсит строку с промокодами, разделёнными тильдой.
        
        Args:
            promo_code_string: Строка с промокодами (например "CODE1~CODE2~CODE3")
            
        Returns:
            Список промокодов (пустой список если строка пустая или None)
            
        Validates: Requirements 1.1, 1.5, 5.2, 5.3
        """
        # Обработка None и пустых строк
        if not promo_code_string or promo_code_string.strip() == "":
            logger.info(
                "empty_promo_code_string",
                promo_code_string=promo_code_string
            )
            return []
        
        # Разделение по символу ~
        codes = promo_code_string.split(PromoCodeParser.SEPARATOR)
        
        # Фильтрация пустых элементов (обработка множественных ~~)
        filtered_codes = [code.strip() for code in codes if code.strip()]
        
        # Логирование если были отфильтрованы пустые элементы
        if len(codes) != len(filtered_codes):
            logger.warning(
                "empty_elements_filtered_from_promo_codes",
                original_count=len(codes),
                filtered_count=len(filtered_codes)
            )
        
        return filtered_codes
    
    @staticmethod
    def parse_instructions(instructions_string: Optional[str]) -> List[str]:
        """
        Парсит строку с инструкциями, разделёнными тильдой.
        
        Args:
            instructions_string: Строка с инструкциями (например "Инстр1~Инстр2~Инстр3")
            
        Returns:
            Список инструкций (пустой список если строка пустая или None)
            
        Validates: Requirements 1.2, 1.5, 5.3
        """
        # Обработка None и пустых строк
        if not instructions_string or instructions_string.strip() == "":
            logger.info(
                "empty_instructions_string",
                instructions_string=instructions_string
            )
            return []
        
        # Разделение по символу ~
        instructions = instructions_string.split(PromoCodeParser.SEPARATOR)
        
        # Фильтрация пустых элементов (обработка множественных ~~)
        filtered_instructions = [instr.strip() for instr in instructions if instr.strip()]
        
        # Логирование если были отфильтрованы пустые элементы
        if len(instructions) != len(filtered_instructions):
            logger.warning(
                "empty_elements_filtered_from_instructions",
                original_count=len(instructions),
                filtered_count=len(filtered_instructions)
            )
        
        return filtered_instructions
    
    @staticmethod
    def combine_promo_data(
        promo_codes: List[str],
        instructions: List[str],
        telegram_id: int,
        prize_id: Optional[int] = None
    ) -> List[PromoCodeData]:
        """
        Объединяет промокоды и инструкции в единую структуру данных.
        
        Args:
            promo_codes: Список промокодов
            instructions: Список инструкций
            telegram_id: Telegram ID пользователя (для логирования)
            prize_id: ID приза (для логирования, опционально)
            
        Returns:
            Список PromoCodeData с парами промокод-инструкция
            
        Validates: Requirements 1.3, 1.4, 5.4
        
        Логика:
        - Если количество промокодов == количество инструкций: связываем по индексу
        - Если инструкций меньше: используем DEFAULT_INSTRUCTION для недостающих
        - Если инструкций больше: игнорируем лишние инструкции
        - Логирует предупреждение при несоответствии количества
        """
        promo_count = len(promo_codes)
        instructions_count = len(instructions)
        
        # Логирование несоответствия количества
        if promo_count != instructions_count:
            logger.warning(
                "promo_instructions_count_mismatch",
                telegram_id=telegram_id,
                prize_id=prize_id,
                promo_count=promo_count,
                instructions_count=instructions_count
            )
        
        # Объединение промокодов и инструкций
        result = []
        for i, promo_code in enumerate(promo_codes):
            # Если есть инструкция с таким индексом - использовать её
            # Иначе - использовать инструкцию по умолчанию
            instruction = (
                instructions[i] 
                if i < instructions_count 
                else PromoCodeParser.DEFAULT_INSTRUCTION
            )
            
            result.append(PromoCodeData(
                promo_code=promo_code,
                instructions=instruction
            ))
        
        logger.info(
            "promo_data_combined",
            telegram_id=telegram_id,
            prize_id=prize_id,
            combined_count=len(result)
        )
        
        return result
