"""
Перечисление ролей администраторов
"""

from enum import IntEnum


class AdminRole(IntEnum):
    """
    Роли администраторов системы
    
    Иерархия ролей (от высшего к низшему):
    - DEVELOPER (0): Полный доступ к системе
    - ASSISTANT (1): Доступ эквивалентный Developer
    - ADMINISTRATOR (2): Может назначать операторов
    - OPERATOR (3): Базовый уровень доступа
    
    Validates: Requirements 2.1, 2.2, 2.3, 2.4
    """
    DEVELOPER = 0
    ASSISTANT = 1
    ADMINISTRATOR = 2
    OPERATOR = 3
    
    def get_display_name(self) -> str:
        """
        Возвращает русское название роли
        
        Returns:
            Строка с названием роли на русском языке
        
        Examples:
            >>> AdminRole.DEVELOPER.get_display_name()
            'Разработчик'
            >>> AdminRole.OPERATOR.get_display_name()
            'Оператор'
        """
        role_names = {
            AdminRole.DEVELOPER: 'Разработчик',
            AdminRole.ASSISTANT: 'Помощник',
            AdminRole.ADMINISTRATOR: 'Администратор',
            AdminRole.OPERATOR: 'Оператор'
        }
        return role_names[self]
