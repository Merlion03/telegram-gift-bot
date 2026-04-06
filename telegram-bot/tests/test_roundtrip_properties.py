"""
Комплексный Property-Based Test для проверки идемпотентности системы.

Этот тест проверяет, что парсинг и форматирование промокодов сохраняют
целостность данных при прямом и обратном преобразовании (round-trip).
"""
import pytest
from hypothesis import given, strategies as st, settings, assume

from utils.promo_parser import PromoCodeParser, PromoCodeData
from utils.message_formatter import MessageFormatter


# ============================================================================
# Property 15: Round-trip парсинга и форматирования (идемпотентность)
# ============================================================================

@pytest.mark.pbt
@given(
    promo_codes=st.lists(
        st.text(
            alphabet=st.characters(whitelist_categories=("Lu", "Nd")),
            min_size=1,
            max_size=20
        ),
        min_size=1,
        max_size=10
    ),
    instructions=st.lists(
        st.text(
            alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Zs")),
            min_size=1,
            max_size=50
        ),
        min_size=1,
        max_size=10
    )
)
@settings(max_examples=100)
def test_property_15_roundtrip_parsing_formatting(promo_codes, instructions):
    """
    Feature: multiple-promo-codes-delivery, Property 15: Round-trip парсинга и форматирования (идемпотентность)
    
    **Validates: Requirements 1.1, 1.2, 1.3 (комплексная проверка)**
    
    Property: Для любого списка промокодов и инструкций, если мы объединим их в строки
    с разделителем ~, затем распарсим обратно и отформатируем, количество промокодов
    в результате должно совпадать с исходным количеством.
    
    Этот тест проверяет идемпотентность всей цепочки обработки:
    1. Объединение промокодов в строку с разделителем
    2. Парсинг строки обратно в список
    3. Объединение с инструкциями
    4. Форматирование в сообщение
    5. Проверка сохранения количества промокодов
    """
    # Фильтруем пустые элементы
    promo_codes = [code.strip() for code in promo_codes if code.strip()]
    instructions = [instr.strip() for instr in instructions if instr.strip()]
    
    assume(len(promo_codes) > 0)
    assume(len(instructions) > 0)
    
    # Arrange: Объединяем в строки с разделителем
    promo_string = PromoCodeParser.SEPARATOR.join(promo_codes)
    instructions_string = PromoCodeParser.SEPARATOR.join(instructions)
    
    # Act: Парсим обратно
    parsed_promos = PromoCodeParser.parse_promo_codes(promo_string)
    parsed_instrs = PromoCodeParser.parse_instructions(instructions_string)
    
    # Assert: Количество промокодов должно совпадать
    assert len(parsed_promos) == len(promo_codes), (
        f"Количество промокодов после round-trip должно совпадать. "
        f"Ожидалось: {len(promo_codes)}, получено: {len(parsed_promos)}"
    )
    
    # Assert: Количество инструкций должно совпадать
    assert len(parsed_instrs) == len(instructions), (
        f"Количество инструкций после round-trip должно совпадать. "
        f"Ожидалось: {len(instructions)}, получено: {len(parsed_instrs)}"
    )
    
    # Act: Объединяем данные
    combined = PromoCodeParser.combine_promo_data(
        promo_codes=parsed_promos,
        instructions=parsed_instrs,
        telegram_id=12345
    )
    
    # Assert: Количество объединённых данных должно совпадать с количеством промокодов
    assert len(combined) == len(promo_codes), (
        f"Количество объединённых данных должно совпадать с исходным количеством промокодов. "
        f"Ожидалось: {len(promo_codes)}, получено: {len(combined)}"
    )
    
    # Act: Форматируем сообщение
    message = MessageFormatter.format_multiple_promos(
        promo_data_list=combined,
        telegram_id=12345
    )
    
    # Assert: Сообщение должно содержать все промокоды
    for promo_code in promo_codes:
        assert f"<code>{promo_code}</code>" in message, (
            f"Отформатированное сообщение должно содержать промокод '{promo_code}'"
        )
    
    # Assert: Количество тегов <code> должно совпадать с количеством промокодов
    code_tag_count = message.count("<code>")
    assert code_tag_count == len(promo_codes), (
        f"Количество тегов <code> в сообщении должно совпадать с количеством промокодов. "
        f"Ожидалось: {len(promo_codes)}, получено: {code_tag_count}"
    )


@pytest.mark.pbt
@given(
    promo_codes=st.lists(
        st.text(
            alphabet=st.characters(whitelist_categories=("Lu", "Nd")),
            min_size=1,
            max_size=20
        ),
        min_size=1,
        max_size=5
    ),
    instructions=st.lists(
        st.text(
            alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Zs")),
            min_size=1,
            max_size=50
        ),
        min_size=1,
        max_size=5
    )
)
@settings(max_examples=100)
def test_roundtrip_with_message_splitting(promo_codes, instructions):
    """
    Комплексный тест round-trip с учётом разделения длинных сообщений.
    
    **Validates: Requirements 1.1, 1.2, 1.3, 5.5 (комплексная проверка с разделением)**
    
    Property: Даже при разделении сообщения на части из-за превышения лимита Telegram,
    все промокоды должны присутствовать в объединённом результате.
    """
    # Фильтруем пустые элементы
    promo_codes = [code.strip() for code in promo_codes if code.strip()]
    instructions = [instr.strip() for instr in instructions if instr.strip()]
    
    assume(len(promo_codes) > 0)
    assume(len(instructions) > 0)
    
    # Arrange: Объединяем в строки с разделителем
    promo_string = PromoCodeParser.SEPARATOR.join(promo_codes)
    instructions_string = PromoCodeParser.SEPARATOR.join(instructions)
    
    # Act: Полный цикл обработки
    parsed_promos = PromoCodeParser.parse_promo_codes(promo_string)
    parsed_instrs = PromoCodeParser.parse_instructions(instructions_string)
    combined = PromoCodeParser.combine_promo_data(
        promo_codes=parsed_promos,
        instructions=parsed_instrs,
        telegram_id=12345
    )
    message = MessageFormatter.format_multiple_promos(
        promo_data_list=combined,
        telegram_id=12345
    )
    message_parts = MessageFormatter.split_message_if_needed(message, 12345)
    
    # Assert: Объединённое сообщение должно содержать все промокоды
    full_message = "\n".join(message_parts)
    
    for promo_code in promo_codes:
        assert f"<code>{promo_code}</code>" in full_message, (
            f"Объединённое сообщение должно содержать промокод '{promo_code}'"
        )
    
    # Assert: Каждая часть не должна превышать лимит Telegram
    for i, part in enumerate(message_parts):
        assert len(part) <= MessageFormatter.TELEGRAM_MESSAGE_LIMIT, (
            f"Часть {i} сообщения превышает лимит Telegram. "
            f"Длина: {len(part)}, лимит: {MessageFormatter.TELEGRAM_MESSAGE_LIMIT}"
        )


@pytest.mark.pbt
@given(
    promo_codes=st.lists(
        st.text(
            alphabet=st.characters(whitelist_categories=("Lu", "Nd")),
            min_size=1,
            max_size=20
        ),
        min_size=1,
        max_size=10
    )
)
@settings(max_examples=100)
def test_roundtrip_preserves_order(promo_codes):
    """
    Тест проверки сохранения порядка промокодов при round-trip.
    
    **Validates: Requirements 3.7 (сохранение порядка)**
    
    Property: Порядок промокодов должен сохраняться на всех этапах обработки.
    """
    # Фильтруем пустые элементы
    promo_codes = [code.strip() for code in promo_codes if code.strip()]
    assume(len(promo_codes) > 0)
    
    # Arrange: Объединяем в строку
    promo_string = PromoCodeParser.SEPARATOR.join(promo_codes)
    
    # Act: Парсим обратно
    parsed_promos = PromoCodeParser.parse_promo_codes(promo_string)
    
    # Assert: Порядок должен сохраниться
    assert parsed_promos == promo_codes, (
        f"Порядок промокодов должен сохраниться после парсинга. "
        f"Ожидалось: {promo_codes}, получено: {parsed_promos}"
    )
    
    # Act: Создаём PromoCodeData с инструкциями по умолчанию
    combined = PromoCodeParser.combine_promo_data(
        promo_codes=parsed_promos,
        instructions=[],
        telegram_id=12345
    )
    
    # Assert: Порядок промокодов в combined должен совпадать
    for i, promo_data in enumerate(combined):
        assert promo_data.promo_code == promo_codes[i], (
            f"Промокод на позиции {i} должен совпадать. "
            f"Ожидалось: '{promo_codes[i]}', получено: '{promo_data.promo_code}'"
        )
