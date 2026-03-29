"""
Property-Based тест: Определение первого входа

Property 11: Определение первого входа
Validates: Requirements 8.1
"""

import pytest
from hypothesis import given, strategies as st, settings
from datetime import datetime, timezone

from models.administrator import Administrator


# Генераторы для Hypothesis
tg_id_strategy = st.integers(min_value=1, max_value=999999999)
username_strategy = st.text(
    alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'), min_codepoint=65, max_codepoint=122),
    min_size=3,
    max_size=32
)
role_strategy = st.integers(min_value=0, max_value=3)
password_hash_strategy = st.one_of(
    st.none(),  # NULL password_hash
    st.text(min_size=50, max_size=200)  # Argon2id хеш (примерная длина)
)


@given(
    tg_id=tg_id_strategy,
    username=username_strategy,
    role=role_strategy,
    password_hash=password_hash_strategy
)
@settings(max_examples=100)
def test_property_first_login_detection(
    tg_id: int,
    username: str,
    role: int,
    password_hash: str | None
):
    """
    Property 11: Определение первого входа
    
    Проверяет, что:
    - is_first_login() возвращает True когда password_hash IS NULL
    - is_first_login() возвращает False когда password_hash NOT NULL
    
    Validates: Requirements 8.1
    """
    # Создаём администратора с заданным password_hash
    now = datetime.now(timezone.utc)
    admin = Administrator(
        tg_id=tg_id,
        username=username,
        role=role,
        password_hash=password_hash,
        created_at=now,
        updated_at=now
    )
    
    # Проверяем корректность определения первого входа
    if password_hash is None:
        assert admin.is_first_login() is True, \
            "is_first_login() должен возвращать True когда password_hash IS NULL"
    else:
        assert admin.is_first_login() is False, \
            "is_first_login() должен возвращать False когда password_hash NOT NULL"


@given(
    tg_id=tg_id_strategy,
    username=username_strategy,
    role=role_strategy
)
@settings(max_examples=100)
def test_property_first_login_implies_null_password(
    tg_id: int,
    username: str,
    role: int
):
    """
    Property (дополнительное): Первый вход эквивалентен NULL password_hash
    
    Проверяет двустороннюю связь:
    - Если is_first_login() == True, то password_hash IS NULL
    - Если password_hash IS NULL, то is_first_login() == True
    
    Validates: Requirements 8.1
    """
    now = datetime.now(timezone.utc)
    
    # Создаём администратора без пароля
    admin_without_password = Administrator(
        tg_id=tg_id,
        username=username,
        role=role,
        password_hash=None,
        created_at=now,
        updated_at=now
    )
    
    # Проверяем: NULL password_hash => is_first_login() == True
    assert admin_without_password.is_first_login() is True
    assert admin_without_password.password_hash is None
    
    # Создаём администратора с паролем
    admin_with_password = Administrator(
        tg_id=tg_id,
        username=username,
        role=role,
        password_hash="$argon2id$v=19$m=65536,t=2,p=4$somesalt$somehash",
        created_at=now,
        updated_at=now
    )
    
    # Проверяем: NOT NULL password_hash => is_first_login() == False
    assert admin_with_password.is_first_login() is False
    assert admin_with_password.password_hash is not None
