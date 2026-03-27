"""
Модуль FSM состояний для управления диалогами бота.
Определяет состояния конечного автомата для различных режимов работы.
"""

from aiogram.fsm.state import State, StatesGroup


class SupportStates(StatesGroup):
    """
    Состояния для режима поддержки.
    
    Attributes:
        in_support: Пользователь находится в режиме общения с поддержкой.
                   В этом состоянии все сообщения перехватываются и сохраняются в БД.
    """
    in_support = State()


class PrizeFlowStates(StatesGroup):
    """
    Состояния для процесса получения приза.
    
    Управляет диалогом от нажатия кнопки "Получить приз" 
    до выдачи промокода или заполнения формы доставки.
    
    Переходы между состояниями:
    
    default_state 
        → waiting_for_consent (при отсутствии GDPR согласия)
        → waiting_for_code_word (при наличии GDPR согласия)
    
    waiting_for_consent
        → waiting_for_code_word (при нажатии "Согласен")
        → default_state (при нажатии "Назад")
    
    waiting_for_code_word
        → waiting_for_delivery_data (при верном кодовом слове для физического приза)
        → default_state (при верном кодовом слове для цифрового приза)
        → waiting_for_code_word (при неверном кодовом слове - остаётся в состоянии)
    
    waiting_for_delivery_data
        → default_state (при получении данных из WebApp)
    
    Attributes:
        waiting_for_consent: Ожидание согласия на обработку персональных данных.
        waiting_for_code_word: Ожидание ввода кодового слова для получения приза.
        waiting_for_delivery_data: Ожидание данных доставки из WebApp формы.
    """
    waiting_for_consent = State()
    waiting_for_code_word = State()
    waiting_for_delivery_data = State()
