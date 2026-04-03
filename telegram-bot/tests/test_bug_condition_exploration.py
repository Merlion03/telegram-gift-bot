"""
Bug Condition Exploration Tests - Property-Based Testing

**КРИТИЧЕСКИ ВАЖНО**: Эти тесты ДОЛЖНЫ УПАСТЬ на неисправленном коде.
Падение подтверждает существование бага.

**НЕ ПЫТАТЬСЯ исправить тест или код, когда он упадёт**

**ЦЕЛЬ**: Выявить контрпримеры, демонстрирующие существование бага

Эти тесты кодируют ОЖИДАЕМОЕ поведение системы после исправления.
Когда баг будет исправлен, эти тесты должны пройти.
"""
import pytest
from datetime import datetime, timezone
from hypothesis import given, strategies as st, settings, Phase, HealthCheck
from sqlalchemy import delete, select

from database.repositories.prize_repository import PrizeRepository
from database.models.prize import Prize
from services.prize_service import PrizeService


# ============================================================================
# Property 1: Bug Condition - Идемпотентная проверка существования пользователя
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.pbt
@given(
    telegram_id=st.integers(min_value=100000, max_value=999999999),
    prize_type=st.sampled_from(["digital", "physical"]),
)
@settings(
    max_examples=10,  # Ограничиваем для детерминистического бага
    phases=[Phase.generate, Phase.target],  # Scoped PBT подход
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_check_user_exists_with_claimed_prize(
    telegram_id: int,
    prize_type: str,
    prize_repository: PrizeRepository,
    test_db_session
):
    """
    **Validates: Requirements 2.1, 2.4**
    
    Property: check_user_exists должен возвращать True для пользователя 
    с уже полученным призом (claimed_at IS NOT NULL)
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ**: УПАДЁТ
    Текущая реализация проверяет только Prize.claimed_at.is_(None),
    поэтому вернёт False для пользователей с claimed_at IS NOT NULL
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ ПОСЛЕ ИСПРАВЛЕНИЯ**: ПРОЙДЁТ
    Исправленная реализация будет проверять наличие пользователя
    независимо от значения claimed_at
    """
    # Очищаем таблицу перед каждым примером
    await test_db_session.execute(delete(Prize))
    await test_db_session.commit()
    
    # Arrange: Создаём пользователя с уже полученным призом
    claimed_at = datetime.now(timezone.utc)
    
    if prize_type == "digital":
        prize = Prize(
            telegram_id=telegram_id,
            prize_type="digital",
            promo_code="PROMO2024",
            instructions="Инструкции по использованию промокода",
            claimed_at=claimed_at,  # Приз уже получен
            code_word="тестовое_слово",
            sheet_name="Лист1",
            row_id=1,
            gdpr_consent_date=datetime.now(timezone.utc)
        )
    else:  # physical
        prize = Prize(
            telegram_id=telegram_id,
            prize_type="physical",
            claimed_at=claimed_at,  # Приз уже получен (форма заполнена)
            last_name="Иванов",
            first_name="Иван",
            city="Москва",
            street="Ленина",
            house="1",
            phone="+79991234567",
            code_word="тестовое_слово",
            sheet_name="Лист1",
            row_id=1,
            gdpr_consent_date=datetime.now(timezone.utc)
        )
    
    test_db_session.add(prize)
    await test_db_session.commit()
    
    # Act: Проверяем существование пользователя
    result = await prize_repository.check_user_exists(telegram_id)
    
    # Assert: Пользователь ДОЛЖЕН существовать в таблице призов
    # независимо от значения claimed_at
    assert result is True, (
        f"check_user_exists должен возвращать True для пользователя "
        f"с telegram_id={telegram_id}, который существует в таблице призов "
        f"(даже если claimed_at IS NOT NULL). "
        f"Получено: {result}"
    )


# ============================================================================
# Property 2: Bug Condition - Идемпотентная выдача цифровых призов
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.pbt
@given(
    telegram_id=st.integers(min_value=100000, max_value=999999999),
    promo_code=st.text(
        alphabet=st.characters(whitelist_categories=("Lu", "Nd")),
        min_size=5,
        max_size=20
    ),
    code_word=st.text(
        alphabet=st.characters(whitelist_categories=("Ll", "Lu")),
        min_size=3,
        max_size=15
    )
)
@settings(
    max_examples=10,  # Ограничиваем для детерминистического бага
    phases=[Phase.generate, Phase.target],
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_digital_prize_idempotent_delivery(
    telegram_id: int,
    promo_code: str,
    code_word: str,
    prize_repository: PrizeRepository,
    test_db_session
):
    """
    **Validates: Requirements 2.2**
    
    Property: Повторный запрос цифрового приза должен идемпотентно 
    вернуть тот же промокод
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ**: УПАДЁТ
    check_user_exists вернёт False, и система покажет ошибку
    "У вас нет доступных призов"
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ ПОСЛЕ ИСПРАВЛЕНИЯ**: ПРОЙДЁТ
    Система найдёт пользователя и вернёт промокод идемпотентно
    """
    # Фильтруем невалидные входные данные
    from hypothesis import assume
    assume(len(promo_code.strip()) > 0)
    assume(len(code_word.strip()) > 0)
    
    # Очищаем таблицу перед каждым примером
    await test_db_session.execute(delete(Prize))
    await test_db_session.commit()
    
    # Arrange: Создаём пользователя с уже полученным цифровым призом
    claimed_at = datetime.now(timezone.utc)
    instructions = "Используйте промокод на сайте example.com"
    
    prize = Prize(
        telegram_id=telegram_id,
        prize_type="digital",
        promo_code=promo_code,
        instructions=instructions,
        claimed_at=claimed_at,  # Приз уже получен
        code_word=code_word,
        sheet_name="Лист1",
        row_id=1,
        gdpr_consent_date=datetime.now(timezone.utc)
    )
    
    test_db_session.add(prize)
    await test_db_session.commit()
    
    # Act: Проверяем, что пользователь существует (первый шаг в prize flow)
    user_exists = await prize_repository.check_user_exists(telegram_id)
    
    # Assert: check_user_exists должен вернуть True, чтобы пользователь
    # мог продолжить процесс и получить промокод повторно
    assert user_exists is True, (
        f"check_user_exists должен возвращать True для пользователя "
        f"с telegram_id={telegram_id}, который уже получил цифровой приз. "
        f"Это необходимо для идемпотентной выдачи промокода. "
        f"Получено: {user_exists}"
    )


# ============================================================================
# Property 3: Bug Condition - Показ статуса заполненной формы для физических призов
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.pbt
@given(
    telegram_id=st.integers(min_value=100000, max_value=999999999),
    last_name=st.text(
        alphabet=st.characters(whitelist_categories=("Lu", "Ll")),
        min_size=2,
        max_size=30
    ),
    first_name=st.text(
        alphabet=st.characters(whitelist_categories=("Lu", "Ll")),
        min_size=2,
        max_size=30
    ),
    city=st.text(
        alphabet=st.characters(whitelist_categories=("Lu", "Ll")),
        min_size=2,
        max_size=50
    ),
    code_word=st.text(
        alphabet=st.characters(whitelist_categories=("Ll", "Lu")),
        min_size=3,
        max_size=15
    )
)
@settings(
    max_examples=10,  # Ограничиваем для детерминистического бага
    phases=[Phase.generate, Phase.target],
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_physical_prize_show_filled_delivery_status(
    telegram_id: int,
    last_name: str,
    first_name: str,
    city: str,
    code_word: str,
    prize_repository: PrizeRepository,
    test_db_session
):
    """
    **Validates: Requirements 2.3**
    
    Property: Повторный запрос физического приза с заполненной формой 
    должен показать статус заполненной формы с кнопками действий
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ**: УПАДЁТ
    check_user_exists вернёт False, и система покажет ошибку
    "У вас нет доступных призов"
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ ПОСЛЕ ИСПРАВЛЕНИЯ**: ПРОЙДЁТ
    Система найдёт пользователя и покажет статус заполненной формы
    """
    # Фильтруем невалидные входные данные
    from hypothesis import assume
    assume(len(last_name.strip()) > 0)
    assume(len(first_name.strip()) > 0)
    assume(len(city.strip()) > 0)
    assume(len(code_word.strip()) > 0)
    
    # Очищаем таблицу перед каждым примером
    await test_db_session.execute(delete(Prize))
    await test_db_session.commit()
    
    # Arrange: Создаём пользователя с заполненной формой доставки
    claimed_at = datetime.now(timezone.utc)
    
    prize = Prize(
        telegram_id=telegram_id,
        prize_type="physical",
        claimed_at=claimed_at,  # Форма доставки заполнена
        last_name=last_name,
        first_name=first_name,
        city=city,
        street="Ленина",
        house="1",
        phone="+79991234567",
        code_word=code_word,
        sheet_name="Лист1",
        row_id=1,
        gdpr_consent_date=datetime.now(timezone.utc)
    )
    
    test_db_session.add(prize)
    await test_db_session.commit()
    
    # Act: Проверяем, что пользователь существует (первый шаг в prize flow)
    user_exists = await prize_repository.check_user_exists(telegram_id)
    
    # Assert: check_user_exists должен вернуть True, чтобы пользователь
    # мог продолжить процесс и увидеть статус заполненной формы
    assert user_exists is True, (
        f"check_user_exists должен возвращать True для пользователя "
        f"с telegram_id={telegram_id}, который уже заполнил форму доставки. "
        f"Это необходимо для показа статуса заполненной формы. "
        f"Получено: {user_exists}"
    )


# ============================================================================
# Property 1: Bug Condition - GDPR Consent Persistence для пользователей без призов
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.pbt
@given(
    telegram_id=st.integers(min_value=100000, max_value=999999999),
)
@settings(
    max_examples=10,  # Ограничиваем для детерминистического бага
    phases=[Phase.generate, Phase.target],  # Scoped PBT подход
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_gdpr_consent_persistence_without_prizes(
    telegram_id: int,
    prize_repository: PrizeRepository,
    prize_service,
    test_db_session
):
    """
    **Validates: Requirements 2.1, 2.2, 2.3**
    
    Property: GDPR согласие должно сохраняться и быть доступно для проверки
    даже для пользователей без записей в таблице prizes
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ**: УПАДЁТ
    Текущая реализация хранит согласие в таблице prizes:
    - update_gdpr_consent() делает UPDATE в prizes, но если записей нет - ничего не обновится
    - get_gdpr_consent_date() делает SELECT из prizes, вернёт None для пользователей без призов
    - save_gdpr_consent() вызывает update_gdpr_consent(), который не создаёт новых записей
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ ПОСЛЕ ИСПРАВЛЕНИЯ**: ПРОЙДЁТ
    Исправленная реализация будет хранить согласие в отдельной таблице gdpr_consents,
    независимо от наличия призов у пользователя
    
    Bug Condition:
    - Пользователь дает согласие (вызов save_gdpr_consent(telegram_id))
    - У пользователя нет записей в таблице prizes (user_has_no_prizes == TRUE)
    - Проверка согласия (вызов check_gdpr_consent(telegram_id))
    - Ожидаемое поведение: согласие должно быть найдено
    """
    # Очищаем таблицу перед каждым примером
    await test_db_session.execute(delete(Prize))
    await test_db_session.commit()
    
    # Проверяем, что у пользователя действительно нет записей в таблице prizes
    query = select(Prize).where(Prize.telegram_id == telegram_id)
    result = await test_db_session.execute(query)
    existing_prizes = result.scalars().all()
    assert len(existing_prizes) == 0, (
        f"Предусловие: у пользователя telegram_id={telegram_id} не должно быть призов. "
        f"Найдено: {len(existing_prizes)} записей"
    )
    
    # Act: Пользователь дает согласие с политикой конфиденциальности
    await prize_service.save_gdpr_consent(telegram_id)
    
    # Assert 1: check_gdpr_consent должен вернуть True
    has_consent = await prize_service.check_gdpr_consent(telegram_id)
    assert has_consent is True, (
        f"После вызова save_gdpr_consent() для пользователя без призов "
        f"(telegram_id={telegram_id}), check_gdpr_consent() должен вернуть True. "
        f"Получено: {has_consent}. "
        f"Это подтверждает баг: система не находит согласие для пользователей без призов."
    )
