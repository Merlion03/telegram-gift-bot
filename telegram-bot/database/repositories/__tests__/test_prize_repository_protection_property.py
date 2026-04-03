"""
Property-based тесты для защиты данных доставки от перезаписи

Feature: delivery-data-postgres-first
Property 17: Защита данных с claimed_at при прямой синхронизации

Validates: Requirements 12.2, 18.2
"""
import pytest
import pytest_asyncio
from hypothesis import given, strategies as st, settings, HealthCheck, assume
from typing import Dict, Any
from datetime import datetime, timezone
import uuid

from database.repositories.prize_repository import PrizeRepository
from database.models.prize import Prize


@st.composite
def valid_delivery_data_with_ids(draw):
    """
    Генерирует валидные данные доставки с уникальными идентификаторами
    """
    telegram_id = draw(st.integers(min_value=900000000, max_value=999999999))
    # Добавляем UUID к code_word для гарантии уникальности
    base_code = draw(st.text(
        alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')),
        min_size=5,
        max_size=10
    ))
    code_word = f"{base_code}_{uuid.uuid4().hex[:8]}"
    
    data = {
        'telegram_id': telegram_id,
        'code_word': code_word,
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
class TestDeliveryDataProtectionPropertyTests:
    """Property-based тесты для защиты данных доставки от перезаписи"""
    
    @given(
        original_data=valid_delivery_data_with_ids(),
        modified_data=valid_delivery_data_with_ids()
    )
    @settings(
        max_examples=50,
        deadline=None,
        suppress_health_check=[HealthCheck.function_scoped_fixture]
    )
    async def test_property_delivery_data_protection_with_claimed_at(
        self,
        prize_repository: PrizeRepository,
        create_prize_in_db,
        original_data,
        modified_data
    ):
        """
        Property 17: Защита данных с claimed_at при прямой синхронизации
        
        Validates: Requirements 12.2, 18.2
        
        Для любых валидных данных доставки:
        1. Создаём запись с claimed_at IS NOT NULL и оригинальными данными
        2. Пытаемся обновить через batch_upsert_prizes с изменёнными данными (симуляция Google Sheets)
        3. Проверяем, что данные доставки остались неизменными
        """
        # Используем telegram_id и code_word из первого набора данных
        telegram_id = original_data['telegram_id']
        code_word = original_data['code_word']
        
        # Предполагаем, что данные различаются (иначе тест бессмысленен)
        assume(original_data != modified_data)
        
        now = datetime.now(timezone.utc)
        
        # Шаг 1: Создаём запись с claimed_at IS NOT NULL и оригинальными данными
        prize = await create_prize_in_db(
            telegram_id=telegram_id,
            username='test_user',
            prize_type='physical',
            code_word=code_word,
            sheet_name='TestSheet',
            row_id=2,
            claimed_at=now,  # ВАЖНО: claimed_at установлен
            last_name=original_data['last_name'],
            first_name=original_data['first_name'],
            patronymic=original_data.get('patronymic'),
            country=original_data['country'],
            postal_code=original_data['postal_code'],
            city=original_data['city'],
            street=original_data['street'],
            house=original_data['house'],
            apartment=original_data.get('apartment'),
            phone=original_data['phone'],
            comment=original_data.get('comment')
        )
        
        # Проверяем, что запись создана с оригинальными данными
        assert prize.claimed_at is not None
        assert prize.last_name == original_data['last_name']
        assert prize.first_name == original_data['first_name']
        assert prize.city == original_data['city']
        
        # Шаг 2: Пытаемся обновить через batch_upsert_prizes с изменёнными данными
        # (симулируем прямую синхронизацию из Google Sheets)
        # ВАЖНО: Google Sheets НЕ содержит claimed_at, поэтому мы его не передаём
        # ВАЖНО: Используем ТОТ ЖЕ code_word для обновления существующей записи
        modified_prize_data = {
            'telegram_id': telegram_id,
            'username': 'modified_user',  # Изменяем не-delivery поле
            'prize_type': 'physical',
            'code_word': code_word,  # ТОТ ЖЕ code_word!
            'sheet_name': 'TestSheet',
            'row_id': 2,
            # claimed_at НЕ передаём - Google Sheets не содержит это поле
            'last_name': modified_data['last_name'],
            'first_name': modified_data['first_name'],
            'patronymic': modified_data.get('patronymic'),
            'country': modified_data['country'],
            'postal_code': modified_data['postal_code'],
            'city': modified_data['city'],
            'street': modified_data['street'],
            'house': modified_data['house'],
            'apartment': modified_data.get('apartment'),
            'phone': modified_data['phone'],
            'comment': modified_data.get('comment')
        }
        
        # Выполняем batch_upsert (должна сработать защита)
        await prize_repository.batch_upsert_prizes([modified_prize_data])
        
        # Шаг 3: Проверяем, что данные доставки НЕ изменились
        prize_after = await prize_repository.find_prize(telegram_id, code_word)
        assert prize_after is not None
        
        # Проверяем, что данные доставки остались оригинальными
        assert prize_after.last_name == original_data['last_name'], \
            f"last_name изменилась: {original_data['last_name']} -> {prize_after.last_name}"
        assert prize_after.first_name == original_data['first_name'], \
            f"first_name изменилась: {original_data['first_name']} -> {prize_after.first_name}"
        assert prize_after.city == original_data['city'], \
            f"city изменился: {original_data['city']} -> {prize_after.city}"
        assert prize_after.street == original_data['street'], \
            f"street изменилась: {original_data['street']} -> {prize_after.street}"
        assert prize_after.house == original_data['house'], \
            f"house изменился: {original_data['house']} -> {prize_after.house}"
        assert prize_after.phone == original_data['phone'], \
            f"phone изменился: {original_data['phone']} -> {prize_after.phone}"
        assert prize_after.country == original_data['country'], \
            f"country изменилась: {original_data['country']} -> {prize_after.country}"
        assert prize_after.postal_code == original_data['postal_code'], \
            f"postal_code изменился: {original_data['postal_code']} -> {prize_after.postal_code}"
        
        # Проверяем опциональные поля
        if 'patronymic' in original_data:
            assert prize_after.patronymic == original_data['patronymic'], \
                f"patronymic изменилось: {original_data['patronymic']} -> {prize_after.patronymic}"
        
        if 'apartment' in original_data:
            assert prize_after.apartment == original_data['apartment'], \
                f"apartment изменилась: {original_data['apartment']} -> {prize_after.apartment}"
        
        if 'comment' in original_data:
            assert prize_after.comment == original_data['comment'], \
                f"comment изменился: {original_data['comment']} -> {prize_after.comment}"
        
        # Проверяем, что claimed_at не изменился
        assert prize_after.claimed_at == prize.claimed_at, \
            "claimed_at не должен изменяться"
