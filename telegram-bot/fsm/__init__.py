"""
Модуль FSM состояний для управления диалогами.
"""

from .states import SupportStates
from .storage import create_fsm_storage

__all__ = ['SupportStates', 'create_fsm_storage']
