"""
Модуль форматирования сообщений с промокодами для Telegram.

Этот модуль отвечает за форматирование сообщений с одним или несколькими
промокодами в HTML формате для отправки пользователям Telegram-бота.
"""

from typing import List
from utils.promo_parser import PromoCodeData
from utils.logger import get_logger

logger = get_logger(__name__)


class MessageFormatter:
    """Форматтер сообщений с промокодами для Telegram."""
    
    TELEGRAM_MESSAGE_LIMIT: int = 4096
    CONGRATULATIONS_TEXT: str = "Поздравляем с победой и надеемся снова увидеть вас среди наших участников и победителей :)"
    MENU_PROMPT_TEXT: str = ""
    
    @staticmethod
    def escape_html(text: str) -> str:
        """
        Экранирует специальные HTML символы.
        
        Args:
            text: Исходный текст
            
        Returns:
            Текст с экранированными символами
            
        Validates: Requirements 2.4
        
        Экранирует: <, >, &
        """
        return (
            text
            .replace("&", "&amp;")  # Сначала &, чтобы не экранировать дважды
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )
    
    @staticmethod
    def format_single_promo(promo_data: PromoCodeData) -> str:
        """
        Форматирует сообщение с одним промокодом (обратная совместимость).
        
        Args:
            promo_data: Данные промокода с инструкцией
            
        Returns:
            Отформатированное сообщение в HTML формате
            
        Validates: Requirements 6.5
        
        Формат: "Вот ваш промокод — <code>CODE</code>\nИнструкция"
        """
        return f"Вот ваш промокод — <code>{promo_data.promo_code}</code>\n{promo_data.instructions}"
    
    @staticmethod
    def format_multiple_promos(
        promo_data_list: List[PromoCodeData],
        telegram_id: int
    ) -> str:
        """
        Форматирует сообщение с несколькими промокодами.
        
        Args:
            promo_data_list: Список данных промокодов с инструкциями
            telegram_id: Telegram ID пользователя (для логирования)
            
        Returns:
            Отформатированное сообщение в HTML формате
            
        Validates: Requirements 2.1, 2.2, 3.1-3.7, 4.1, 4.2
        
        Формат сообщения:
        - Поздравление
        - Пустая строка
        - Первый промокод: "Вот ваш промокод — <code>CODE1</code>\nИнструкция1"
        - Последующие: "\nТакже вот ещё — <code>CODE2</code>\nИнструкция2"
        - Пустая строка
        - Текст кнопки меню
        """
        if not promo_data_list:
            logger.warning(
                "empty_promo_data_list_for_formatting",
                telegram_id=telegram_id
            )
            return ""
        
        # Начинаем с поздравления
        message_parts = [MessageFormatter.CONGRATULATIONS_TEXT, ""]
        
        # Форматируем промокоды
        for i, promo_data in enumerate(promo_data_list):
            if i == 0:
                # Первый промокод
                promo_block = f"Вы выиграли промокод — <code>{promo_data.promo_code}</code>\n<blockquote>{promo_data.instructions}</blockquote>"
            elif i == 1:
                # Второй промокод
                promo_block = f"И дарим второй промокод — <code>{promo_data.promo_code}</code>\n<blockquote>{promo_data.instructions}</blockquote>"
            else:
                # Последующие промокоды
                promo_block = f"Ещё промокод — <code>{promo_data.promo_code}</code>\n<blockquote>{promo_data.instructions}</blockquote>"
            
            message_parts.append(promo_block)
            # Добавляем пустую строку после каждого промокода (кроме последнего)
            if i < len(promo_data_list) - 1:
                message_parts.append("")
        
        # Добавляем пустую строку и текст кнопки меню
        message_parts.extend(["", MessageFormatter.MENU_PROMPT_TEXT])
        
        # Объединяем все части через \n
        message = "\n".join(message_parts)
        
        logger.info(
            "message_formatted",
            telegram_id=telegram_id,
            promo_count=len(promo_data_list),
            message_length=len(message)
        )
        
        return message
    
    @staticmethod
    def split_message_if_needed(
        message: str,
        telegram_id: int
    ) -> List[str]:
        """
        Разделяет сообщение на части, если превышен лимит Telegram.
        
        Args:
            message: Исходное сообщение
            telegram_id: Telegram ID пользователя (для логирования)
            
        Returns:
            Список частей сообщения (один элемент если не превышен лимит)
            
        Validates: Requirements 5.5
        
        Логика:
        - Если длина <= 4096: вернуть [message]
        - Иначе: разделить по блокам промокод+инструкция
        - Логировать предупреждение о разделении
        """
        # Если сообщение не превышает лимит - вернуть как есть
        if len(message) <= MessageFormatter.TELEGRAM_MESSAGE_LIMIT:
            return [message]
        
        # Логируем предупреждение о разделении
        logger.warning(
            "message_exceeds_telegram_limit",
            telegram_id=telegram_id,
            message_length=len(message),
            limit=MessageFormatter.TELEGRAM_MESSAGE_LIMIT
        )
        
        # Разделяем сообщение на блоки по двойному переносу строки
        blocks = message.split("\n\n")
        
        parts = []
        current_part = ""
        
        for i, block in enumerate(blocks):
            # Проверяем, поместится ли блок в текущую часть
            test_part = current_part + ("\n\n" if current_part else "") + block
            
            if len(test_part) <= MessageFormatter.TELEGRAM_MESSAGE_LIMIT:
                current_part = test_part
            else:
                # Если текущая часть не пустая - сохраняем её
                if current_part:
                    parts.append(current_part)
                    current_part = block
                else:
                    # Если блок сам по себе больше лимита - разбиваем его
                    # (крайний случай, но обрабатываем)
                    parts.append(block[:MessageFormatter.TELEGRAM_MESSAGE_LIMIT])
                    logger.warning(
                        "single_block_exceeds_limit",
                        telegram_id=telegram_id,
                        block_length=len(block)
                    )
        
        # Добавляем последнюю часть
        if current_part:
            parts.append(current_part)
        
        logger.info(
            "message_split_into_parts",
            telegram_id=telegram_id,
            parts_count=len(parts)
        )
        
        return parts
