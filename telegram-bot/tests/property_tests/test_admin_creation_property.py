"""
Property-Based тест: Создание администраторов без пароля

Property 1: Администраторы могут быть созданы без пароля
Validates: Requirements 1.5
"""

import pytest
from hypothesis import given, strategies as st, settings, HealthCheck
from datetime import datetime, timezone

from models.administrator import Administrator
from database.repositories.admin_repository import AdminRepository


# Генераторы для Hypothesis
tg_id_strategy = st.integers(min_value=1, max_value=999999999)
username_strategy = st.text(
    alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'), min_codepoint=65, max_codepoint=122),
    min_size=3,
    max_size=32
)
role_strategy = st.integers(min_value=0, max_value=3)


@pytest.mark.asyncio
@given(
    tg_id=tg_id_strategy,
    username=username_strategy,
    role=role_strategy
)
@settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_property_admin_creation_without_password(
    tg_id: int, 
    username: str, 
    role: int,
    asyncpg_pool,
    clean_admin_tables
):
    """
    Property 1: Администраторы могут быть созданы без пароля
    
    Проверяет, что:
    - Администратор может быть создан с password_hash = NULL
    - Метод is_first_login() возвращает True для нового администратора
    - Все поля корректно сохраняются в БД
    
    Validates: Requirements 1.5
    
    Требует: asyncpg_pool, clean_admin_tables
    """
    repo = AdminRepository()
    
    try:
        # Создаём администратора без пароля
        admin = await repo.create(tg_id=tg_id, username=username, role=role)
        
        # Проверяем, что администратор создан
        assert admin is not None, "Администратор должен быть создан"
        
        # Проверяем, что password_hash IS NULL
        assert admin.password_hash is None, "password_hash должен быть NULL для нового администратора"
        
        # Проверяем, что is_first_login() возвращает True
        assert admin.is_first_login() is True, "is_first_login() должен возвращать True для нового администратора"
        
        # Проверяем корректность полей
        assert admin.tg_id == tg_id, "tg_id должен совпадать"
        assert admin.username == username, "username должен совпадать"
        assert admin.role == role, "role должен совпадать"
        assert admin.created_at is not None, "created_at должен быть установлен"
        assert admin.updated_at is not None, "updated_at должен быть установлен"
        
        # Проверяем, что администратор существует в БД
        exists = await repo.exists(tg_id)
        assert exists is True, "Администратор должен существовать в БД"
        
        # Получаем администратора из БД для проверки
        retrieved_admin = await repo.get_by_tg_id(tg_id)
        assert retrieved_admin is not None, "Администратор должен быть получен из БД"
        assert retrieved_admin.password_hash is None, "password_hash должен оставаться NULL"
        
    finally:
        # Очистка: удаляем тестового администратора
        pool = asyncpg_pool.get_pool()
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM administrators WHERE tg_id = $1", tg_id)
