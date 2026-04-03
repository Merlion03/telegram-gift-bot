"""
Property-based тесты для метода update_delivery_data_by_prize_id в Prize_Repository

Feature: delivery-data-postgres-first
Property 1: Сохранение всех полей данных доставки

Validates: Requirements 1.1, 1.2, 3.2, 3.3
"""
import pytest
import pytest_asyncio
from hypothesis import given, strategies as st, settings, HealthCheck
from typing import Dict, Any

from database.repositories.prize_repository import PrizeRepository
from database.models.prize import Prize


# Стратегии для генерации валидных данных
@st.composite
def valid_delivery_data(draw):
    """
    Генерирует валидные данные доставки для property тестов
    
    Соответствует требованиям:
    - last_name: 2-50 символов
    - first_name: 2-50 символов
    - patronymic: 2-50 символов (опционально)
    - country: 2-100 символов
    - postal_code: 3-20 символов
    - city: 2-100 символов
    - street: 2-200 символов
    - house: 1-20 символов
    - apartment: 1-20 символов (опционально)
    - phone: 10-15 цифр с опциональным +
    - comment: до 500 символов (опционально)
    """
    # Генерируем обязательные поля
    data = {
        'last_name': draw(st.text(
            alphabet=st.characters(whitelist_categories=('Lu', 'Ll'), whitelist_characters=' -'),
            min_size=2,
            max_size=50
        )),
        'first_name': draw(st.text(
            alphabet=st.characters(whitelist_categories=('Lu', 'Ll'), whitelist_characters=' -'),
            min_size=2,
            max_size=50
        )),
        'country': draw(st.text(
            alphabet=st.characters(whitelist_categories=('Lu', 'Ll'), whitelist_characters=' -'),
            min_size=2,
            max_size=100
        )),
        'postal_code': draw(st.text(
            alphabet=st.characters(whitelist_categories=('Nd',), whitelist_characters='-'),
            min_size=3,
            max_size=20
        )),
        'city': draw(st.text(
            alphabet=st.characters(whitelist_categories=('Lu', 'Ll'), whitelist_characters=' -'),
            min_size=2,
            max_size=100
        )),
        'street': draw(st.text(
            alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'), whitelist_characters=' -.'),
            min_size=2,
            max_size=200
        )),
        'house': draw(st.text(
            alphabet=st.characters(whitelist_categories=('Nd',), whitelist_characters='/-'),
            min_size=1,
            max_size=20
        )),
        'phone': '+' + draw(st.text(
            alphabet=st.characters(whitelist_categories=('Nd',)),
            min_size=10,
            max_size=15
        ))
    }
    
    # Опциональные поля
    if draw(st.booleans()):
        data['patronymic'] = draw(st.text(
            alphabet=st.characters(whitelist_categories=('Lu', 'Ll'), whitelist_characters=' -'),
            min_size=2,
            max_size=50
        ))
    
    if draw(st.booleans()):
        data['apartment'] = draw(st.text(
            alphabet=st.characters(whitelist_categories=('Nd',), whitelist_characters='/-'),
            min_size=1,
            max_size=20
        ))
    
    if draw(st.booleans()):
        data['comment'] = draw(st.text(
            alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'), whitelist_characters=' .,!?-'),
            min_size=1,
            max_size=500
        ))
    
    return data


@pytest.mark.asyncio
@pytest.mark.property_test
class TestUpdateDeliveryDataPropertyTests:
    """Property-based тесты для update_delivery_data_by_prize_id"""
    
    @given(delivery_data=valid_delivery_data())
    @settings(
        max_examples=100,
        deadline=None,
        suppress_health_check=[HealthCheck.function_scoped_fixture]
    )
    async def test_property_1_all_fields_saved(
        self,
        delivery_data: Dict[str, Any],
        prize_repository: PrizeRepository,
        create_prize_in_db
    ):
        """
        Feature: delivery-data-postgres-first
        Property 1: Сохранение всех полей данных доставки
        
        Для любых валидных данных доставки, все поля должны быть 
        корректно сохранены в PostgreSQL и доступны при последующем чтении.
        
        Validates: Requirements 1.1, 1.2, 3.2, 3.3
        """
        # Создаём тестовый приз
        prize = await create_prize_in_db(
            telegram_id=123456,
            prize_type="physical",
            code_word=f"test_property_{hash(str(delivery_data))}"
        )
        
        # Обновляем данные
        updated_prize = await prize_repository.update_delivery_data_by_prize_id(
            prize.id,
            delivery_data
        )
        
        # Проверяем, что все переданные поля сохранены
        for field_name, field_value in delivery_data.items():
            actual_value = getattr(updated_prize, field_name)
            assert actual_value == field_value, (
                f"Поле {field_name} не совпадает: "
                f"ожидалось '{field_value}', получено '{actual_value}'"
            )
        
        # Дополнительная проверка: читаем приз из БД заново
        refetched_prize = await prize_repository.find_prize_by_id(prize.id)
        assert refetched_prize is not None
        
        for field_name, field_value in delivery_data.items():
            actual_value = getattr(refetched_prize, field_name)
            assert actual_value == field_value, (
                f"Поле {field_name} не сохранилось в БД: "
                f"ожидалось '{field_value}', получено '{actual_value}'"
            )
