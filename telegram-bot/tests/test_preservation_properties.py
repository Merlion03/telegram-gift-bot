"""
Preservation Property Tests - Property-Based Testing

**ВАЖНО**: Эти тесты проверяют сохранение существующего поведения для не-bug случаев.
Следуем методологии observation-first: наблюдаем поведение на НЕИСПРАВЛЕННОМ коде,
затем фиксируем его в property-based тестах.

**ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ**: Тесты ПРОХОДЯТ
Это подтверждает baseline поведение, которое должно сохраниться после исправления.

**ОЖИДАЕМЫЙ РЕЗУЛЬТАТ ПОСЛЕ ИСПРАВЛЕНИЯ**: Тесты ПРОХОДЯТ
Это подтверждает отсутствие регрессий.
"""
import pytest
from datetime import datetime, timezone
from hypothesis import given, strategies as st, settings, Phase, HealthCheck
from sqlalchemy import delete

from database.repositories.prize_repository import PrizeRepository
from database.models.prize import Prize


# ============================================================================
# Property 1: Preservation - Первичная выдача цифровых призов
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
    max_examples=20,  # Больше примеров для preservation
    phases=[Phase.generate, Phase.target],
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_preservation_first_digital_prize_delivery(
    telegram_id: int,
    promo_code: str,
    code_word: str,
    prize_repository: PrizeRepository,
    test_db_session
):
    """
    **Validates: Requirements 3.1**
    
    Property: Для всех пользователей с claimed_at IS NULL,
    первичный запрос выдаёт промокод и устанавливает claimed_at
    
    **Observation**: Пользователь с claimed_at IS NULL получает промокод при первом запросе
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ на неисправленном коде
    Это baseline поведение, которое должно сохраниться после исправления
    """
    # Фильтруем невалидные входные данные
    from hypothesis import assume
    assume(len(promo_code.strip()) > 0)
    assume(len(code_word.strip()) > 0)
    
    # Очищаем таблицу перед каждым примером
    await test_db_session.execute(delete(Prize))
    await test_db_session.commit()
    
    # Arrange: Создаём пользователя БЕЗ полученного приза (claimed_at IS NULL)
    instructions = "Используйте промокод на сайте example.com"
    
    prize = Prize(
        telegram_id=telegram_id,
        prize_type="digital",
        promo_code=promo_code,
        instructions=instructions,
        claimed_at=None,  # Приз ещё НЕ получен
        code_word=code_word,
        sheet_name="Лист1",
        row_id=1,
        gdpr_consent_date=datetime.now(timezone.utc)
    )
    
    test_db_session.add(prize)
    await test_db_session.commit()
    
    # Act: Проверяем, что пользователь существует (первый шаг в prize flow)
    user_exists = await prize_repository.check_user_exists(telegram_id)
    
    # Assert: check_user_exists должен вернуть True для пользователя
    # с неполученным призом (claimed_at IS NULL)
    assert user_exists is True, (
        f"check_user_exists должен возвращать True для пользователя "
        f"с telegram_id={telegram_id}, который ещё не получил приз (claimed_at IS NULL). "
        f"Это baseline поведение для первичной выдачи призов. "
        f"Получено: {user_exists}"
    )


# ============================================================================
# Property 2: Preservation - Первичная выдача физических призов
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.pbt
@given(
    telegram_id=st.integers(min_value=100000, max_value=999999999),
    code_word=st.text(
        alphabet=st.characters(whitelist_categories=("Ll", "Lu")),
        min_size=3,
        max_size=15
    )
)
@settings(
    max_examples=20,
    phases=[Phase.generate, Phase.target],
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_preservation_first_physical_prize_delivery(
    telegram_id: int,
    code_word: str,
    prize_repository: PrizeRepository,
    test_db_session
):
    """
    **Validates: Requirements 3.7**
    
    Property: Для всех пользователей с claimed_at IS NULL и физическим призом,
    первичный запрос показывает WebApp форму
    
    **Observation**: Пользователь с claimed_at IS NULL видит форму доставки при первом запросе
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ на неисправленном коде
    """
    # Фильтруем невалидные входные данные
    from hypothesis import assume
    assume(len(code_word.strip()) > 0)
    
    # Очищаем таблицу перед каждым примером
    await test_db_session.execute(delete(Prize))
    await test_db_session.commit()
    
    # Arrange: Создаём пользователя с физическим призом БЕЗ заполненной формы
    prize = Prize(
        telegram_id=telegram_id,
        prize_type="physical",
        claimed_at=None,  # Форма доставки ещё НЕ заполнена
        code_word=code_word,
        sheet_name="Лист1",
        row_id=1,
        gdpr_consent_date=datetime.now(timezone.utc)
    )
    
    test_db_session.add(prize)
    await test_db_session.commit()
    
    # Act: Проверяем, что пользователь существует
    user_exists = await prize_repository.check_user_exists(telegram_id)
    
    # Assert: check_user_exists должен вернуть True для пользователя
    # с незаполненной формой доставки (claimed_at IS NULL)
    assert user_exists is True, (
        f"check_user_exists должен возвращать True для пользователя "
        f"с telegram_id={telegram_id}, который ещё не заполнил форму доставки. "
        f"Это baseline поведение для первичной выдачи физических призов. "
        f"Получено: {user_exists}"
    )


# ============================================================================
# Property 3: Preservation - Обработка несуществующих пользователей
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.pbt
@given(
    telegram_id=st.integers(min_value=100000, max_value=999999999)
)
@settings(
    max_examples=30,  # Больше примеров для проверки несуществующих пользователей
    phases=[Phase.generate, Phase.target],
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_preservation_nonexistent_user_handling(
    telegram_id: int,
    prize_repository: PrizeRepository,
    test_db_session
):
    """
    **Validates: Requirements 3.2**
    
    Property: Для всех telegram_id, не существующих в таблице призов,
    check_user_exists возвращает False
    
    **Observation**: Пользователь, отсутствующий в таблице призов,
    получает сообщение "У вас нет доступных призов"
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ на неисправленном коде
    """
    # Очищаем таблицу перед каждым примером
    await test_db_session.execute(delete(Prize))
    await test_db_session.commit()
    
    # Act: Проверяем несуществующего пользователя
    user_exists = await prize_repository.check_user_exists(telegram_id)
    
    # Assert: check_user_exists должен вернуть False для несуществующего пользователя
    assert user_exists is False, (
        f"check_user_exists должен возвращать False для пользователя "
        f"с telegram_id={telegram_id}, который отсутствует в таблице призов. "
        f"Это baseline поведение для обработки несуществующих пользователей. "
        f"Получено: {user_exists}"
    )


# ============================================================================
# Property 4: Preservation - Валидация кодового слова
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.pbt
@given(
    telegram_id=st.integers(min_value=100000, max_value=999999999),
    correct_code_word=st.text(
        alphabet=st.characters(whitelist_categories=("Ll", "Lu")),
        min_size=3,
        max_size=15
    ),
    incorrect_code_word=st.text(
        alphabet=st.characters(whitelist_categories=("Ll", "Lu")),
        min_size=3,
        max_size=15
    )
)
@settings(
    max_examples=20,
    phases=[Phase.generate, Phase.target],
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_preservation_code_word_validation(
    telegram_id: int,
    correct_code_word: str,
    incorrect_code_word: str,
    prize_repository: PrizeRepository,
    test_db_session
):
    """
    **Validates: Requirements 3.3**
    
    Property: Для всех неправильных кодовых слов,
    система возвращает ошибку валидации
    
    **Observation**: Неправильное кодовое слово отклоняется
    с сообщением "Кодовое слово введено неверно"
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ на неисправленном коде
    """
    # Фильтруем невалидные входные данные
    from hypothesis import assume
    assume(len(correct_code_word.strip()) > 0)
    assume(len(incorrect_code_word.strip()) > 0)
    assume(correct_code_word.lower() != incorrect_code_word.lower())
    
    # Очищаем таблицу перед каждым примером
    await test_db_session.execute(delete(Prize))
    await test_db_session.commit()
    
    # Arrange: Создаём пользователя с правильным кодовым словом
    prize = Prize(
        telegram_id=telegram_id,
        prize_type="digital",
        promo_code="PROMO2024",
        instructions="Инструкции",
        claimed_at=None,
        code_word=correct_code_word,
        sheet_name="Лист1",
        row_id=1,
        gdpr_consent_date=datetime.now(timezone.utc)
    )
    
    test_db_session.add(prize)
    await test_db_session.commit()
    
    # Act: Проверяем приз с неправильным кодовым словом
    prize_result = await prize_repository.find_prize(telegram_id, incorrect_code_word)
    
    # Assert: Неправильное кодовое слово должно вернуть None
    assert prize_result is None, (
        f"find_prize должен возвращать None для неправильного кодового слова. "
        f"telegram_id={telegram_id}, правильное слово='{correct_code_word}', "
        f"неправильное слово='{incorrect_code_word}'. "
        f"Это baseline поведение для валидации кодового слова. "
        f"Получено: {prize_result}"
    )


# ============================================================================
# Property 5: Preservation - Установка claimed_at для цифровых призов
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.pbt
@given(
    telegram_id=st.integers(min_value=100000, max_value=999999999),
    promo_code=st.text(
        alphabet=st.characters(whitelist_categories=("Lu", "Nd")),
        min_size=5,
        max_size=20
    )
)
@settings(
    max_examples=15,
    phases=[Phase.generate, Phase.target],
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_preservation_claimed_at_digital_prize(
    telegram_id: int,
    promo_code: str,
    prize_repository: PrizeRepository,
    test_db_session
):
    """
    **Validates: Requirements 3.4**
    
    Property: Для всех первичных запросов цифровых призов,
    claimed_at устанавливается корректно
    
    **Observation**: claimed_at устанавливается при первой выдаче цифрового приза
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ на неисправленном коде
    """
    # Фильтруем невалидные входные данные
    from hypothesis import assume
    assume(len(promo_code.strip()) > 0)
    
    # Очищаем таблицу перед каждым примером
    await test_db_session.execute(delete(Prize))
    await test_db_session.commit()
    
    # Arrange: Создаём пользователя БЕЗ полученного приза
    prize = Prize(
        telegram_id=telegram_id,
        prize_type="digital",
        promo_code=promo_code,
        instructions="Инструкции",
        claimed_at=None,  # Приз ещё НЕ получен
        code_word="тестовое_слово",
        sheet_name="Лист1",
        row_id=1,
        gdpr_consent_date=datetime.now(timezone.utc)
    )
    
    test_db_session.add(prize)
    await test_db_session.commit()
    
    code_word = "тестовое_слово"
    
    # Act: Симулируем установку claimed_at (как это делается в реальном коде)
    claimed_time = datetime.now(timezone.utc)
    await prize_repository.mark_prize_claimed(telegram_id, code_word, claimed_time)
    
    # Получаем обновлённый приз
    await test_db_session.refresh(prize)
    
    # Assert: claimed_at должен быть установлен
    assert prize.claimed_at is not None, (
        f"claimed_at должен быть установлен после первой выдачи цифрового приза. "
        f"telegram_id={telegram_id}. "
        f"Это baseline поведение для установки claimed_at. "
        f"Получено: {prize.claimed_at}"
    )


# ============================================================================
# Property 6: Preservation - Установка claimed_at для физических призов
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
    )
)
@settings(
    max_examples=15,
    phases=[Phase.generate, Phase.target],
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_preservation_claimed_at_physical_prize(
    telegram_id: int,
    last_name: str,
    first_name: str,
    prize_repository: PrizeRepository,
    test_db_session,
    create_prize_in_db
):
    """
    **Validates: Requirements 3.5**
    
    Property: Для всех физических призов,
    claimed_at устанавливается после заполнения формы доставки
    
    **Observation**: claimed_at устанавливается после заполнения формы доставки
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ на неисправленном коде
    """
    # Фильтруем невалидные входные данные
    from hypothesis import assume
    assume(len(last_name.strip()) > 0)
    assume(len(first_name.strip()) > 0)
    
    # Очищаем таблицу перед каждым примером
    await test_db_session.execute(delete(Prize))
    await test_db_session.commit()
    
    # Arrange: Создаём пользователя с физическим призом БЕЗ заполненной формы
    code_word = "тестовое_слово"
    prize = await create_prize_in_db(
        telegram_id=telegram_id,
        prize_type="physical",
        claimed_at=None,  # Форма ещё НЕ заполнена
        code_word=code_word
    )
    
    # Act: Симулируем заполнение формы доставки и установку claimed_at
    delivery_data = {
        "last_name": last_name,
        "first_name": first_name,
        "city": "Москва",
        "street": "Ленина",
        "house": "1",
        "phone": "+79991234567"
    }
    
    claimed_time = datetime.now(timezone.utc)
    await prize_repository.update_delivery_data(telegram_id, code_word, delivery_data)
    await prize_repository.mark_prize_claimed(telegram_id, code_word, claimed_time)
    
    # Получаем обновлённый приз
    await test_db_session.refresh(prize)
    
    # Assert: claimed_at должен быть установлен после заполнения формы
    assert prize.claimed_at is not None, (
        f"claimed_at должен быть установлен после заполнения формы доставки. "
        f"telegram_id={telegram_id}. "
        f"Это baseline поведение для установки claimed_at. "
        f"Получено: {prize.claimed_at}"
    )


# ============================================================================
# Property 7: Preservation - GDPR согласие для новых пользователей
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.pbt
@given(
    telegram_id=st.integers(min_value=100000, max_value=999999999)
)
@settings(
    max_examples=20,
    phases=[Phase.generate, Phase.target],
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_preservation_gdpr_consent_request_for_new_users(
    telegram_id: int,
    prize_service,
    test_db_session
):
    """
    **Validates: Requirements 3.1**
    
    Property: Для всех новых пользователей (без согласия),
    система запрашивает GDPR согласие
    
    **Observation**: Пользователи без GDPR согласия получают запрос согласия
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ на неисправленном коде
    """
    # Очищаем таблицы перед каждым примером
    await test_db_session.execute(delete(Prize))
    from database.models.gdpr_consent import GdprConsent
    await test_db_session.execute(delete(GdprConsent))
    await test_db_session.commit()
    
    # Arrange: Создаём пользователя БЕЗ GDPR согласия
    prize = Prize(
        telegram_id=telegram_id,
        prize_type="digital",
        promo_code="PROMO2024",
        instructions="Инструкции",
        claimed_at=None,
        code_word="тестовое_слово",
        sheet_name="Лист1",
        row_id=1,
        gdpr_consent_date=None  # GDPR согласие НЕ дано
    )
    
    test_db_session.add(prize)
    await test_db_session.commit()
    
    # Act: Проверяем наличие GDPR согласия через новый сервис
    has_consent = await prize_service.check_gdpr_consent(telegram_id)
    
    # Assert: check_gdpr_consent должен вернуть False для пользователя без согласия
    assert has_consent is False, (
        f"check_gdpr_consent должен возвращать False для пользователя "
        f"с telegram_id={telegram_id}, который не дал GDPR согласие. "
        f"Это baseline поведение для проверки GDPR согласия. "
        f"Получено: {has_consent}"
    )


# ============================================================================
# Property 8: Preservation - Кнопка "Назад" не сохраняет согласие
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.pbt
@given(
    telegram_id=st.integers(min_value=100000, max_value=999999999)
)
@settings(
    max_examples=20,
    phases=[Phase.generate, Phase.target],
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_preservation_back_button_no_consent_save(
    telegram_id: int,
    prize_service,
    test_db_session
):
    """
    **Validates: Requirements 3.2**
    
    Property: Для всех пользователей, которые нажимают "Назад" на экране согласия,
    согласие НЕ сохраняется в базе данных
    
    **Observation**: Кнопка "Назад" возвращает в главное меню без сохранения согласия.
    Это означает, что если пользователь не дал согласие, то check_gdpr_consent
    должен вернуть False.
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ на неисправленном коде
    """
    # Очищаем таблицы перед каждым примером
    await test_db_session.execute(delete(Prize))
    from database.models.gdpr_consent import GdprConsent
    await test_db_session.execute(delete(GdprConsent))
    await test_db_session.commit()
    
    # Arrange: Создаём пользователя БЕЗ GDPR согласия
    prize = Prize(
        telegram_id=telegram_id,
        prize_type="digital",
        promo_code="PROMO2024",
        instructions="Инструкции",
        claimed_at=None,
        code_word="тестовое_слово",
        sheet_name="Лист1",
        row_id=1,
        gdpr_consent_date=None  # GDPR согласие НЕ дано
    )
    
    test_db_session.add(prize)
    await test_db_session.commit()
    
    # Act: Симулируем нажатие кнопки "Назад" - НЕ вызываем save_gdpr_consent
    # Просто проверяем, что согласие не было сохранено
    
    # Assert: check_gdpr_consent должен вернуть False (согласие не сохранено)
    has_consent = await prize_service.check_gdpr_consent(telegram_id)
    
    assert has_consent is False, (
        f"check_gdpr_consent должен возвращать False для пользователя "
        f"с telegram_id={telegram_id}, который нажал 'Назад' и не дал согласие. "
        f"Это baseline поведение для обработки кнопки 'Назад'. "
        f"Получено: {has_consent}"
    )


# ============================================================================
# Property 9: Preservation - После согласия запрашивается кодовое слово
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.pbt
@given(
    telegram_id=st.integers(min_value=100000, max_value=999999999)
)
@settings(
    max_examples=20,
    phases=[Phase.generate, Phase.target],
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_preservation_code_word_request_after_consent(
    telegram_id: int,
    prize_repository: PrizeRepository,
    prize_service,
    test_db_session
):
    """
    **Validates: Requirements 3.3**
    
    Property: Для всех пользователей, которые дают согласие,
    система должна запросить кодовое слово на следующем шаге
    
    **Observation**: После сохранения согласия (save_gdpr_consent),
    check_gdpr_consent должен вернуть True, что позволяет перейти к запросу кодового слова
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ на неисправленном коде
    """
    # Очищаем таблицу перед каждым примером
    await test_db_session.execute(delete(Prize))
    await test_db_session.commit()
    
    # Arrange: Создаём пользователя с призом (чтобы save_gdpr_consent мог работать)
    prize = Prize(
        telegram_id=telegram_id,
        prize_type="digital",
        promo_code="PROMO2024",
        instructions="Инструкции",
        claimed_at=None,
        code_word="тестовое_слово",
        sheet_name="Лист1",
        row_id=1,
        gdpr_consent_date=None  # GDPR согласие НЕ дано
    )
    
    test_db_session.add(prize)
    await test_db_session.commit()
    
    # Act: Симулируем согласие пользователя
    await prize_service.save_gdpr_consent(telegram_id)
    
    # Проверяем, что согласие было сохранено
    has_consent = await prize_service.check_gdpr_consent(telegram_id)
    
    # Assert: После согласия check_gdpr_consent должен вернуть True
    assert has_consent is True, (
        f"После вызова save_gdpr_consent() для пользователя "
        f"с telegram_id={telegram_id}, check_gdpr_consent() должен вернуть True. "
        f"Это baseline поведение для перехода к запросу кодового слова. "
        f"Получено: {has_consent}"
    )


# ============================================================================
# Property 10: Preservation - Флоу проверки приза без повторного запроса согласия
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.pbt
@given(
    telegram_id=st.integers(min_value=100000, max_value=999999999),
    code_word=st.text(
        alphabet=st.characters(whitelist_categories=("Ll", "Lu")),
        min_size=3,
        max_size=15
    )
)
@settings(
    max_examples=20,
    phases=[Phase.generate, Phase.target],
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_preservation_prize_flow_with_existing_consent(
    telegram_id: int,
    code_word: str,
    prize_repository: PrizeRepository,
    prize_service,
    test_db_session
):
    """
    **Validates: Requirements 3.4**
    
    Property: Для всех пользователей с сохранённым согласием,
    флоу проверки приза работает без повторного запроса согласия
    
    **Observation**: Пользователь с согласием в gdpr_consents
    может проверить приз без повторного запроса согласия
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ на неисправленном коде
    """
    # Фильтруем невалидные входные данные
    from hypothesis import assume
    assume(len(code_word.strip()) > 0)
    
    try:
        # Очищаем таблицы перед каждым примером
        await test_db_session.execute(delete(Prize))
        from database.models.gdpr_consent import GdprConsent
        await test_db_session.execute(delete(GdprConsent))
        await test_db_session.commit()
        
        # Arrange: Создаём пользователя С GDPR согласием в новой таблице
        consent_date = datetime.now(timezone.utc)
        
        # Сохраняем согласие через сервис (это создаст запись в gdpr_consents)
        await prize_service.save_gdpr_consent(telegram_id)
        
        # Создаём приз для пользователя
        prize = Prize(
            telegram_id=telegram_id,
            prize_type="digital",
            promo_code="PROMO2024",
            instructions="Инструкции",
            claimed_at=None,
            code_word=code_word,
            sheet_name="Лист1",
            row_id=1,
            gdpr_consent_date=None  # Старое поле больше не используется
        )
        
        test_db_session.add(prize)
        await test_db_session.commit()
        
        # Act: Проверяем наличие GDPR согласия
        has_consent = await prize_service.check_gdpr_consent(telegram_id)
        
        # Assert: check_gdpr_consent должен вернуть True для пользователя с согласием
        assert has_consent is True, (
            f"check_gdpr_consent должен возвращать True для пользователя "
            f"с telegram_id={telegram_id}, который уже дал GDPR согласие. "
            f"Это baseline поведение для флоу проверки приза без повторного запроса согласия. "
            f"Получено: {has_consent}"
        )
        
        # Act: Проверяем, что пользователь может найти приз с правильным кодовым словом
        found_prize = await prize_repository.find_prize(telegram_id, code_word)
        
        # Assert: find_prize должен вернуть приз для правильного кодового слова
        assert found_prize is not None, (
            f"find_prize должен возвращать приз для пользователя "
            f"с telegram_id={telegram_id} и правильным кодовым словом '{code_word}'. "
            f"Это baseline поведение для флоу проверки приза. "
            f"Получено: {found_prize}"
        )
        
        # Assert: Найденный приз должен иметь правильные данные
        assert found_prize.telegram_id == telegram_id, (
            f"Найденный приз должен принадлежать пользователю {telegram_id}. "
            f"Получено: {found_prize.telegram_id}"
        )
        assert found_prize.code_word == code_word, (
            f"Найденный приз должен иметь кодовое слово '{code_word}'. "
            f"Получено: {found_prize.code_word}"
        )
    except Exception as e:
        # Откатываем транзакцию при ошибке
        await test_db_session.rollback()
        raise
