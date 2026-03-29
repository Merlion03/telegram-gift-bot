"""
Сервис управления ролями и проверки прав доступа
"""

from models.role import AdminRole


class RoleService:
    """
    Сервис управления ролями администраторов
    
    Предоставляет статические методы для:
    - Получения названий ролей
    - Проверки прав назначения операторов
    - Проверки прав изменения конфигурации
    - Проверки прав ответа пользователям
    
    Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 11.3
    """
    
    @staticmethod
    def get_role_name(role: int) -> str:
        """
        Возвращает русское название роли
        
        Args:
            role: Уровень роли (0-3)
        
        Returns:
            Строка с названием роли на русском языке
        
        Raises:
            ValueError: Если role не в диапазоне 0-3
        
        Examples:
            >>> RoleService.get_role_name(0)
            'Разработчик'
            >>> RoleService.get_role_name(1)
            'Помощник'
            >>> RoleService.get_role_name(2)
            'Администратор'
            >>> RoleService.get_role_name(3)
            'Оператор'
        
        Validates: Requirements 2.1, 2.2, 2.3, 2.4
        """
        if role < 0 or role > 3:
            raise ValueError(f"Невалидная роль: {role}. Допустимые значения: 0-3")
        
        try:
            admin_role = AdminRole(role)
            return admin_role.get_display_name()
        except ValueError:
            raise ValueError(f"Невалидная роль: {role}")
    
    @staticmethod
    def can_assign_operators(role: int) -> bool:
        """
        Проверяет право назначения операторов
        
        Право назначения операторов имеют:
        - Developer (0)
        - Assistant (1)
        - Administrator (2)
        
        Args:
            role: Уровень роли (0-3)
        
        Returns:
            True если role <= 2 (может назначать операторов)
            False если role > 2 (не может назначать операторов)
        
        Examples:
            >>> RoleService.can_assign_operators(0)  # Developer
            True
            >>> RoleService.can_assign_operators(1)  # Assistant
            True
            >>> RoleService.can_assign_operators(2)  # Administrator
            True
            >>> RoleService.can_assign_operators(3)  # Operator
            False
        
        Validates: Requirements 2.3
        """
        return role <= 2
    
    @staticmethod
    def can_modify_session_lifetime(role: int) -> bool:
        """
        Проверяет право изменения времени жизни сессий
        
        Право изменения конфигурации имеют только:
        - Developer (0)
        - Assistant (1)
        
        Args:
            role: Уровень роли (0-3)
        
        Returns:
            True если role <= 1 (может изменять конфигурацию)
            False если role > 1 (не может изменять конфигурацию)
        
        Examples:
            >>> RoleService.can_modify_session_lifetime(0)  # Developer
            True
            >>> RoleService.can_modify_session_lifetime(1)  # Assistant
            True
            >>> RoleService.can_modify_session_lifetime(2)  # Administrator
            False
            >>> RoleService.can_modify_session_lifetime(3)  # Operator
            False
        
        Validates: Requirements 11.3
        """
        return role <= 1
    
    @staticmethod
    def can_respond_to_users(role: int) -> bool:
        """
        Проверяет право отвечать пользователям
        
        Все роли (0-3) имеют право отвечать пользователям.
        
        Args:
            role: Уровень роли (0-3)
        
        Returns:
            True для всех ролей 0-3
            False для невалидных ролей
        
        Examples:
            >>> RoleService.can_respond_to_users(0)  # Developer
            True
            >>> RoleService.can_respond_to_users(1)  # Assistant
            True
            >>> RoleService.can_respond_to_users(2)  # Administrator
            True
            >>> RoleService.can_respond_to_users(3)  # Operator
            True
            >>> RoleService.can_respond_to_users(4)  # Invalid
            False
        
        Validates: Requirements 2.5
        """
        # Все валидные роли (0-3) могут отвечать пользователям
        return 0 <= role <= 3
