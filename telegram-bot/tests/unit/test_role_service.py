"""
Unit-тесты для RoleService

Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 11.3
"""

import pytest
from services.role_service import RoleService


class TestGetRoleName:
    """Тесты получения названий ролей"""
    
    def test_developer_role_name(self):
        """
        Тест получения названия роли Developer
        
        Validates: Requirements 2.1
        """
        # Act
        role_name = RoleService.get_role_name(0)
        
        # Assert
        assert role_name == "Разработчик"
    
    def test_assistant_role_name(self):
        """
        Тест получения названия роли Assistant
        
        Validates: Requirements 2.2
        """
        # Act
        role_name = RoleService.get_role_name(1)
        
        # Assert
        assert role_name == "Помощник"
    
    def test_administrator_role_name(self):
        """
        Тест получения названия роли Administrator
        
        Validates: Requirements 2.3
        """
        # Act
        role_name = RoleService.get_role_name(2)
        
        # Assert
        assert role_name == "Администратор"
    
    def test_operator_role_name(self):
        """
        Тест получения названия роли Operator
        
        Validates: Requirements 2.4
        """
        # Act
        role_name = RoleService.get_role_name(3)
        
        # Assert
        assert role_name == "Оператор"
    
    def test_invalid_role_negative(self):
        """
        Тест отказа для невалидной роли (отрицательное число)
        
        Validates: Requirements 2.1
        """
        # Act & Assert
        with pytest.raises(ValueError, match="Невалидная роль"):
            RoleService.get_role_name(-1)
    
    def test_invalid_role_too_high(self):
        """
        Тест отказа для невалидной роли (больше 3)
        
        Validates: Requirements 2.1
        """
        # Act & Assert
        with pytest.raises(ValueError, match="Невалидная роль"):
            RoleService.get_role_name(4)


class TestCanAssignOperators:
    """Тесты проверки прав назначения операторов"""
    
    def test_developer_can_assign_operators(self):
        """
        Тест: Developer может назначать операторов
        
        Validates: Requirements 2.3
        """
        # Act
        can_assign = RoleService.can_assign_operators(0)
        
        # Assert
        assert can_assign is True
    
    def test_assistant_can_assign_operators(self):
        """
        Тест: Assistant может назначать операторов
        
        Validates: Requirements 2.3
        """
        # Act
        can_assign = RoleService.can_assign_operators(1)
        
        # Assert
        assert can_assign is True
    
    def test_administrator_can_assign_operators(self):
        """
        Тест: Administrator может назначать операторов
        
        Validates: Requirements 2.3
        """
        # Act
        can_assign = RoleService.can_assign_operators(2)
        
        # Assert
        assert can_assign is True
    
    def test_operator_cannot_assign_operators(self):
        """
        Тест: Operator не может назначать операторов
        
        Validates: Requirements 2.3
        """
        # Act
        can_assign = RoleService.can_assign_operators(3)
        
        # Assert
        assert can_assign is False


class TestCanModifySessionLifetime:
    """Тесты проверки прав изменения конфигурации"""
    
    def test_developer_can_modify_config(self):
        """
        Тест: Developer может изменять конфигурацию
        
        Validates: Requirements 11.3
        """
        # Act
        can_modify = RoleService.can_modify_session_lifetime(0)
        
        # Assert
        assert can_modify is True
    
    def test_assistant_can_modify_config(self):
        """
        Тест: Assistant может изменять конфигурацию
        
        Validates: Requirements 11.3
        """
        # Act
        can_modify = RoleService.can_modify_session_lifetime(1)
        
        # Assert
        assert can_modify is True
    
    def test_administrator_cannot_modify_config(self):
        """
        Тест: Administrator не может изменять конфигурацию
        
        Validates: Requirements 11.3
        """
        # Act
        can_modify = RoleService.can_modify_session_lifetime(2)
        
        # Assert
        assert can_modify is False
    
    def test_operator_cannot_modify_config(self):
        """
        Тест: Operator не может изменять конфигурацию
        
        Validates: Requirements 11.3
        """
        # Act
        can_modify = RoleService.can_modify_session_lifetime(3)
        
        # Assert
        assert can_modify is False


class TestCanRespondToUsers:
    """Тесты проверки прав ответа пользователям"""
    
    def test_developer_can_respond(self):
        """
        Тест: Developer может отвечать пользователям
        
        Validates: Requirements 2.5
        """
        # Act
        can_respond = RoleService.can_respond_to_users(0)
        
        # Assert
        assert can_respond is True
    
    def test_assistant_can_respond(self):
        """
        Тест: Assistant может отвечать пользователям
        
        Validates: Requirements 2.5
        """
        # Act
        can_respond = RoleService.can_respond_to_users(1)
        
        # Assert
        assert can_respond is True
    
    def test_administrator_can_respond(self):
        """
        Тест: Administrator может отвечать пользователям
        
        Validates: Requirements 2.5
        """
        # Act
        can_respond = RoleService.can_respond_to_users(2)
        
        # Assert
        assert can_respond is True
    
    def test_operator_can_respond(self):
        """
        Тест: Operator может отвечать пользователям
        
        Validates: Requirements 2.5
        """
        # Act
        can_respond = RoleService.can_respond_to_users(3)
        
        # Assert
        assert can_respond is True
    
    def test_invalid_role_cannot_respond(self):
        """
        Тест: Невалидная роль не может отвечать пользователям
        
        Validates: Requirements 2.5
        """
        # Act
        can_respond = RoleService.can_respond_to_users(4)
        
        # Assert
        assert can_respond is False
