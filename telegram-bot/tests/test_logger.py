"""
Тесты для модуля логирования с фильтрацией секретных данных.

Property 30: Отсутствие секретов в логах
Feature: telegram-bot-webapp-system, Property 30
Validates: Requirements 13.5
"""

import json
import pytest
from hypothesis import given, strategies as st
from io import StringIO
from contextlib import contextmanager
import structlog

from utils.logger import configure_logging, get_logger, filter_secrets, SECRET_KEYS


@contextmanager
def capture_logs():
    """Context manager для перехвата логов в строку"""
    output = StringIO()
    
    # Настраиваем логирование с JSON форматом в StringIO
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt='iso'),
            filter_secrets,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(0),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=output),
        cache_logger_on_first_use=False,
    )
    
    try:
        yield output
    finally:
        # Очистка после теста
        output.close()


# Стратегии для генерации секретных данных
secret_values = st.one_of(
    st.text(min_size=20, max_size=100, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'))),
    st.from_regex(r'[A-Za-z0-9]{30,50}', fullmatch=True),  # Токены
    st.from_regex(r'sk-[A-Za-z0-9]{40}', fullmatch=True),  # API ключи
)

secret_keys = st.sampled_from(list(SECRET_KEYS))

# Стратегия для несекретных ключей (не содержат секретные слова)
def is_not_secret_key(key: str) -> bool:
    """Проверяет, что ключ не содержит секретных слов"""
    key_lower = key.lower()
    return not any(secret_word in key_lower for secret_word in SECRET_KEYS)

non_secret_keys = st.text(
    min_size=1, 
    max_size=20, 
    alphabet=st.characters(whitelist_categories=('Lu', 'Ll'))
).filter(is_not_secret_key)


@given(
    secret_key=secret_keys,
    secret_value=secret_values,
    additional_data=st.dictionaries(
        keys=non_secret_keys,
        values=st.one_of(st.integers(), st.text(max_size=15), st.booleans()),
        max_size=5
    )
)
def test_property_30_no_secrets_in_logs(secret_key, secret_value, additional_data):
    """
    Property 30: Отсутствие секретов в логах
    
    Для любого лог-сообщения, содержащего секретные данные (токены, пароли, API ключи),
    в выходном логе секретные значения должны быть заменены на '***FILTERED***'.
    
    Feature: telegram-bot-webapp-system, Property 30
    Validates: Requirements 13.5
    """
    # Arrange: создаём логгер и данные с секретом
    with capture_logs() as output:
        logger = get_logger('test')
        log_data = {secret_key: secret_value, **additional_data}
        
        # Act: логируем данные с секретом
        logger.info('test_event', **log_data)
        
        # Assert: проверяем, что секрет отфильтрован
        log_output = output.getvalue()
        
        # Парсим JSON лог
        log_lines = [line for line in log_output.strip().split('\n') if line]
        assert len(log_lines) > 0, "Лог должен содержать хотя бы одну строку"
        
        log_entry = json.loads(log_lines[-1])
        
        # Проверяем, что секретный ключ заменён на FILTERED
        assert log_entry.get(secret_key) == '***FILTERED***', \
            f"Секретный ключ '{secret_key}' должен быть заменён на '***FILTERED***'"
        
        # Проверяем, что секретное значение не присутствует как отдельное значение в других полях
        for key, value in log_entry.items():
            if key != secret_key and value == secret_value:
                assert False, \
                    f"Секретное значение не должно присутствовать в поле '{key}'"


@given(
    nested_secret=st.dictionaries(
        keys=secret_keys,
        values=secret_values,
        min_size=1,
        max_size=3
    ),
    outer_key=non_secret_keys
)
def test_property_30_nested_secrets_filtered(nested_secret, outer_key):
    """
    Property 30: Отсутствие секретов в логах (вложенные словари)
    
    Для любого лог-сообщения с вложенными словарями, содержащими секретные данные,
    все секреты должны быть отфильтрованы на всех уровнях вложенности.
    
    Feature: telegram-bot-webapp-system, Property 30
    Validates: Requirements 13.5
    """
    # Arrange: создаём вложенную структуру с секретами
    with capture_logs() as output:
        logger = get_logger('test')
        log_data = {outer_key: nested_secret}
        
        # Act: логируем вложенные данные
        logger.info('nested_test', **log_data)
        
        # Assert: проверяем фильтрацию вложенных секретов
        log_output = output.getvalue()
        
        # Проверяем, что ни один секрет не попал в лог
        for secret_value in nested_secret.values():
            assert secret_value not in log_output, \
                f"Вложенное секретное значение '{secret_value}' не должно присутствовать в логе"
        
        # Парсим и проверяем структуру
        log_lines = [line for line in log_output.strip().split('\n') if line]
        log_entry = json.loads(log_lines[-1])
        
        nested_data = log_entry.get(outer_key, {})
        for secret_key in nested_secret.keys():
            assert nested_data.get(secret_key) == '***FILTERED***', \
                f"Вложенный секретный ключ '{secret_key}' должен быть отфильтрован"


def test_token_like_strings_filtered():
    """
    Unit-тест: строки, похожие на токены, должны фильтроваться
    
    Validates: Requirements 13.5
    """
    # Arrange: создаём данные с токеноподобными строками
    with capture_logs() as output:
        logger = get_logger('test')
        
        token_like = "AbCdEf123456789012345678901234567890"  # Длинная строка с буквами и цифрами
        normal_text = "Это обычный текст с пробелами"
        
        # Act
        logger.info('test', custom_field=token_like, message=normal_text)
        
        # Assert
        log_output = output.getvalue()
        log_lines = [line for line in log_output.strip().split('\n') if line]
        log_entry = json.loads(log_lines[-1])
        
        # Токеноподобная строка должна быть отфильтрована
        assert token_like not in log_output, "Токеноподобная строка должна быть отфильтрована"
        assert log_entry.get('custom_field') == '***FILTERED***', \
            "Токеноподобное поле должно быть отфильтровано"
        
        # Обычный текст должен остаться (проверяем в декодированном JSON)
        assert log_entry.get('message') == normal_text, \
            "Обычный текст не должен фильтроваться"


def test_short_strings_not_filtered():
    """
    Unit-тест: короткие строки не должны фильтроваться как токены
    
    Validates: Requirements 13.5
    """
    # Arrange
    with capture_logs() as output:
        logger = get_logger('test')
        short_value = "abc123"  # Короткая строка
        
        # Act
        logger.info('test', code=short_value)
        
        # Assert
        log_output = output.getvalue()
        log_lines = [line for line in log_output.strip().split('\n') if line]
        log_entry = json.loads(log_lines[-1])
        
        # Короткая строка не должна фильтроваться
        assert log_entry.get('code') == short_value, \
            "Короткие строки не должны фильтроваться как токены"


def test_multiple_secret_keys_filtered():
    """
    Unit-тест: несколько секретных ключей в одном сообщении
    
    Validates: Requirements 13.5
    """
    # Arrange
    with capture_logs() as output:
        logger = get_logger('test')
        
        # Act: логируем несколько секретов одновременно
        logger.info(
            'multiple_secrets',
            token='secret_token_123',
            api_key='api_key_456',
            password='password_789',
            user_id=12345  # Несекретное поле
        )
        
        # Assert
        log_output = output.getvalue()
        log_lines = [line for line in log_output.strip().split('\n') if line]
        log_entry = json.loads(log_lines[-1])
        
        # Все секреты должны быть отфильтрованы
        assert log_entry.get('token') == '***FILTERED***'
        assert log_entry.get('api_key') == '***FILTERED***'
        assert log_entry.get('password') == '***FILTERED***'
        
        # Несекретное поле должно остаться
        assert log_entry.get('user_id') == 12345
        
        # Секретные значения не должны быть в выводе
        assert 'secret_token_123' not in log_output
        assert 'api_key_456' not in log_output
        assert 'password_789' not in log_output


def test_case_insensitive_secret_keys():
    """
    Unit-тест: секретные ключи должны фильтроваться независимо от регистра
    
    Validates: Requirements 13.5
    """
    # Arrange
    with capture_logs() as output:
        logger = get_logger('test')
        
        # Act: используем разные варианты регистра
        logger.info(
            'case_test',
            TOKEN='secret1',
            Api_Key='secret2',
            PASSWORD='secret3',
            BoT_ToKeN='secret4'
        )
        
        # Assert
        log_output = output.getvalue()
        log_lines = [line for line in log_output.strip().split('\n') if line]
        log_entry = json.loads(log_lines[-1])
        
        # Все варианты должны быть отфильтрованы
        assert log_entry.get('TOKEN') == '***FILTERED***'
        assert log_entry.get('Api_Key') == '***FILTERED***'
        assert log_entry.get('PASSWORD') == '***FILTERED***'
        assert log_entry.get('BoT_ToKeN') == '***FILTERED***'
