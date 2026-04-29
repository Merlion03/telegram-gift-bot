"""
GDPR-консенс: проверка и сохранение.

Реализован как mixin для :class:`services.prize.service.PrizeService`.
Ожидает, что наследник предоставит атрибут ``self.gdpr_consent_repository``.
"""

from datetime import datetime, timezone

from database.repositories.exceptions import DatabaseUnavailableError
from utils.logging_config import get_logger

logger = get_logger(__name__)


class ConsentMixin:
    """Методы работы с GDPR-согласиями пользователя."""

    async def check_gdpr_consent(self, telegram_id: int) -> bool:
        """
        Проверяет наличие GDPR согласия у пользователя.

        Validates: Requirements 3.1

        Args:
            telegram_id: Telegram ID пользователя

        Returns:
            True если согласие дано, False иначе

        Raises:
            DatabaseUnavailableError: Если БД недоступна
        """
        logger.info("checking_gdpr_consent", telegram_id=telegram_id)

        try:
            has_consent = await self.gdpr_consent_repository.check_consent_exists(telegram_id)

            logger.info(
                "gdpr_consent_check_completed",
                telegram_id=telegram_id,
                has_consent=has_consent,
            )

            return has_consent

        except DatabaseUnavailableError as e:
            logger.error(
                "database_unavailable_during_gdpr_check",
                telegram_id=telegram_id,
                error=str(e),
            )
            raise

    async def save_gdpr_consent(self, telegram_id: int) -> None:
        """
        Сохраняет GDPR согласие пользователя с текущим timestamp.

        Validates: Requirements 3.3, 12.1, 12.5

        Args:
            telegram_id: Telegram ID пользователя

        Raises:
            DatabaseUnavailableError: Если БД недоступна
        """
        consent_date = datetime.now(timezone.utc)

        logger.info(
            "saving_gdpr_consent",
            telegram_id=telegram_id,
            consent_date=consent_date.isoformat(),
        )

        try:
            await self.gdpr_consent_repository.save_consent(telegram_id, consent_date)

            logger.info(
                "gdpr_consent_saved",
                telegram_id=telegram_id,
                consent_date=consent_date.isoformat(),
            )

        except DatabaseUnavailableError as e:
            logger.error(
                "database_unavailable_during_gdpr_save",
                telegram_id=telegram_id,
                consent_date=consent_date.isoformat(),
                error=str(e),
            )
            raise
