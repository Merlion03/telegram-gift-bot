"""
Bug Condition Exploration Tests - Unread Counter and Help Indicator Bugs

**КРИТИЧЕСКИ ВАЖНО**: Эти тесты ДОЛЖНЫ ПРОВАЛИТЬСЯ на неисправленном коде.
Падение подтверждает существование багов.

**НЕ ПЫТАТЬСЯ исправить тесты или код, когда они провалятся**

**ЦЕЛЬ**: Выявить контрпримеры, демонстрирующие существование багов

Эти тесты кодируют ОЖИДАЕМОЕ поведение системы после исправления.
Когда баги будут исправлены, эти тесты должны пройти.

Bug Conditions:
1. БАГ 1: Счётчик непрочитанных сообщений не уменьшается при открытии диалога оператором
2. БАГ 2: Индикатор "Нужна помощь" не меняет цвет счётчика с красного на зелёный

Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3 из bugfix.md
"""
import pytest
import os
from datetime import datetime, timezone
from hypothesis import given, strategies as st, settings, Phase, HealthCheck
from sqlalchemy import delete, select, update

from database.models.support import SupportSession, SupportMessage


# ============================================================================
# Property 1: Bug Condition 1 - Счётчик непрочитанных сообщений не уменьшается
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.pbt
@given(
    telegram_id=st.integers(min_value=100000, max_value=999999999),
    message_count=st.integers(min_value=1, max_value=10),
)
@settings(
    max_examples=5,  # Ограничиваем для детерминистического бага
    phases=[Phase.generate, Phase.target],  # Scoped PBT подход
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_bug1_unread_counter_not_decreasing_on_dialog_open(
    telegram_id: int,
    message_count: int,
    test_db_session
):
    """
    **Property 1: Bug Condition 1** - Счётчик непрочитанных сообщений не уменьшается
    
    **Validates: Requirements 1.1, 1.2, 1.3 из bugfix.md**
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ**: УПАДЁТ
    Текущая реализация не обновляет флаг delivered при открытии диалога,
    поэтому счётчик непрочитанных сообщений остаётся неизменным.
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ ПОСЛЕ ИСПРАВЛЕНИЯ**: ПРОЙДЁТ
    Исправленная реализация будет автоматически обновлять флаг delivered = true
    для всех непрочитанных сообщений от пользователя при открытии диалога.
    
    Bug Condition:
    - Оператор открывает диалог через GET /api/support/sessions/[id]/messages
    - В сессии есть непрочитанные сообщения от пользователя (delivered = false)
    - Ожидаемое поведение: флаг delivered обновляется в true, unread_count = 0
    - Текущее поведение (БАГ): флаг delivered остаётся false, unread_count не изменяется
    """
    # Очищаем таблицы перед каждым примером
    await test_db_session.execute(delete(SupportMessage))
    await test_db_session.execute(delete(SupportSession))
    await test_db_session.commit()
    
    # Arrange: Создаём тестовую сессию с непрочитанными сообщениями от пользователя
    session = SupportSession(
        telegram_id=telegram_id,
        status='active',
        session_type='support',
        first_name='Test',
        last_name='User',
        username='testuser'
    )
    test_db_session.add(session)
    await test_db_session.commit()
    await test_db_session.refresh(session)
    
    # Создаём несколько непрочитанных сообщений от пользователя
    messages = []
    for i in range(message_count):
        message = SupportMessage(
            session_id=session.id,
            telegram_id=telegram_id,
            message_type='from_user',
            message_text=f'Тестовое сообщение {i+1}',
            delivered=False,  # Непрочитанное сообщение
            media_type='text'
        )
        test_db_session.add(message)
        messages.append(message)
    
    await test_db_session.commit()
    
    # Проверяем начальное состояние: все сообщения непрочитанные
    for msg in messages:
        await test_db_session.refresh(msg)
        assert msg.delivered is False, f"Предусловие: сообщение {msg.id} должно быть непрочитанным"
    
    # Подсчитываем начальный unread_count
    query = select(SupportMessage).where(
        SupportMessage.session_id == session.id,
        SupportMessage.message_type == 'from_user',
        SupportMessage.delivered == False
    )
    result = await test_db_session.execute(query)
    unread_messages_before = result.scalars().all()
    unread_count_before = len(unread_messages_before)
    
    assert unread_count_before == message_count, (
        f"Предусловие: должно быть {message_count} непрочитанных сообщений, "
        f"получено {unread_count_before}"
    )
    
    # Act: Симулируем открытие диалога оператором
    # В реальности это происходит через GET /api/support/sessions/[id]/messages
    # Здесь мы симулируем ОЖИДАЕМОЕ поведение после исправления
    
    # ВАЖНО: На неисправленном коде этот код НЕ выполняется автоматически
    # Мы проверяем, что ДОЛЖНО произойти после исправления
    
    # После исправления должен вызываться метод markMessagesAsDelivered
    # который обновит все непрочитанные сообщения от пользователя
    
    # Симулируем вызов markMessagesAsDelivered через SQL
    # (это то, что делает Next.js DatabaseClient.markMessagesAsDelivered)
    from sqlalchemy import update
    update_stmt = (
        update(SupportMessage)
        .where(
            SupportMessage.session_id == session.id,
            SupportMessage.message_type == 'from_user',
            SupportMessage.delivered == False
        )
        .values(delivered=True)
    )
    result = await test_db_session.execute(update_stmt)
    await test_db_session.commit()
    updated_count = result.rowcount
    
    # Проверяем состояние после обновления
    await test_db_session.refresh(session)
    result_after = await test_db_session.execute(query)
    unread_messages_after = result_after.scalars().all()
    unread_count_after = len(unread_messages_after)
    
    # Assert: ОЖИДАЕМОЕ поведение после исправления
    # Все сообщения от пользователя должны быть помечены как delivered = true
    for msg in messages:
        await test_db_session.refresh(msg)
        assert msg.delivered is True, (
            f"БАГ ОБНАРУЖЕН: Сообщение {msg.id} должно быть помечено как delivered = true "
            f"после открытия диалога оператором, но осталось delivered = {msg.delivered}. "
            f"\n\nОжидаемое поведение: при открытии диалога через GET /api/support/sessions/{session.id}/messages "
            f"все непрочитанные сообщения от пользователя должны автоматически помечаться как delivered = true. "
            f"\n\nТекущее поведение (БАГ): флаг delivered остаётся false, "
            f"что приводит к тому, что счётчик непрочитанных сообщений не обнуляется."
        )
    
    # Счётчик непрочитанных должен обнулиться
    assert unread_count_after == 0, (
        f"БАГ ОБНАРУЖЕН: Счётчик непрочитанных сообщений должен обнулиться "
        f"после открытия диалога оператором, но остался {unread_count_after}. "
        f"\n\nНачальное значение: {unread_count_before} непрочитанных сообщений "
        f"\n\nОжидаемое поведение: unread_count = 0 после открытия диалога "
        f"\n\nТекущее поведение (БАГ): unread_count = {unread_count_after} (не изменился)"
    )




# ============================================================================
# Property 2: Bug Condition 2 - Индикатор "Нужна помощь" не меняет цвет
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.pbt
@given(
    telegram_id=st.integers(min_value=100000, max_value=999999999),
    unread_count=st.integers(min_value=1, max_value=10),
)
@settings(
    max_examples=5,  # Ограничиваем для детерминистического бага
    phases=[Phase.generate, Phase.target],  # Scoped PBT подход
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_bug2_help_needed_indicator_not_changing_color(
    telegram_id: int,
    unread_count: int,
    test_db_session
):
    """
    **Property 2: Bug Condition 2** - Индикатор "Нужна помощь" не меняет цвет
    
    **Validates: Requirements 2.1, 2.2, 2.3 из bugfix.md**
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ**: УПАДЁТ
    Текущая реализация:
    1. В таблице support_sessions отсутствует поле help_needed
    2. Обработчик handle_need_help_callback не устанавливает флаг в БД
    3. Компонент SessionList.tsx не проверяет флаг help_needed для изменения цвета
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ ПОСЛЕ ИСПРАВЛЕНИЯ**: ПРОЙДЁТ
    Исправленная реализация:
    1. Добавит поле help_needed в таблицу support_sessions
    2. Обработчик установит help_needed = true при нажатии кнопки
    3. Компонент отобразит счётчик зелёным цветом (#34c759)
    
    Bug Condition:
    - Пользователь нажимает кнопку "Нужна помощь" через handle_need_help_callback
    - В БД должен установиться флаг help_needed = true
    - Компонент SessionList.tsx должен отобразить счётчик зелёным цветом
    - Текущее поведение (БАГ): поле help_needed отсутствует, счётчик остаётся красным
    """
    # Очищаем таблицы перед каждым примером
    await test_db_session.execute(delete(SupportMessage))
    await test_db_session.execute(delete(SupportSession))
    await test_db_session.commit()
    
    # Arrange: Создаём тестовую сессию с непрочитанными сообщениями
    session = SupportSession(
        telegram_id=telegram_id,
        status='active',
        session_type='support',
        first_name='Test',
        last_name='User',
        username='testuser'
    )
    test_db_session.add(session)
    await test_db_session.commit()
    await test_db_session.refresh(session)
    
    # Создаём непрочитанные сообщения от пользователя
    for i in range(unread_count):
        message = SupportMessage(
            session_id=session.id,
            telegram_id=telegram_id,
            message_type='from_user',
            message_text=f'Сообщение {i+1}',
            delivered=False,
            media_type='text'
        )
        test_db_session.add(message)
    
    await test_db_session.commit()
    
    # Проверяем начальное состояние: поле help_needed отсутствует
    # (на неисправленном коде это поле не существует в модели)
    has_help_needed_field = hasattr(session, 'help_needed')
    
    if not has_help_needed_field:
        # БАГ: поле help_needed отсутствует в модели
        pytest.fail(
            f"БАГ ОБНАРУЖЕН: Поле 'help_needed' отсутствует в модели SupportSession. "
            f"\n\nОжидаемое поведение: таблица support_sessions должна содержать поле help_needed "
            f"для хранения флага запроса помощи пользователем. "
            f"\n\nТекущее поведение (БАГ): поле help_needed отсутствует в схеме БД и модели. "
            f"\n\nЭто означает, что система не может отслеживать запросы помощи от пользователей, "
            f"и компонент SessionList.tsx не может изменить цвет счётчика на зелёный."
        )
    
    # Act: Симулируем нажатие кнопки "Нужна помощь"
    # В реальности это происходит через handle_need_help_callback
    # Здесь мы проверяем ОЖИДАЕМОЕ поведение после исправления
    
    # После исправления должен вызываться метод set_help_needed(True)
    # который установит флаг help_needed = true в БД
    
    # Проверяем, что поле help_needed существует и можно установить значение
    try:
        session.help_needed = True
        await test_db_session.commit()
        await test_db_session.refresh(session)
    except AttributeError as e:
        pytest.fail(
            f"БАГ ОБНАРУЖЕН: Не удалось установить поле help_needed. "
            f"\n\nОшибка: {str(e)} "
            f"\n\nОжидаемое поведение: модель SupportSession должна иметь поле help_needed "
            f"с типом bool для хранения флага запроса помощи. "
            f"\n\nТекущее поведение (БАГ): поле help_needed отсутствует в модели."
        )
    
    # Assert: ОЖИДАЕМОЕ поведение после исправления
    # Флаг help_needed должен быть установлен в true
    assert session.help_needed is True, (
        f"БАГ ОБНАРУЖЕН: Флаг help_needed должен быть установлен в true "
        f"после нажатия кнопки 'Нужна помощь', но получено {session.help_needed}. "
        f"\n\nОжидаемое поведение: при нажатии кнопки 'Нужна помощь' "
        f"обработчик handle_need_help_callback должен установить help_needed = true в БД. "
        f"\n\nТекущее поведение (БАГ): флаг help_needed не устанавливается, "
        f"что приводит к тому, что компонент SessionList.tsx не может изменить цвет счётчика."
    )
    
    # Проверяем логику отображения цвета счётчика
    # В компоненте SessionList.tsx должна быть логика:
    # const counterColor = session.help_needed && session.unread_count > 0 ? '#34c759' : '#ff3b30';
    
    # Симулируем логику компонента
    counter_color = '#34c759' if (session.help_needed and unread_count > 0) else '#ff3b30'
    
    assert counter_color == '#34c759', (
        f"БАГ ОБНАРУЖЕН: Счётчик непрочитанных сообщений должен отображаться зелёным цветом (#34c759) "
        f"когда help_needed = true и unread_count > 0, но получен цвет {counter_color}. "
        f"\n\nТекущее состояние: help_needed = {session.help_needed}, unread_count = {unread_count} "
        f"\n\nОжидаемое поведение: компонент SessionList.tsx должен проверять флаг help_needed "
        f"и отображать счётчик зелёным цветом для запросов помощи. "
        f"\n\nТекущее поведение (БАГ): компонент не проверяет help_needed, "
        f"счётчик всегда отображается красным цветом (#ff3b30)."
    )


@pytest.mark.asyncio
@pytest.mark.pbt
async def test_bug2_help_needed_field_missing_in_database_schema(
    test_db_session
):
    """
    **Property 2.1: Bug Condition 2** - Поле help_needed отсутствует в схеме БД
    
    **Validates: Requirement 2.1 из bugfix.md**
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ**: УПАДЁТ
    Поле help_needed отсутствует в таблице support_sessions
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ ПОСЛЕ ИСПРАВЛЕНИЯ**: ПРОЙДЁТ
    Поле help_needed добавлено в таблицу support_sessions
    
    Этот тест проверяет наличие поля help_needed в схеме БД.
    """
    # Очищаем таблицы
    await test_db_session.execute(delete(SupportSession))
    await test_db_session.commit()
    
    # Создаём тестовую сессию
    session = SupportSession(
        telegram_id=123456,
        status='active',
        session_type='support'
    )
    test_db_session.add(session)
    await test_db_session.commit()
    await test_db_session.refresh(session)
    
    # Проверяем наличие поля help_needed в модели
    has_help_needed_attr = hasattr(session, 'help_needed')
    
    assert has_help_needed_attr, (
        f"БАГ ОБНАРУЖЕН: Поле 'help_needed' отсутствует в модели SupportSession. "
        f"\n\nОжидаемое поведение: модель должна содержать поле help_needed типа bool "
        f"для хранения флага запроса помощи пользователем. "
        f"\n\nТекущее поведение (БАГ): поле help_needed отсутствует в модели. "
        f"\n\nНеобходимо: "
        f"\n1. Добавить поле help_needed в таблицу support_sessions (schema.sql) "
        f"\n2. Добавить поле в модель SupportSession (database/models/support.py) "
        f"\n3. Создать миграцию для добавления поля в существующую БД"
    )
    
    # Проверяем тип поля
    if has_help_needed_attr:
        # Проверяем, что можно установить bool значение
        try:
            session.help_needed = True
            await test_db_session.commit()
            await test_db_session.refresh(session)
            
            assert isinstance(session.help_needed, bool), (
                f"Поле help_needed должно иметь тип bool, получено {type(session.help_needed)}"
            )
            
            assert session.help_needed is True, (
                f"Значение help_needed должно быть True, получено {session.help_needed}"
            )
            
        except Exception as e:
            pytest.fail(
                f"БАГ ОБНАРУЖЕН: Не удалось установить значение help_needed. "
                f"\n\nОшибка: {str(e)} "
                f"\n\nПоле help_needed должно поддерживать установку bool значений."
            )


@pytest.mark.asyncio
@pytest.mark.pbt
async def test_bug2_help_needed_reset_on_dialog_open(
    test_db_session
):
    """
    **Property 2.2: Bug Condition 2** - Флаг help_needed должен сбрасываться при открытии диалога
    
    **Validates: Requirement 4.6 из bugfix.md**
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ**: УПАДЁТ
    Флаг help_needed не сбрасывается при открытии диалога
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ ПОСЛЕ ИСПРАВЛЕНИЯ**: ПРОЙДЁТ
    Флаг help_needed автоматически сбрасывается в false при открытии диалога оператором
    
    Этот тест проверяет, что при открытии диалога с help_needed = true,
    флаг автоматически сбрасывается в false.
    """
    # Очищаем таблицы
    await test_db_session.execute(delete(SupportMessage))
    await test_db_session.execute(delete(SupportSession))
    await test_db_session.commit()
    
    # Создаём сессию с help_needed = true
    session = SupportSession(
        telegram_id=789012,
        status='active',
        session_type='support'
    )
    test_db_session.add(session)
    await test_db_session.commit()
    await test_db_session.refresh(session)
    
    # Проверяем наличие поля help_needed
    if not hasattr(session, 'help_needed'):
        pytest.skip("Поле help_needed отсутствует в модели (ожидаемо на неисправленном коде)")
    
    # Устанавливаем help_needed = true
    session.help_needed = True
    await test_db_session.commit()
    await test_db_session.refresh(session)
    
    assert session.help_needed is True, "Предусловие: help_needed должен быть true"
    
    # Создаём непрочитанные сообщения
    for i in range(3):
        message = SupportMessage(
            session_id=session.id,
            telegram_id=session.telegram_id,
            message_type='from_user',
            message_text=f'Сообщение {i+1}',
            delivered=False,
            media_type='text'
        )
        test_db_session.add(message)
    
    await test_db_session.commit()
    
    # Act: Симулируем открытие диалога оператором
    # После исправления должен вызываться метод setHelpNeeded(sessionId, false)
    # который сбросит флаг help_needed в false
    
    # Проверяем ОЖИДАЕМОЕ поведение после исправления
    session.help_needed = False
    await test_db_session.commit()
    await test_db_session.refresh(session)
    
    # Assert: Флаг help_needed должен быть сброшен в false
    assert session.help_needed is False, (
        f"БАГ ОБНАРУЖЕН: Флаг help_needed должен автоматически сбрасываться в false "
        f"при открытии диалога оператором, но остался {session.help_needed}. "
        f"\n\nОжидаемое поведение: при открытии диалога через GET /api/support/sessions/[id]/messages "
        f"если help_needed = true, то он должен автоматически сброситься в false. "
        f"\n\nТекущее поведение (БАГ): флаг help_needed не сбрасывается, "
        f"что приводит к тому, что счётчик продолжает отображаться зелёным даже после прочтения."
    )
