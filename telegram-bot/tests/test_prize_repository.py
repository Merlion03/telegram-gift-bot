"""
Unit тесты для PrizeRepository

Проверяет корректность работы методов repository для работы с призами
"""
import pytest
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from database.models.prize import Prize
from database.repositories.prize_repository import PrizeRepository


@pytest.mark.asyncio
async def test_find_prize_existing(db_session: AsyncSession):
    """
    Тест поиска существующего приза
    Validates: Requirements 3.1
    """
    # Arrange - создаём тестовый приз
    prize = Prize(
        telegram_id=123456789,
        code_word='test_code',
        prize_type='digital',
        promo_code='PROMO123',
        instructions='Test instructions',
        sheet_name='test_sheet',
        row_id=2
    )
    db_session.add(prize)
    await db_session.commit()
    
    repository = PrizeRepository(session=db_session)
    
    # Act - ищем приз
    found_prize = await repository.find_prize(123456789, 'test_code')
    
    # Assert
    assert found_prize is not None
    assert found_prize.telegram_id == 123456789
    assert found_prize.code_word == 'test_code'
    assert found_prize.prize_type == 'digital'
    assert found_prize.promo_code == 'PROMO123'


@pytest.mark.asyncio
async def test_find_prize_not_found(db_session: AsyncSession):
    """
    Тест поиска несуществующего приза (возврат None)
    Validates: Requirements 3.4
    """
    # Arrange
    repository = PrizeRepository(session=db_session)
    
    # Act - ищем несуществующий приз
    found_prize = await repository.find_prize(999999999, 'nonexistent_code')
    
    # Assert
    assert found_prize is None


@pytest.mark.asyncio
async def test_upsert_prize_insert(db_session: AsyncSession):
    """
    Тест вставки нового приза через upsert
    Validates: Requirements 2.4
    """
    # Arrange
    repository = PrizeRepository(session=db_session)
    prize_data = {
        'telegram_id': 111111111,
        'code_word': 'new_code',
        'prize_type': 'physical',
        'sheet_name': 'test_sheet',
        'row_id': 3
    }
    
    # Act - вставляем новый приз
    prize = await repository.upsert_prize(prize_data)
    await db_session.commit()
    
    # Assert
    assert prize.id is not None
    assert prize.telegram_id == 111111111
    assert prize.code_word == 'new_code'
    assert prize.prize_type == 'physical'


@pytest.mark.asyncio
async def test_upsert_prize_update(db_session: AsyncSession):
    """
    Тест обновления существующего приза через upsert
    Validates: Requirements 2.4, 8.6
    """
    # Arrange - создаём существующий приз
    existing_prize = Prize(
        telegram_id=222222222,
        code_word='update_code',
        prize_type='digital',
        promo_code='OLD_PROMO',
        instructions='Old instructions',
        sheet_name='test_sheet',
        row_id=4
    )
    db_session.add(existing_prize)
    await db_session.commit()
    
    original_id = existing_prize.id
    
    repository = PrizeRepository(session=db_session)
    updated_data = {
        'telegram_id': 222222222,
        'code_word': 'update_code',
        'prize_type': 'digital',
        'promo_code': 'NEW_PROMO',
        'instructions': 'New instructions',
        'sheet_name': 'test_sheet',
        'row_id': 4
    }
    
    # Act - обновляем через upsert
    updated_prize = await repository.upsert_prize(updated_data)
    await db_session.commit()
    
    # Обновляем объект в сессии, чтобы получить актуальные данные
    await db_session.refresh(updated_prize)
    
    # Assert - ID должен остаться тем же, данные обновлены
    assert updated_prize.id == original_id
    assert updated_prize.promo_code == 'NEW_PROMO'
    assert updated_prize.instructions == 'New instructions'


@pytest.mark.asyncio
async def test_batch_upsert_prizes(db_session: AsyncSession):
    """
    Тест batch upsert с несколькими записями
    Validates: Requirements 2.4
    """
    # Arrange
    repository = PrizeRepository(session=db_session)
    prizes_data = [
        {
            'telegram_id': 333333333,
            'code_word': 'batch_code_1',
            'prize_type': 'digital',
            'promo_code': 'BATCH1',
            'sheet_name': 'test_sheet',
            'row_id': 5
        },
        {
            'telegram_id': 444444444,
            'code_word': 'batch_code_2',
            'prize_type': 'physical',
            'sheet_name': 'test_sheet',
            'row_id': 6
        },
        {
            'telegram_id': 555555555,
            'code_word': 'batch_code_3',
            'prize_type': 'digital',
            'promo_code': 'BATCH3',
            'sheet_name': 'test_sheet',
            'row_id': 7
        }
    ]
    
    # Act - выполняем batch upsert
    count = await repository.batch_upsert_prizes(prizes_data)
    await db_session.commit()
    
    # Assert
    assert count == 3
    
    # Проверяем, что все призы созданы
    prize1 = await repository.find_prize(333333333, 'batch_code_1')
    prize2 = await repository.find_prize(444444444, 'batch_code_2')
    prize3 = await repository.find_prize(555555555, 'batch_code_3')
    
    assert prize1 is not None
    assert prize2 is not None
    assert prize3 is not None


@pytest.mark.asyncio
async def test_update_delivery_data(db_session: AsyncSession):
    """
    Тест обновления данных доставки
    Validates: Requirements 4.8
    """
    # Arrange - создаём физический приз
    prize = Prize(
        telegram_id=666666666,
        code_word='delivery_code',
        prize_type='physical',
        sheet_name='test_sheet',
        row_id=8
    )
    db_session.add(prize)
    await db_session.commit()
    
    repository = PrizeRepository(session=db_session)
    delivery_data = {
        'last_name': 'Иванов',
        'first_name': 'Иван',
        'patronymic': 'Иванович',
        'city': 'Москва',
        'street': 'Ленина',
        'house': '10',
        'apartment': '5',
        'phone': '+79991234567',
        'comment': 'Тестовый комментарий'
    }
    
    # Act - обновляем данные доставки
    success = await repository.update_delivery_data(666666666, 'delivery_code', delivery_data)
    await db_session.commit()
    
    # Assert
    assert success is True
    
    # Проверяем, что данные обновлены
    updated_prize = await repository.find_prize(666666666, 'delivery_code')
    assert updated_prize.last_name == 'Иванов'
    assert updated_prize.first_name == 'Иван'
    assert updated_prize.city == 'Москва'
    assert updated_prize.phone == '+79991234567'


@pytest.mark.asyncio
async def test_update_delivery_data_not_found(db_session: AsyncSession):
    """
    Тест обновления данных доставки для несуществующего приза
    """
    # Arrange
    repository = PrizeRepository(session=db_session)
    delivery_data = {
        'last_name': 'Петров',
        'first_name': 'Петр'
    }
    
    # Act - пытаемся обновить несуществующий приз
    success = await repository.update_delivery_data(999999999, 'nonexistent', delivery_data)
    
    # Assert
    assert success is False


@pytest.mark.asyncio
async def test_upsert_prize_missing_required_fields(db_session: AsyncSession):
    """
    Тест валидации обязательных полей при upsert
    """
    # Arrange
    repository = PrizeRepository(session=db_session)
    invalid_data = {
        'telegram_id': 777777777,
        # Отсутствует code_word
        'prize_type': 'digital'
    }
    
    # Act & Assert - должно выбросить ValueError
    with pytest.raises(ValueError) as exc_info:
        await repository.upsert_prize(invalid_data)
    
    assert 'Отсутствуют обязательные поля' in str(exc_info.value)


@pytest.mark.asyncio
async def test_update_delivery_data_invalid_fields(db_session: AsyncSession):
    """
    Тест валидации полей при обновлении данных доставки
    """
    # Arrange
    repository = PrizeRepository(session=db_session)
    invalid_data = {
        'invalid_field': 'value',
        'another_invalid': 'value'
    }
    
    # Act & Assert - должно выбросить ValueError
    with pytest.raises(ValueError) as exc_info:
        await repository.update_delivery_data(123456, 'test', invalid_data)
    
    assert 'Невалидные поля доставки' in str(exc_info.value)


# ============================================================================
# Property-Based Tests с использованием Hypothesis
# ============================================================================

from hypothesis import given, settings, strategies as st, assume, HealthCheck
from sqlalchemy import text


@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    telegram_id=st.integers(min_value=1, max_value=9999999999),
    code_word=st.text(
        min_size=1, 
        max_size=50, 
        alphabet=st.characters(
            blacklist_categories=('Cs', 'Cc'),  # Исключаем суррогаты и контрольные символы
            blacklist_characters='\x00'
        )
    ),
    prize_type=st.sampled_from(['digital', 'physical']),
    promo_code=st.one_of(
        st.none(), 
        st.text(
            min_size=1, 
            max_size=100, 
            alphabet=st.characters(
                blacklist_categories=('Cs', 'Cc'),
                blacklist_characters='\x00'
            )
        )
    ),
    sheet_name=st.text(
        min_size=1, 
        max_size=50, 
        alphabet=st.characters(
            blacklist_categories=('Cs', 'Cc'),
            blacklist_characters='\x00'
        )
    ),
    row_id=st.integers(min_value=2, max_value=10000)
)
@pytest.mark.asyncio
async def test_property_upsert_idempotency(
    db_session: AsyncSession,
    telegram_id: int,
    code_word: str,
    prize_type: str,
    promo_code: str,
    sheet_name: str,
    row_id: int
):
    """
    Property 1: Upsert идемпотентность
    
    Feature: telegram-bot-postgres-sync
    Validates: Requirements 2.4, 8.6
    
    Для любых данных приза, выполнение upsert операции дважды с одинаковыми
    данными должно давать тот же результат, что и однократное выполнение.
    
    При конфликте уникального индекса (telegram_id, code_word) должно
    выполняться обновление существующей записи, а не создание дубликата.
    """
    # Очистка БД перед каждой итерацией Hypothesis для изоляции
    await db_session.execute(text("TRUNCATE TABLE prizes RESTART IDENTITY CASCADE"))
    await db_session.commit()
    
    # Arrange - подготовка данных приза
    prize_data = {
        'telegram_id': telegram_id,
        'code_word': code_word,
        'prize_type': prize_type,
        'sheet_name': sheet_name,
        'row_id': row_id
    }
    
    # Добавляем promo_code только для digital призов
    if prize_type == 'digital' and promo_code:
        prize_data['promo_code'] = promo_code
        prize_data['instructions'] = f'Instructions for {promo_code}'
    
    repository = PrizeRepository(session=db_session)
    
    # Act - выполняем upsert дважды с одинаковыми данными
    result1 = await repository.upsert_prize(prize_data.copy())
    await db_session.commit()
    
    result2 = await repository.upsert_prize(prize_data.copy())
    await db_session.commit()
    
    # Assert - результаты должны быть идентичны
    assert result1.id == result2.id, "ID должен остаться тем же после повторного upsert"
    assert result1.telegram_id == result2.telegram_id
    assert result1.code_word == result2.code_word
    assert result1.prize_type == result2.prize_type
    assert result1.sheet_name == result2.sheet_name
    assert result1.row_id == result2.row_id
    
    if prize_type == 'digital' and promo_code:
        assert result1.promo_code == result2.promo_code
        assert result1.instructions == result2.instructions
    
    # Проверяем, что в БД только одна запись
    found_prize = await repository.find_prize(telegram_id, code_word)
    assert found_prize is not None
    assert found_prize.id == result1.id


@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    telegram_id=st.integers(min_value=1, max_value=9999999999),
    code_word=st.text(
        min_size=1, 
        max_size=50, 
        alphabet=st.characters(
            blacklist_categories=('Cs', 'Cc'),
            blacklist_characters='\x00'
        )
    ),
    prize_type=st.sampled_from(['digital', 'physical']),
    sheet_name=st.text(
        min_size=1, 
        max_size=50, 
        alphabet=st.characters(
            blacklist_categories=('Cs', 'Cc'),
            blacklist_characters='\x00'
        )
    ),
    row_id=st.integers(min_value=2, max_value=10000)
)
@pytest.mark.asyncio
async def test_property_upsert_update_on_conflict(
    db_session: AsyncSession,
    telegram_id: int,
    code_word: str,
    prize_type: str,
    sheet_name: str,
    row_id: int
):
    """
    Property: Upsert обновляет при конфликте уникального индекса
    
    Validates: Requirements 2.4, 8.6
    
    При конфликте уникального индекса (telegram_id, code_word) должно
    выполняться UPDATE существующей записи, а не INSERT новой.
    """
    # Очистка БД перед каждой итерацией Hypothesis для изоляции
    await db_session.execute(text("TRUNCATE TABLE prizes RESTART IDENTITY CASCADE"))
    await db_session.commit()
    
    # Arrange - создаём первоначальный приз
    initial_data = {
        'telegram_id': telegram_id,
        'code_word': code_word,
        'prize_type': prize_type,
        'sheet_name': sheet_name,
        'row_id': row_id,
        'promo_code': 'INITIAL_PROMO' if prize_type == 'digital' else None
    }
    
    repository = PrizeRepository(session=db_session)
    initial_prize = await repository.upsert_prize(initial_data)
    await db_session.commit()
    
    original_id = initial_prize.id
    original_created_at = initial_prize.created_at
    
    # Act - выполняем upsert с обновлёнными данными
    updated_data = {
        'telegram_id': telegram_id,
        'code_word': code_word,
        'prize_type': prize_type,
        'sheet_name': sheet_name,
        'row_id': row_id + 1,  # Изменяем row_id
        'promo_code': 'UPDATED_PROMO' if prize_type == 'digital' else None
    }
    
    updated_prize = await repository.upsert_prize(updated_data)
    await db_session.commit()
    
    # Обновляем объект в сессии, чтобы получить актуальные данные
    await db_session.refresh(updated_prize)
    
    # Assert - ID и created_at должны остаться прежними, остальные поля обновлены
    assert updated_prize.id == original_id, "ID не должен измениться при UPDATE"
    assert updated_prize.created_at == original_created_at, "created_at не должен измениться"
    assert updated_prize.row_id == row_id + 1, "row_id должен обновиться"
    
    if prize_type == 'digital':
        assert updated_prize.promo_code == 'UPDATED_PROMO', "promo_code должен обновиться"
    
    # Проверяем, что в БД всё ещё только одна запись
    found_prize = await repository.find_prize(telegram_id, code_word)
    assert found_prize is not None
    assert found_prize.id == original_id


@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    batch_size=st.integers(min_value=1, max_value=20),
    base_telegram_id=st.integers(min_value=1000000, max_value=9000000),
    prize_type=st.sampled_from(['digital', 'physical']),
    sheet_name=st.text(
        min_size=1, 
        max_size=30, 
        alphabet=st.characters(
            blacklist_categories=('Cs', 'Cc'),
            blacklist_characters='\x00'
        )
    )
)
@pytest.mark.asyncio
async def test_property_batch_upsert_idempotency(
    db_session: AsyncSession,
    batch_size: int,
    base_telegram_id: int,
    prize_type: str,
    sheet_name: str
):
    """
    Property: Batch upsert идемпотентность
    
    Validates: Requirements 2.4, 8.6
    
    Для любого списка данных призов, выполнение batch_upsert дважды
    должно давать тот же результат, что и однократное выполнение.
    """
    # Очистка БД перед каждой итерацией Hypothesis для изоляции
    await db_session.execute(text("TRUNCATE TABLE prizes RESTART IDENTITY CASCADE"))
    await db_session.commit()
    
    # Arrange - генерируем список призов
    prizes_data = []
    for i in range(batch_size):
        prize_data = {
            'telegram_id': base_telegram_id + i,
            'code_word': f'code_{i}',
            'prize_type': prize_type,
            'sheet_name': sheet_name,
            'row_id': i + 2,
            'promo_code': f'PROMO_{i}' if prize_type == 'digital' else None
        }
        prizes_data.append(prize_data)
    
    repository = PrizeRepository(session=db_session)
    
    # Act - выполняем batch upsert дважды
    count1 = await repository.batch_upsert_prizes(prizes_data)
    await db_session.commit()
    
    count2 = await repository.batch_upsert_prizes(prizes_data)
    await db_session.commit()
    
    # Assert - количество обработанных записей должно быть одинаковым
    assert count1 == batch_size
    assert count2 == batch_size
    
    # Проверяем, что все призы существуют и их количество соответствует batch_size
    for i in range(batch_size):
        found_prize = await repository.find_prize(base_telegram_id + i, f'code_{i}')
        assert found_prize is not None, f"Приз {i} должен существовать"
        assert found_prize.telegram_id == base_telegram_id + i
        assert found_prize.code_word == f'code_{i}'


@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    telegram_id=st.integers(min_value=1, max_value=9999999999),
    code_word=st.text(
        min_size=1, 
        max_size=50, 
        alphabet=st.characters(
            blacklist_categories=('Cs', 'Cc'),
            blacklist_characters='\x00'
        )
    ),
    last_name=st.text(
        min_size=1, 
        max_size=50, 
        alphabet=st.characters(
            blacklist_categories=('Cs', 'Cc'),
            blacklist_characters='\x00'
        )
    ),
    first_name=st.text(
        min_size=1, 
        max_size=50, 
        alphabet=st.characters(
            blacklist_categories=('Cs', 'Cc'),
            blacklist_characters='\x00'
        )
    ),
    city=st.text(
        min_size=1, 
        max_size=50, 
        alphabet=st.characters(
            blacklist_categories=('Cs', 'Cc'),
            blacklist_characters='\x00'
        )
    ),
    phone=st.text(min_size=10, max_size=20, alphabet=st.characters(whitelist_categories=('Nd',), whitelist_characters='+'))
)
@pytest.mark.asyncio
async def test_property_delivery_data_round_trip(
    db_session: AsyncSession,
    telegram_id: int,
    code_word: str,
    last_name: str,
    first_name: str,
    city: str,
    phone: str
):
    """
    Property: Round-trip синхронизация данных доставки
    
    Validates: Requirements 4.8
    
    Для любых данных доставки физического приза, после записи в БД
    и последующего чтения данные должны совпадать с записанными.
    """
    # Arrange - создаём физический приз
    prize_data = {
        'telegram_id': telegram_id,
        'code_word': code_word,
        'prize_type': 'physical',
        'sheet_name': 'test_sheet',
        'row_id': 2
    }
    
    repository = PrizeRepository(session=db_session)
    await repository.upsert_prize(prize_data)
    await db_session.commit()
    
    # Подготовка данных доставки
    delivery_data = {
        'last_name': last_name,
        'first_name': first_name,
        'city': city,
        'street': 'Test Street',
        'house': '1',
        'phone': phone
    }
    
    # Act - записываем данные доставки
    success = await repository.update_delivery_data(telegram_id, code_word, delivery_data)
    await db_session.commit()
    
    assert success is True
    
    # Читаем приз обратно
    found_prize = await repository.find_prize(telegram_id, code_word)
    
    # Assert - данные должны совпадать (round-trip)
    assert found_prize is not None
    assert found_prize.last_name == last_name
    assert found_prize.first_name == first_name
    assert found_prize.city == city
    assert found_prize.street == 'Test Street'
    assert found_prize.house == '1'
    assert found_prize.phone == phone


# ============================================================================
# Unit тесты для новых методов GDPR (Task 1.4)
# ============================================================================


@pytest.mark.asyncio
async def test_check_user_exists_found(db_session: AsyncSession):
    """
    Тест проверки существования пользователя - пользователь найден
    Validates: Requirements 2.1
    """
    # Arrange - создаём тестовый приз
    prize = Prize(
        telegram_id=123456789,
        code_word='test_code',
        prize_type='digital',
        promo_code='PROMO123',
        sheet_name='test_sheet',
        row_id=2
    )
    db_session.add(prize)
    await db_session.commit()
    
    repository = PrizeRepository(session=db_session)
    
    # Act - проверяем существование пользователя
    exists = await repository.check_user_exists(123456789)
    
    # Assert
    assert exists is True


@pytest.mark.asyncio
async def test_check_user_exists_not_found(db_session: AsyncSession):
    """
    Тест проверки существования пользователя - пользователь не найден
    Validates: Requirements 2.1
    """
    # Arrange
    repository = PrizeRepository(session=db_session)
    
    # Act - проверяем несуществующего пользователя
    exists = await repository.check_user_exists(999999999)
    
    # Assert
    assert exists is False


@pytest.mark.asyncio
async def test_get_gdpr_consent_date_with_consent(db_session: AsyncSession):
    """
    Тест получения даты GDPR согласия - согласие дано
    Validates: Requirements 3.1
    """
    # Arrange - создаём приз с GDPR согласием
    consent_date = datetime.now(timezone.utc)
    prize = Prize(
        telegram_id=123456789,
        code_word='test_code',
        prize_type='digital',
        promo_code='PROMO123',
        sheet_name='test_sheet',
        row_id=2,
        gdpr_consent_date=consent_date
    )
    db_session.add(prize)
    await db_session.commit()
    
    repository = PrizeRepository(session=db_session)
    
    # Act - получаем дату согласия
    result_date = await repository.get_gdpr_consent_date(123456789)
    
    # Assert
    assert result_date is not None
    # Сравниваем с точностью до секунды (из-за возможных различий в микросекундах)
    assert abs((result_date - consent_date).total_seconds()) < 1


@pytest.mark.asyncio
async def test_get_gdpr_consent_date_without_consent(db_session: AsyncSession):
    """
    Тест получения даты GDPR согласия - согласие не дано
    Validates: Requirements 3.1
    """
    # Arrange - создаём приз без GDPR согласия
    prize = Prize(
        telegram_id=123456789,
        code_word='test_code',
        prize_type='digital',
        promo_code='PROMO123',
        sheet_name='test_sheet',
        row_id=2,
        gdpr_consent_date=None
    )
    db_session.add(prize)
    await db_session.commit()
    
    repository = PrizeRepository(session=db_session)
    
    # Act - получаем дату согласия
    result_date = await repository.get_gdpr_consent_date(123456789)
    
    # Assert
    assert result_date is None


@pytest.mark.asyncio
async def test_get_gdpr_consent_date_user_not_found(db_session: AsyncSession):
    """
    Тест получения даты GDPR согласия - пользователь не найден
    Validates: Requirements 3.1
    """
    # Arrange
    repository = PrizeRepository(session=db_session)
    
    # Act - получаем дату согласия для несуществующего пользователя
    result_date = await repository.get_gdpr_consent_date(999999999)
    
    # Assert
    assert result_date is None


@pytest.mark.asyncio
async def test_update_gdpr_consent_single_prize(db_session: AsyncSession):
    """
    Тест сохранения GDPR согласия для пользователя с одним призом
    Validates: Requirements 3.3
    """
    # Arrange - создаём приз без согласия
    prize = Prize(
        telegram_id=123456789,
        code_word='test_code',
        prize_type='digital',
        promo_code='PROMO123',
        sheet_name='test_sheet',
        row_id=2,
        gdpr_consent_date=None
    )
    db_session.add(prize)
    await db_session.commit()
    
    repository = PrizeRepository(session=db_session)
    consent_date = datetime.now(timezone.utc)
    
    # Act - сохраняем согласие
    success = await repository.update_gdpr_consent(123456789, consent_date)
    await db_session.commit()
    
    # Assert
    assert success is True
    
    # Проверяем, что согласие сохранено
    updated_prize = await repository.find_prize(123456789, 'test_code')
    assert updated_prize.gdpr_consent_date is not None
    assert abs((updated_prize.gdpr_consent_date - consent_date).total_seconds()) < 1


@pytest.mark.asyncio
async def test_update_gdpr_consent_multiple_prizes(db_session: AsyncSession):
    """
    Тест сохранения GDPR согласия для пользователя с несколькими призами
    Validates: Requirements 3.3
    """
    # Arrange - создаём несколько призов для одного пользователя
    prize1 = Prize(
        telegram_id=123456789,
        code_word='code1',
        prize_type='digital',
        promo_code='PROMO1',
        sheet_name='test_sheet',
        row_id=2,
        gdpr_consent_date=None
    )
    prize2 = Prize(
        telegram_id=123456789,
        code_word='code2',
        prize_type='physical',
        sheet_name='test_sheet',
        row_id=3,
        gdpr_consent_date=None
    )
    db_session.add(prize1)
    db_session.add(prize2)
    await db_session.commit()
    
    repository = PrizeRepository(session=db_session)
    consent_date = datetime.now(timezone.utc)
    
    # Act - сохраняем согласие (должно обновить все призы пользователя)
    success = await repository.update_gdpr_consent(123456789, consent_date)
    await db_session.commit()
    
    # Assert
    assert success is True
    
    # Проверяем, что согласие сохранено для всех призов
    updated_prize1 = await repository.find_prize(123456789, 'code1')
    updated_prize2 = await repository.find_prize(123456789, 'code2')
    
    assert updated_prize1.gdpr_consent_date is not None
    assert updated_prize2.gdpr_consent_date is not None
    assert abs((updated_prize1.gdpr_consent_date - consent_date).total_seconds()) < 1
    assert abs((updated_prize2.gdpr_consent_date - consent_date).total_seconds()) < 1


@pytest.mark.asyncio
async def test_update_gdpr_consent_user_not_found(db_session: AsyncSession):
    """
    Тест сохранения GDPR согласия для несуществующего пользователя
    Validates: Requirements 3.3
    """
    # Arrange
    repository = PrizeRepository(session=db_session)
    consent_date = datetime.now(timezone.utc)
    
    # Act - пытаемся сохранить согласие для несуществующего пользователя
    success = await repository.update_gdpr_consent(999999999, consent_date)
    
    # Assert
    assert success is False
