"""
Валидация данных пользователя и принадлежности приза.

Реализован как mixin для :class:`services.prize.service.PrizeService`.
Ожидает, что наследник предоставит ``self.prize_repository``.
"""

from database.repositories.exceptions import DatabaseUnavailableError
from utils.logging_config import get_logger

logger = get_logger(__name__)


class ValidationMixin:
    """Методы валидации пользователя, кодового слова и принадлежности приза."""

    async def check_user_exists(self, telegram_id: int) -> bool:
        """
        Проверяет наличие пользователя в таблице призов независимо от статуса
        получения приза (claimed_at).

        Validates: Requirements 2.1, 2.2

        Args:
            telegram_id: Telegram ID пользователя

        Returns:
            True если пользователь найден, False иначе

        Raises:
            DatabaseUnavailableError: Если БД недоступна
        """
        logger.info("checking_user_exists", telegram_id=telegram_id)

        try:
            user_exists = await self.prize_repository.check_user_exists(telegram_id)

            logger.info(
                "user_exists_check_completed",
                telegram_id=telegram_id,
                exists=user_exists,
            )

            return user_exists

        except DatabaseUnavailableError as e:
            logger.error(
                "database_unavailable_during_user_check",
                telegram_id=telegram_id,
                error=str(e),
            )
            raise

    async def validate_code_word(self, telegram_id: int, code_word: str) -> bool:
        """
        Проверяет корректность кодового слова для пользователя.

        Validates: Requirements 5.3, 12.4

        Args:
            telegram_id: Telegram ID пользователя
            code_word: Кодовое слово для проверки

        Returns:
            True если кодовое слово верно, False иначе

        Raises:
            DatabaseUnavailableError: Если БД недоступна
        """
        logger.info(
            "validating_code_word",
            telegram_id=telegram_id,
            code_word=code_word,
        )

        # Валидация входных данных
        if not code_word or len(code_word.strip()) == 0:
            logger.warning("empty_code_word", telegram_id=telegram_id)
            return False

        if len(code_word) > 100:
            logger.warning(
                "code_word_too_long",
                telegram_id=telegram_id,
                length=len(code_word),
            )
            return False

        try:
            prize = await self.prize_repository.find_prize(
                telegram_id=telegram_id,
                code_word=code_word,
                timeout_ms=500,
            )

            is_valid = prize is not None

            logger.info(
                "code_word_validation_completed",
                telegram_id=telegram_id,
                code_word=code_word,
                is_valid=is_valid,
            )

            return is_valid

        except DatabaseUnavailableError as e:
            logger.error(
                "database_unavailable_during_code_word_validation",
                telegram_id=telegram_id,
                code_word=code_word,
                error=str(e),
            )
            raise

    async def validate_prize_id(
        self,
        prize_id: int,
        telegram_id: int,
    ) -> bool:
        """
        Проверяет, что ``prize_id`` принадлежит указанному пользователю.

        Validates: Security Requirement 2

        Args:
            prize_id: ID приза для проверки
            telegram_id: Telegram ID пользователя

        Returns:
            True если приз принадлежит пользователю, False иначе

        Raises:
            DatabaseUnavailableError: Если БД недоступна
        """
        logger.info(
            "validating_prize_id",
            prize_id=prize_id,
            telegram_id=telegram_id,
        )

        try:
            is_valid = await self.prize_repository.validate_prize_ownership(
                prize_id=prize_id,
                telegram_id=telegram_id,
            )

            logger.info(
                "prize_id_validation_completed",
                prize_id=prize_id,
                telegram_id=telegram_id,
                is_valid=is_valid,
            )

            if not is_valid:
                logger.warning(
                    "invalid_prize_id_access_attempt",
                    prize_id=prize_id,
                    telegram_id=telegram_id,
                )

            return is_valid

        except DatabaseUnavailableError as e:
            logger.error(
                "database_unavailable_during_prize_id_validation",
                prize_id=prize_id,
                telegram_id=telegram_id,
                error=str(e),
            )
            raise

    async def check_delivery_data_filled(
        self,
        telegram_id: int,
        code_word: str,
    ) -> bool:
        """
        Проверяет, заполнил ли пользователь данные доставки для физического
        приза (по наличию ``claimed_at``).

        Args:
            telegram_id: Telegram ID пользователя
            code_word: Кодовое слово

        Returns:
            True если данные доставки заполнены (claimed_at установлен),
            False иначе.

        Raises:
            DatabaseUnavailableError: Если БД недоступна
        """
        try:
            prize = await self.prize_repository.find_prize(
                telegram_id=telegram_id,
                code_word=code_word,
                timeout_ms=500,
            )

            if not prize:
                return False

            is_filled = prize.claimed_at is not None

            logger.info(
                "delivery_data_filled_check",
                telegram_id=telegram_id,
                code_word=code_word,
                is_filled=is_filled,
                claimed_at=prize.claimed_at.isoformat() if prize.claimed_at else None,
            )

            return is_filled

        except DatabaseUnavailableError:
            logger.error(
                "database_unavailable_during_delivery_check",
                telegram_id=telegram_id,
                code_word=code_word,
            )
            raise
