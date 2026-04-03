"""
Unit тесты для метода update_delivery_data_by_prize_id в Prize_Repository

Validates: Requirements 3.4, 11.1, 11.2, 11.3
"""
import pytest
import pytest_asyncio
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

from database.repositories.prize_repository import (
    PrizeRepository,
    PrizeNotFoundError,
    DatabaseUnavailableError
)
from database.models.prize import Prize


@pytest.mark.asyncio
class TestUpdateDeliveryDataByPrizeId:
    """Тесты для метода update_delivery_data_by_prize_id"""
    
    async def test_successful_update_all_fields(
        self,
        prize_repository: PrizeRepository,
        create_prize_in_db
    ):
        """
        Тест успешного обновления всех полей данных доставки
        
        Validates: Requirements 1.1, 1.2, 3.2, 3.3
        """
        # Создаём тестовый приз
        prize = await create_prize_in_db(
            telegram_id=123456,
            prize_type="physical",
            code_word="test_word_1"
        )
        
        # Данные доставки
        delivery_data = {
            'last_name': 'Иванов',
            'first_name': 'Иван',
            'patronymic': 'Иванович',
            'country': 'Россия',
            'postal_code': '123456',
            'city': 'Москва',
            'street': 'Ленина',
            'house': '10',
            'apartment': '5',
            'phone': '+79991234567',
            'comment': 'Тестовый комментарий'
        }
        
        # Обновляем данные
        updated_prize = await prize_repository.update_delivery_data_by_prize_id(
            prize.id,
            delivery_data
        )
        
        # Проверяем, что все поля обновлены
        assert updated_prize.last_name == 'Иванов'
        assert updated_prize.first_name == 'Иван'
        assert updated_prize.patronymic == 'Иванович'
        assert updated_prize.country == 'Россия'
        assert updated_prize.postal_code == '123456'
        assert updated_prize.city == 'Москва'
        assert updated_prize.street == 'Ленина'
        assert updated_prize.house == '10'
        assert updated_prize.apartment == '5'
        assert updated_prize.phone == '+79991234567'
        assert updated_prize.comment == 'Тестовый комментарий'
    
    async def test_claimed_at_set_on_first_update(
        self,
        prize_repository: PrizeRepository,
        create_prize_in_db
    ):
        """
        Тест установки claimed_at при первом обновлении
        
        Validates: Requirements 1.3
        """
        # Создаём приз без claimed_at
        prize = await create_prize_in_db(
            telegram_id=123456,
            prize_type="physical",
            code_word="test_word_2",
            claimed_at=None
        )
        
        assert prize.claimed_at is None
        
        # Обновляем данные
        delivery_data = {
            'last_name': 'Петров',
            'first_name': 'Пётр',
            'city': 'Санкт-Петербург',
            'street': 'Невский проспект',
            'house': '1',
            'phone': '+79991234568',
            'country': 'Россия',
            'postal_code': '190000'
        }
        
        before_update = datetime.now(timezone.utc)
        updated_prize = await prize_repository.update_delivery_data_by_prize_id(
            prize.id,
            delivery_data
        )
        after_update = datetime.now(timezone.utc)
        
        # Проверяем, что claimed_at установлен
        assert updated_prize.claimed_at is not None
        assert before_update <= updated_prize.claimed_at <= after_update
    
    async def test_claimed_at_not_overwritten(
        self,
        prize_repository: PrizeRepository,
        create_prize_in_db
    ):
        """
        Тест, что claimed_at не перезаписывается при повторном обновлении
        
        Validates: Requirements 11.1, 11.2
        """
        # Создаём приз с уже установленным claimed_at
        original_claimed_at = datetime.now(timezone.utc) - timedelta(days=1)
        prize = await create_prize_in_db(
            telegram_id=123456,
            prize_type="physical",
            code_word="test_word_3",
            claimed_at=original_claimed_at
        )
        
        # Обновляем данные
        delivery_data = {
            'last_name': 'Сидоров',
            'first_name': 'Сидор',
            'city': 'Казань',
            'street': 'Баумана',
            'house': '20',
            'phone': '+79991234569',
            'country': 'Россия',
            'postal_code': '420000'
        }
        
        updated_prize = await prize_repository.update_delivery_data_by_prize_id(
            prize.id,
            delivery_data
        )
        
        # Проверяем, что claimed_at не изменился
        assert updated_prize.claimed_at == original_claimed_at
    
    async def test_prize_not_found_error(
        self,
        prize_repository: PrizeRepository
    ):
        """
        Тест обработки несуществующего prize_id
        
        Validates: Requirements 3.4
        """
        # Пытаемся обновить несуществующий приз
        delivery_data = {
            'last_name': 'Тестов',
            'first_name': 'Тест',
            'city': 'Тестовый',
            'street': 'Тестовая',
            'house': '1',
            'phone': '+79991234560',
            'country': 'Россия',
            'postal_code': '000000'
        }
        
        with pytest.raises(PrizeNotFoundError) as exc_info:
            await prize_repository.update_delivery_data_by_prize_id(
                999999,  # Несуществующий ID
                delivery_data
            )
        
        assert "не найден" in str(exc_info.value).lower()
    
    async def test_invalid_fields_validation(
        self,
        prize_repository: PrizeRepository,
        create_prize_in_db
    ):
        """
        Тест валидации невалидных полей
        
        Validates: Requirements 3.4
        """
        # Создаём тестовый приз
        prize = await create_prize_in_db(
            telegram_id=123456,
            prize_type="physical",
            code_word="test_word_4"
        )
        
        # Данные с невалидными полями
        delivery_data = {
            'last_name': 'Иванов',
            'invalid_field': 'invalid_value',  # Невалидное поле
            'another_invalid': 'test'  # Ещё одно невалидное поле
        }
        
        with pytest.raises(ValueError) as exc_info:
            await prize_repository.update_delivery_data_by_prize_id(
                prize.id,
                delivery_data
            )
        
        error_message = str(exc_info.value).lower()
        assert "невалидные поля" in error_message or "invalid" in error_message
    
    async def test_idempotency_repeated_updates(
        self,
        prize_repository: PrizeRepository,
        create_prize_in_db
    ):
        """
        Тест идемпотентности (повторные обновления)
        
        Validates: Requirements 11.1, 11.2
        """
        # Создаём тестовый приз
        prize = await create_prize_in_db(
            telegram_id=123456,
            prize_type="physical",
            code_word="test_word_5"
        )
        
        # Данные доставки
        delivery_data = {
            'last_name': 'Константинов',
            'first_name': 'Константин',
            'city': 'Новосибирск',
            'street': 'Красный проспект',
            'house': '1',
            'phone': '+79991234561',
            'country': 'Россия',
            'postal_code': '630000'
        }
        
        # Первое обновление
        first_update = await prize_repository.update_delivery_data_by_prize_id(
            prize.id,
            delivery_data
        )
        
        # Второе обновление с теми же данными
        second_update = await prize_repository.update_delivery_data_by_prize_id(
            prize.id,
            delivery_data
        )
        
        # Проверяем, что данные одинаковые
        assert first_update.last_name == second_update.last_name
        assert first_update.first_name == second_update.first_name
        assert first_update.city == second_update.city
        assert first_update.street == second_update.street
        assert first_update.house == second_update.house
        assert first_update.phone == second_update.phone
        assert first_update.country == second_update.country
        assert first_update.postal_code == second_update.postal_code
        
        # Проверяем, что claimed_at не изменился
        assert first_update.claimed_at == second_update.claimed_at
    
    async def test_updated_at_automatic_update(
        self,
        prize_repository: PrizeRepository,
        create_prize_in_db
    ):
        """
        Тест автоматического обновления updated_at
        
        Validates: Requirements 11.3
        """
        # Создаём тестовый приз
        prize = await create_prize_in_db(
            telegram_id=123456,
            prize_type="physical",
            code_word="test_word_6"
        )
        
        original_updated_at = prize.updated_at
        
        # Ждём немного, чтобы updated_at точно изменился
        import asyncio
        await asyncio.sleep(0.1)
        
        # Обновляем данные
        delivery_data = {
            'last_name': 'Александров',
            'first_name': 'Александр',
            'city': 'Екатеринбург',
            'street': 'Ленина',
            'house': '50',
            'phone': '+79991234562',
            'country': 'Россия',
            'postal_code': '620000'
        }
        
        updated_prize = await prize_repository.update_delivery_data_by_prize_id(
            prize.id,
            delivery_data
        )
        
        # Проверяем, что updated_at обновился
        assert updated_prize.updated_at > original_updated_at
    
    async def test_partial_fields_update(
        self,
        prize_repository: PrizeRepository,
        create_prize_in_db
    ):
        """
        Тест обновления только части полей
        
        Validates: Requirements 1.1, 1.2
        """
        # Создаём тестовый приз
        prize = await create_prize_in_db(
            telegram_id=123456,
            prize_type="physical",
            code_word="test_word_7"
        )
        
        # Обновляем только обязательные поля
        delivery_data = {
            'last_name': 'Минимов',
            'first_name': 'Минимум',
            'city': 'Минск',
            'street': 'Минская',
            'house': '1',
            'phone': '+79991234563',
            'country': 'Беларусь',
            'postal_code': '220000'
        }
        
        updated_prize = await prize_repository.update_delivery_data_by_prize_id(
            prize.id,
            delivery_data
        )
        
        # Проверяем, что обязательные поля обновлены
        assert updated_prize.last_name == 'Минимов'
        assert updated_prize.first_name == 'Минимум'
        assert updated_prize.city == 'Минск'
        assert updated_prize.country == 'Беларусь'
        assert updated_prize.postal_code == '220000'
        
        # Проверяем, что опциональные поля остались None
        assert updated_prize.patronymic is None
        assert updated_prize.apartment is None
        assert updated_prize.comment is None
    
    async def test_optional_fields_update(
        self,
        prize_repository: PrizeRepository,
        create_prize_in_db
    ):
        """
        Тест обновления опциональных полей
        
        Validates: Requirements 1.1, 1.2
        """
        # Создаём тестовый приз
        prize = await create_prize_in_db(
            telegram_id=123456,
            prize_type="physical",
            code_word="test_word_8"
        )
        
        # Обновляем с опциональными полями
        delivery_data = {
            'last_name': 'Полный',
            'first_name': 'Полное',
            'patronymic': 'Полнович',
            'city': 'Полный',
            'street': 'Полная',
            'house': '100',
            'apartment': '100',
            'phone': '+79991234564',
            'comment': 'Полный комментарий',
            'country': 'Россия',
            'postal_code': '100000'
        }
        
        updated_prize = await prize_repository.update_delivery_data_by_prize_id(
            prize.id,
            delivery_data
        )
        
        # Проверяем, что все поля обновлены
        assert updated_prize.patronymic == 'Полнович'
        assert updated_prize.apartment == '100'
        assert updated_prize.comment == 'Полный комментарий'
