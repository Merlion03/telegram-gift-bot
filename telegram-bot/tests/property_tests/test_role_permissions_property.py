"""
Property-Based тесты: Проверка прав ролей

Property 2: Проверка прав назначения операторов
Property 3: Все роли могут отвечать пользователям

Validates: Requirements 2.3, 2.5
"""

import pytest
from hypothesis import given, strategies as st, settings

from services.role_service import RoleService


# Генератор для ролей (0-3)
role_strategy = st.integers(min_value=0, max_value=3)


@given(role=role_strategy)
@settings(max_examples=100)
def test_property_can_assign_operators(role: int):
    """
    Property 2: Проверка прав назначения операторов
    
    Проверяет, что:
    - Developer (0) может назначать операторов
    - Assistant (1) может назначать операторов
    - Administrator (2) может назначать операторов
    - Operator (3) НЕ может назначать операторов
    
    Validates: Requirements 2.3
    """
    result = RoleService.can_assign_operators(role)
    
    # Проверяем корректность прав
    if role <= 2:
        assert result is True, f"Роль {role} должна иметь право назначать операторов"
    else:
        assert result is False, f"Роль {role} НЕ должна иметь право назначать операторов"


@given(role=role_strategy)
@settings(max_examples=100)
def test_property_can_respond_to_users(role: int):
    """
    Property 3: Все роли могут отвечать пользователям
    
    Проверяет, что все роли (0-3) имеют право отвечать пользователям.
    
    Validates: Requirements 2.5
    """
    result = RoleService.can_respond_to_users(role)
    
    # Все валидные роли (0-3) должны иметь право отвечать
    assert result is True, f"Роль {role} должна иметь право отвечать пользователям"


@given(role=role_strategy)
@settings(max_examples=100)
def test_property_can_modify_session_lifetime(role: int):
    """
    Property (дополнительное): Проверка прав изменения конфигурации
    
    Проверяет, что:
    - Developer (0) может изменять session lifetime
    - Assistant (1) может изменять session lifetime
    - Administrator (2) НЕ может изменять session lifetime
    - Operator (3) НЕ может изменять session lifetime
    
    Validates: Requirements 11.3
    """
    result = RoleService.can_modify_session_lifetime(role)
    
    # Проверяем корректность прав
    if role <= 1:
        assert result is True, f"Роль {role} должна иметь право изменять session lifetime"
    else:
        assert result is False, f"Роль {role} НЕ должна иметь право изменять session lifetime"


@given(role=role_strategy)
@settings(max_examples=100)
def test_property_get_role_name(role: int):
    """
    Property (дополнительное): Получение названий ролей
    
    Проверяет, что для всех валидных ролей возвращается корректное название.
    
    Validates: Requirements 2.1, 2.2, 2.3, 2.4
    """
    role_name = RoleService.get_role_name(role)
    
    # Проверяем, что название не пустое
    assert role_name is not None, "Название роли не должно быть None"
    assert len(role_name) > 0, "Название роли не должно быть пустым"
    
    # Проверяем соответствие ролей и названий
    expected_names = {
        0: "Разработчик",
        1: "Помощник",
        2: "Администратор",
        3: "Оператор"
    }
    
    assert role_name == expected_names[role], f"Название роли {role} должно быть '{expected_names[role]}'"
