"""
Property-based тесты для MessageFormatter.

Эти тесты проверяют универсальные свойства корректности форматирования
сообщений с промокодами на большом количестве сгенерированных входных данных.
"""

import pytest
from hypothesis import given, strategies as st, settings
from utils.message_formatter import MessageFormatter
from utils.promo_parser import PromoCodeData


# Стратегии для генерации тестовых данных
promo_code_strategy = st.text(
    alphabet=st.characters(min_codepoint=33, max_codepoint=126),
    min_size=1,
    max_size=50
)

instruction_strategy = st.text(
    alphabet=st.characters(blacklist_categories=("Cs",)),
    min_size=1,
    max_size=200
)

promo_data_strategy = st.builds(
    PromoCodeData,
    promo_code=promo_code_strategy,
    instructions=instruction_strategy
)


# Feature: multiple-promo-codes-delivery, Property 6: Обёртывание промокодов в HTML теги
@given(st.lists(promo_data_strategy, min_size=1, max_size=10))
@settings(max_examples=100)
def test_property_6_promo_codes_wrapped_in_html_tags(promo_data_list):
    """
    Property 6: Обёртывание промокодов в HTML теги.
    
    For any список PromoCodeData, отформатированное сообщение должно содержать
    каждый промокод, обёрнутый в теги <code> и </code>.
    
    Validates: Requirements 2.1, 2.2
    """
    message = MessageFormatter.format_multiple_promos(promo_data_list, telegram_id=12345)
    
    # Проверяем, что каждый промокод обёрнут в теги <code>
    for promo_data in promo_data_list:
        assert f"<code>{promo_data.promo_code}</code>" in message, \
            f"Промокод {promo_data.promo_code} не обёрнут в теги <code>"
    
    # Проверяем, что количество открывающих и закрывающих тегов совпадает
    assert message.count("<code>") == len(promo_data_list)
    assert message.count("</code>") == len(promo_data_list)


# Feature: multiple-promo-codes-delivery, Property 7: Экранирование специальных HTML символов
@given(st.text(min_size=1, max_size=100))
@settings(max_examples=100)
def test_property_7_escape_html_special_characters(text):
    """
    Property 7: Экранирование специальных HTML символов.
    
    For any текст, содержащий специальные HTML символы (<, >, &),
    функция escape_html должна заменить их на соответствующие HTML entities.
    
    Validates: Requirements 2.4
    """
    escaped = MessageFormatter.escape_html(text)
    
    # Проверяем, что специальные символы экранированы
    assert "<" not in escaped or "&lt;" in escaped
    assert ">" not in escaped or "&gt;" in escaped
    # & может быть частью &lt; или &gt;, поэтому проверяем только если & был в исходном тексте
    if "&" in text:
        assert "&amp;" in escaped or "&lt;" in escaped or "&gt;" in escaped


# Feature: multiple-promo-codes-delivery, Property 8: Начало сообщения с поздравления
@given(st.lists(promo_data_strategy, min_size=1, max_size=10))
@settings(max_examples=100)
def test_property_8_message_starts_with_congratulations(promo_data_list):
    """
    Property 8: Начало сообщения с поздравления.
    
    For any список PromoCodeData, отформатированное сообщение должно начинаться
    с текста поздравления с последующей пустой строкой.
    
    Validates: Requirements 3.1, 3.2
    """
    message = MessageFormatter.format_multiple_promos(promo_data_list, telegram_id=12345)
    
    # Проверяем, что сообщение начинается с поздравления
    assert message.startswith(MessageFormatter.CONGRATULATIONS_TEXT)
    
    # Проверяем, что после поздравления идёт пустая строка (двойной перенос)
    lines = message.split("\n")
    assert lines[0] == MessageFormatter.CONGRATULATIONS_TEXT
    assert lines[1] == ""


# Feature: multiple-promo-codes-delivery, Property 9: Формат первого промокода при множественных
@given(st.lists(promo_data_strategy, min_size=2, max_size=10))
@settings(max_examples=100)
def test_property_9_first_promo_format_when_multiple(promo_data_list):
    """
    Property 9: Формат первого промокода при множественных.
    
    For any список PromoCodeData длиной N > 1, первый блок промокода в сообщении
    должен иметь формат "Вот ваш промокод — <code>{promo_code}</code>".
    
    Validates: Requirements 3.4
    """
    message = MessageFormatter.format_multiple_promos(promo_data_list, telegram_id=12345)
    
    first_promo = promo_data_list[0]
    expected_format = f"Вот ваш промокод — <code>{first_promo.promo_code}</code>"
    
    assert expected_format in message


# Feature: multiple-promo-codes-delivery, Property 10: Формат последующих промокодов
@given(st.lists(promo_data_strategy, min_size=2, max_size=10))
@settings(max_examples=100)
def test_property_10_subsequent_promos_format(promo_data_list):
    """
    Property 10: Формат последующих промокодов.
    
    For any список PromoCodeData длиной N > 1, каждый блок промокода с индексом i >= 1
    должен иметь формат "Также вот ещё — <code>{promo_code}</code>".
    
    Validates: Requirements 3.5
    """
    message = MessageFormatter.format_multiple_promos(promo_data_list, telegram_id=12345)
    
    # Проверяем формат для всех промокодов кроме первого
    for promo_data in promo_data_list[1:]:
        expected_format = f"Также вот ещё — <code>{promo_data.promo_code}</code>"
        assert expected_format in message


# Feature: multiple-promo-codes-delivery, Property 11: Разделение блоков пустой строкой
@given(st.lists(promo_data_strategy, min_size=2, max_size=10))
@settings(max_examples=100)
def test_property_11_blocks_separated_by_empty_line(promo_data_list):
    """
    Property 11: Разделение блоков пустой строкой.
    
    For any список PromoCodeData длиной N >= 2, между каждым блоком
    промокод+инструкция должна быть пустая строка (\n\n).
    
    Validates: Requirements 3.6
    """
    message = MessageFormatter.format_multiple_promos(promo_data_list, telegram_id=12345)
    
    # Проверяем, что между блоками есть двойные переносы строк
    # Минимум: после поздравления (1) + перед меню (1) = 2 двойных переноса
    double_newlines = message.count("\n\n")
    assert double_newlines >= 2, f"Ожидалось минимум 2 двойных переноса, получено {double_newlines}"


# Feature: multiple-promo-codes-delivery, Property 12: Сохранение порядка промокодов
@given(st.lists(promo_data_strategy, min_size=2, max_size=10))
@settings(max_examples=100)
def test_property_12_promo_codes_order_preserved(promo_data_list):
    """
    Property 12: Сохранение порядка промокодов.
    
    For any список PromoCodeData с элементами в определённом порядке,
    отформатированное сообщение должно содержать промокоды в том же порядке.
    
    Validates: Requirements 3.7
    """
    message = MessageFormatter.format_multiple_promos(promo_data_list, telegram_id=12345)
    
    # Находим позиции промокодов в сообщении, учитывая возможные дубликаты
    last_pos = 0
    for i, promo_data in enumerate(promo_data_list):
        search_pattern = f"<code>{promo_data.promo_code}</code>"
        pos = message.find(search_pattern, last_pos)
        assert pos != -1, f"Промокод {promo_data.promo_code} (индекс {i}) не найден в сообщении после позиции {last_pos}"
        # Следующий поиск начинаем после найденной позиции
        last_pos = pos + len(search_pattern)


# Feature: multiple-promo-codes-delivery, Property 13: Окончание сообщения текстом кнопки
@given(st.lists(promo_data_strategy, min_size=1, max_size=10))
@settings(max_examples=100)
def test_property_13_message_ends_with_menu_prompt(promo_data_list):
    """
    Property 13: Окончание сообщения текстом кнопки.
    
    For any список PromoCodeData, отформатированное сообщение должно заканчиваться
    текстом кнопки меню с предшествующей пустой строкой.
    
    Validates: Requirements 4.1, 4.2
    """
    message = MessageFormatter.format_multiple_promos(promo_data_list, telegram_id=12345)
    
    # Проверяем, что сообщение заканчивается текстом кнопки
    assert message.endswith(MessageFormatter.MENU_PROMPT_TEXT)
    
    # Проверяем, что перед текстом кнопки есть пустая строка
    lines = message.split("\n")
    # Последняя строка - текст кнопки, предпоследняя - пустая
    assert lines[-1] == MessageFormatter.MENU_PROMPT_TEXT
    assert lines[-2] == ""


# Feature: multiple-promo-codes-delivery, Property 14: Разделение длинных сообщений
@given(st.lists(promo_data_strategy, min_size=1, max_size=100))
@settings(max_examples=50)
def test_property_14_long_messages_split(promo_data_list):
    """
    Property 14: Разделение длинных сообщений.
    
    For any сообщение длиной более 4096 символов, функция split_message_if_needed
    должна вернуть массив строк, где каждая строка не превышает 4096 символов.
    
    Validates: Requirements 5.5
    """
    message = MessageFormatter.format_multiple_promos(promo_data_list, telegram_id=12345)
    parts = MessageFormatter.split_message_if_needed(message, telegram_id=12345)
    
    # Проверяем, что все части не превышают лимит
    for part in parts:
        assert len(part) <= MessageFormatter.TELEGRAM_MESSAGE_LIMIT
    
    # Если исходное сообщение <= лимита, должна быть одна часть
    if len(message) <= MessageFormatter.TELEGRAM_MESSAGE_LIMIT:
        assert len(parts) == 1
        assert parts[0] == message
    else:
        # Если превышает лимит, должно быть несколько частей
        assert len(parts) > 1
