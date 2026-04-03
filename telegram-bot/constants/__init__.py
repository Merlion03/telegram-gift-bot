"""
Пакет констант для Telegram бота.

Содержит централизованные константы для текстов сообщений,
конфигурационных параметров и других неизменяемых значений.
"""

from .messages import (
    # Функции для формирования сообщений
    get_welcome_message,
    get_digital_prize_congratulations,
    get_digital_prize_message,
    
    # Приветственные сообщения
    HELP_MESSAGE,
    
    # Prize Flow
    USER_NOT_FOUND_IN_PRIZE_TABLE,
    GDPR_CONSENT_REQUEST,
    CODE_WORD_REQUEST,
    CONSENT_BACK_MESSAGE,
    INVALID_CONSENT_RESPONSE,
    EMPTY_CODE_WORD_HINT,
    INVALID_CODE_WORD,
    PRIZE_ERROR_AFTER_VALIDATION,
    MISSING_PROMO_CODE_ERROR,
    
    # Цифровые призы
    DIGITAL_PRIZE_DEFAULT_INSTRUCTIONS,
    DIGITAL_PRIZE_MENU_MESSAGE,
    
    # Физические призы
    PHYSICAL_PRIZE_INSTRUCTION,
    PHYSICAL_PRIZE_BUTTON_TEXT,
    PHYSICAL_PRIZE_CONGRATULATIONS,
    
    # Сообщения о доставке
    DELIVERY_CONFIRMATION_MESSAGE,
    DELIVERY_MAIN_MENU_MESSAGE,
    DELIVERY_SUCCESS_OLD,
    DELIVERY_DATA_ALREADY_FILLED,
    
    # Prize Handler
    PRIZE_NOT_FOUND_RESPONSE,
    PRIZE_CHECK_ERROR,
    PRIZE_MISSING_PROMO_CODE_SUPPORT,
    
    # Support Handler
    SUPPORT_SESSION_STARTED,
    SUPPORT_START_ERROR,
    SUPPORT_NO_SESSION_ERROR,
    SUPPORT_MESSAGE_SAVE_ERROR,
    SUPPORT_SESSION_ENDED,
    SUPPORT_END_ERROR,
    
    # Ошибки доставки
    ERROR_MISSING_PRIZE_ID,
    ERROR_INVALID_PRIZE_ID,
    ERROR_SERVICE_UNAVAILABLE,
    ERROR_PRIZE_NOT_FOUND,
    ERROR_SHEETS_SAVE_FAILED,
    ERROR_PROCESSING_DATA,
    ERROR_INVALID_JSON,
    
    # Глобальные ошибки
    GLOBAL_ERROR_MESSAGE,
    NETWORK_ERROR_MESSAGE,
)

__all__ = [
    # Функции
    'get_welcome_message',
    'get_digital_prize_congratulations',
    'get_digital_prize_message',
    
    # Приветственные сообщения
    'HELP_MESSAGE',
    
    # Prize Flow
    'USER_NOT_FOUND_IN_PRIZE_TABLE',
    'GDPR_CONSENT_REQUEST',
    'CODE_WORD_REQUEST',
    'CONSENT_BACK_MESSAGE',
    'INVALID_CONSENT_RESPONSE',
    'EMPTY_CODE_WORD_HINT',
    'INVALID_CODE_WORD',
    'PRIZE_ERROR_AFTER_VALIDATION',
    'MISSING_PROMO_CODE_ERROR',
    
    # Цифровые призы
    'DIGITAL_PRIZE_DEFAULT_INSTRUCTIONS',
    'DIGITAL_PRIZE_MENU_MESSAGE',
    
    # Физические призы
    'PHYSICAL_PRIZE_INSTRUCTION',
    'PHYSICAL_PRIZE_BUTTON_TEXT',
    'PHYSICAL_PRIZE_CONGRATULATIONS',
    
    # Сообщения о доставке
    'DELIVERY_CONFIRMATION_MESSAGE',
    'DELIVERY_MAIN_MENU_MESSAGE',
    'DELIVERY_SUCCESS_OLD',
    'DELIVERY_DATA_ALREADY_FILLED',
    
    # Prize Handler
    'PRIZE_NOT_FOUND_RESPONSE',
    'PRIZE_CHECK_ERROR',
    'PRIZE_MISSING_PROMO_CODE_SUPPORT',
    
    # Support Handler
    'SUPPORT_SESSION_STARTED',
    'SUPPORT_START_ERROR',
    'SUPPORT_NO_SESSION_ERROR',
    'SUPPORT_MESSAGE_SAVE_ERROR',
    'SUPPORT_SESSION_ENDED',
    'SUPPORT_END_ERROR',
    
    # Ошибки доставки
    'ERROR_MISSING_PRIZE_ID',
    'ERROR_INVALID_PRIZE_ID',
    'ERROR_SERVICE_UNAVAILABLE',
    'ERROR_PRIZE_NOT_FOUND',
    'ERROR_SHEETS_SAVE_FAILED',
    'ERROR_PROCESSING_DATA',
    'ERROR_INVALID_JSON',
    
    # Глобальные ошибки
    'GLOBAL_ERROR_MESSAGE',
    'NETWORK_ERROR_MESSAGE',
]
