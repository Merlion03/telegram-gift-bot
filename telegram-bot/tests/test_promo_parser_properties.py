"""
Property-Based Tests для PromoCodeParser

Эти тесты проверяют универсальные свойства корректности парсера промокодов
на большом количестве сгенерированных входных данных.
"""
import pytest
from hypothesis import given, strategies as st, settings, Phase, assume

from utils.promo_parser import PromoCodeParser, PromoCodeData


# ============================================================================
# Property 1: Парсинг промокодов по разделителю
# ============================================================================

@pytest.mark.pbt
@given(
    promo_codes_list=st.lists(
        st.text(
            alphabet=st.characters(
                whitelist_categories=("Lu", "Ll", "Nd"),
                min_codepoint=33,
                max_codepoint=126
            ),
            min_size=1,
            max_size=50
        ),
        min_size=1,
        max_size=10
    )
)
@settings(max_examples=100)
def test_property_1_parse_promo_codes_count(promo_codes_list):
    """
    Feature: multiple-promo-codes-delivery, Property 1: Парсинг промокодов по разделителю
    
    **Validates: Requirements 1.1**
    
    Property: Для любого списка промокодов, объединённых разделителем ~,
    количество элементов после парсинга равно количеству промокодов в исходном списке
    """
    # Фильтруем пустые промокоды
    promo_codes_list = [code.strip() for code in promo_codes_list if code.strip()]
    assume(len(promo_codes_list) > 0)
    
    # Arrange: Объединяем промокоды в строку с разделителем
    promo_string = PromoCodeParser.SEPARATOR.join(promo_codes_list)
    
    # Act: Парсим строку
    result = PromoCodeParser.parse_promo_codes(promo_string)
    
    # Assert: Количество элементов должно совпадать
    assert len(result) == len(promo_codes_list), (
        f"Количество промокодов после парсинга должно совпадать с исходным. "
        f"Ожидалось: {len(promo_codes_list)}, получено: {len(result)}. "
        f"Исходная строка: '{promo_string}'"
    )


# ============================================================================
# Property 2: Парсинг инструкций по разделителю
# ============================================================================

@pytest.mark.pbt
@given(
    instructions_list=st.lists(
        st.text(
            alphabet=st.characters(
                whitelist_categories=("Lu", "Ll", "Nd", "Zs"),
                min_codepoint=33,
                max_codepoint=126
            ),
            min_size=1,
            max_size=100
        ),
        min_size=1,
        max_size=10
    )
)
@settings(max_examples=100)
def test_property_2_parse_instructions_count(instructions_list):
    """
    Feature: multiple-promo-codes-delivery, Property 2: Парсинг инструкций по разделителю
    
    **Validates: Requirements 1.2**
    
    Property: Для любого списка инструкций, объединённых разделителем ~,
    количество элементов после парсинга равно количеству инструкций в исходном списке
    """
    # Фильтруем пустые инструкции
    instructions_list = [instr.strip() for instr in instructions_list if instr.strip()]
    assume(len(instructions_list) > 0)
    
    # Arrange: Объединяем инструкции в строку с разделителем
    instructions_string = PromoCodeParser.SEPARATOR.join(instructions_list)
    
    # Act: Парсим строку
    result = PromoCodeParser.parse_instructions(instructions_string)
    
    # Assert: Количество элементов должно совпадать
    assert len(result) == len(instructions_list), (
        f"Количество инструкций после парсинга должно совпадать с исходным. "
        f"Ожидалось: {len(instructions_list)}, получено: {len(result)}. "
        f"Исходная строка: '{instructions_string}'"
    )


# ============================================================================
# Property 3: Связывание промокодов и инструкций по индексу
# ============================================================================

@pytest.mark.pbt
@given(
    size=st.integers(min_value=1, max_value=10),
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
def test_property_3_combine_promo_data_by_index(size, promo_codes, instructions):
    """
    Feature: multiple-promo-codes-delivery, Property 3: Связывание промокодов и инструкций по индексу
    
    **Validates: Requirements 1.3**
    
    Property: Для любых двух массивов одинаковой длины (промокоды и инструкции),
    функция combine_promo_data должна вернуть массив PromoCodeData,
    где каждый элемент содержит промокод и инструкцию с соответствующим индексом
    """
    # Фильтруем пустые элементы
    promo_codes = [code.strip() for code in promo_codes if code.strip()]
    instructions = [instr.strip() for instr in instructions if instr.strip()]
    
    # Обрезаем до одинаковой длины
    min_size = min(len(promo_codes), len(instructions), size)
    assume(min_size > 0)
    
    promo_codes = promo_codes[:min_size]
    instructions = instructions[:min_size]
    
    # Act: Объединяем данные
    result = PromoCodeParser.combine_promo_data(
        promo_codes=promo_codes,
        instructions=instructions,
        telegram_id=12345
    )
    
    # Assert: Количество элементов должно совпадать
    assert len(result) == len(promo_codes), (
        f"Количество элементов PromoCodeData должно совпадать с количеством промокодов. "
        f"Ожидалось: {len(promo_codes)}, получено: {len(result)}"
    )
    
    # Assert: Каждый элемент должен содержать правильные промокод и инструкцию
    for i, promo_data in enumerate(result):
        assert promo_data.promo_code == promo_codes[i], (
            f"Промокод на позиции {i} должен совпадать. "
            f"Ожидалось: '{promo_codes[i]}', получено: '{promo_data.promo_code}'"
        )
        assert promo_data.instructions == instructions[i], (
            f"Инструкция на позиции {i} должна совпадать. "
            f"Ожидалось: '{instructions[i]}', получено: '{promo_data.instructions}'"
        )


# ============================================================================
# Property 4: Использование инструкции по умолчанию при несоответствии
# ============================================================================

@pytest.mark.pbt
@given(
    promo_codes=st.lists(
        st.text(
            alphabet=st.characters(whitelist_categories=("Lu", "Nd")),
            min_size=1,
            max_size=20
        ),
        min_size=2,
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
def test_property_4_default_instruction_on_mismatch(promo_codes, instructions):
    """
    Feature: multiple-promo-codes-delivery, Property 4: Использование инструкции по умолчанию при несоответствии
    
    **Validates: Requirements 1.4, 5.4**
    
    Property: Для любого массива промокодов длиной N и массива инструкций длиной M,
    где N > M, функция combine_promo_data должна использовать DEFAULT_INSTRUCTION
    для промокодов с индексами >= M
    """
    # Фильтруем пустые элементы
    promo_codes = [code.strip() for code in promo_codes if code.strip()]
    instructions = [instr.strip() for instr in instructions if instr.strip()]
    
    # Убеждаемся, что промокодов больше чем инструкций
    assume(len(promo_codes) > len(instructions))
    assume(len(promo_codes) > 0)
    assume(len(instructions) > 0)
    
    # Act: Объединяем данные
    result = PromoCodeParser.combine_promo_data(
        promo_codes=promo_codes,
        instructions=instructions,
        telegram_id=12345
    )
    
    # Assert: Количество элементов должно равняться количеству промокодов
    assert len(result) == len(promo_codes), (
        f"Количество элементов должно равняться количеству промокодов. "
        f"Ожидалось: {len(promo_codes)}, получено: {len(result)}"
    )
    
    # Assert: Первые M элементов должны иметь соответствующие инструкции
    for i in range(len(instructions)):
        assert result[i].instructions == instructions[i], (
            f"Инструкция на позиции {i} должна совпадать с исходной. "
            f"Ожидалось: '{instructions[i]}', получено: '{result[i].instructions}'"
        )
    
    # Assert: Остальные элементы должны иметь инструкцию по умолчанию
    for i in range(len(instructions), len(promo_codes)):
        assert result[i].instructions == PromoCodeParser.DEFAULT_INSTRUCTION, (
            f"Инструкция на позиции {i} должна быть инструкцией по умолчанию. "
            f"Ожидалось: '{PromoCodeParser.DEFAULT_INSTRUCTION}', "
            f"получено: '{result[i].instructions}'"
        )


# ============================================================================
# Property 5: Фильтрация пустых элементов при множественных разделителях
# ============================================================================

@pytest.mark.pbt
@given(
    promo_codes_list=st.lists(
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
def test_property_5_filter_empty_elements_multiple_separators(promo_codes_list):
    """
    Feature: multiple-promo-codes-delivery, Property 5: Фильтрация пустых элементов при множественных разделителях
    
    **Validates: Requirements 5.3**
    
    Property: Для любой строки с множественными последовательными разделителями ~
    (например "CODE1~~CODE2"), парсер должен отфильтровать пустые элементы
    и вернуть только непустые промокоды
    """
    # Фильтруем пустые промокоды
    promo_codes_list = [code.strip() for code in promo_codes_list if code.strip()]
    assume(len(promo_codes_list) > 0)
    
    # Arrange: Объединяем промокоды с двойными разделителями
    double_separator = PromoCodeParser.SEPARATOR + PromoCodeParser.SEPARATOR
    promo_string = double_separator.join(promo_codes_list)
    
    # Act: Парсим строку
    result = PromoCodeParser.parse_promo_codes(promo_string)
    
    # Assert: Количество элементов должно совпадать с исходным (пустые отфильтрованы)
    assert len(result) == len(promo_codes_list), (
        f"Парсер должен отфильтровать пустые элементы при множественных разделителях. "
        f"Ожидалось: {len(promo_codes_list)}, получено: {len(result)}. "
        f"Исходная строка: '{promo_string}'"
    )
    
    # Assert: Все элементы должны быть непустыми
    for i, code in enumerate(result):
        assert code.strip() != "", (
            f"Элемент на позиции {i} не должен быть пустым. "
            f"Получено: '{code}'"
        )


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
    в результате должно совпадать с исходным количеством
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
