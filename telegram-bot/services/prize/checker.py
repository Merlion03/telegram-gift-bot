"""
Проверка приза с двумя источниками данных: PostgreSQL (новый путь) или
Google Sheets (старый путь, выбирается feature flag-ом ``use_postgres``).

Реализован как mixin для :class:`services.prize.service.PrizeService`.
Ожидает атрибуты ``self.prize_repository``, ``self.sheets_service``,
``self.config`` и ``self.update_queue_service`` (через :class:`ClaimMixin`).
"""

import time

from database.repositories.exceptions import DatabaseUnavailableError
from services.prize.types import (
    MissingPromoCodeError,
    PrizeResult,
    PrizeStatus,
)
from utils.logging_config import get_logger

logger = get_logger(__name__)


class CheckerMixin:
    """Методы проверки приза по кодовому слову."""

    async def check_prize(
        self,
        telegram_id: int,
        code_word: str,
    ) -> PrizeResult:
        """
        Проверяет наличие приза для пользователя.

        Args:
            telegram_id: Telegram ID пользователя
            code_word: Кодовое слово розыгрыша

        Returns:
            PrizeResult с информацией о призе

        Raises:
            MissingPromoCodeError: Если для цифрового приза отсутствует промокод
            DatabaseUnavailableError: Если БД недоступна (при ``use_postgres=True``)
        """
        logger.info(
            "checking_prize",
            telegram_id=telegram_id,
            code_word=code_word,
            use_postgres=self.config.sync.use_postgres,
        )

        start_time = time.time()

        if self.config.sync.use_postgres:
            try:
                prize = await self._check_prize_postgres(telegram_id, code_word)

                elapsed_ms = (time.time() - start_time) * 1000
                logger.info(
                    "prize_check_completed_postgres",
                    telegram_id=telegram_id,
                    code_word=code_word,
                    found=prize.status != PrizeStatus.NOT_FOUND,
                    elapsed_ms=round(elapsed_ms, 2),
                )

                if elapsed_ms > 500:
                    logger.warning(
                        "slow_prize_check",
                        telegram_id=telegram_id,
                        code_word=code_word,
                        elapsed_ms=round(elapsed_ms, 2),
                        threshold_ms=500,
                    )

                return prize

            except DatabaseUnavailableError as e:
                logger.error(
                    "database_unavailable_during_prize_check",
                    telegram_id=telegram_id,
                    code_word=code_word,
                    error=str(e),
                )
                raise

        # Старая логика: поиск в Google Sheets
        prize = await self._check_prize_sheets(telegram_id, code_word)

        elapsed_ms = (time.time() - start_time) * 1000
        logger.info(
            "prize_check_completed_sheets",
            telegram_id=telegram_id,
            code_word=code_word,
            found=prize.status != PrizeStatus.NOT_FOUND,
            elapsed_ms=round(elapsed_ms, 2),
        )

        return prize

    async def _check_prize_postgres(
        self,
        telegram_id: int,
        code_word: str,
    ) -> PrizeResult:
        """
        Проверяет приз через PostgreSQL.

        Raises:
            DatabaseUnavailableError: Если БД недоступна
            MissingPromoCodeError: Если для цифрового приза отсутствует промокод
        """
        prize = await self.prize_repository.find_prize(
            telegram_id=telegram_id,
            code_word=code_word,
            timeout_ms=500,
        )

        if not prize:
            logger.info(
                "prize_not_found_postgres",
                telegram_id=telegram_id,
                code_word=code_word,
            )
            return PrizeResult(status=PrizeStatus.NOT_FOUND)

        if prize.is_digital():
            promo_code = prize.promo_code
            instructions = prize.instructions

            if not promo_code:
                logger.error(
                    "missing_promo_code_postgres",
                    telegram_id=telegram_id,
                    code_word=code_word,
                    prize_id=prize.id,
                )
                raise MissingPromoCodeError(
                    f"Промокод отсутствует для пользователя {telegram_id}"
                )

            logger.info(
                "promo_code_retrieved_from_db",
                telegram_id=telegram_id,
                prize_id=prize.id,
                has_promo_code=True,
            )

            if prize.claimed_at is None:
                await self._mark_prize_claimed_async(
                    telegram_id=telegram_id,
                    code_word=code_word,
                    row_id=prize.row_id,
                    sheet_name=prize.sheet_name,
                )
                logger.info(
                    "prize_marked_as_claimed",
                    telegram_id=telegram_id,
                    code_word=code_word,
                    prize_id=prize.id,
                )
            else:
                logger.info(
                    "prize_already_claimed_idempotent_return",
                    telegram_id=telegram_id,
                    code_word=code_word,
                    prize_id=prize.id,
                    claimed_at=prize.claimed_at,
                )

            logger.info(
                "digital_prize_found_postgres",
                telegram_id=telegram_id,
                code_word=code_word,
                prize_id=prize.id,
                has_promo_code=bool(promo_code),
            )

            return PrizeResult(
                status=PrizeStatus.DIGITAL,
                promo_code=promo_code,
                instructions=instructions or "Используйте промокод при оформлении заказа",
            )

        if prize.is_physical():
            # Для физического приза claimed_at устанавливается после заполнения
            # формы доставки в handle_delivery_data().
            logger.info(
                "physical_prize_found_postgres",
                telegram_id=telegram_id,
                code_word=code_word,
                prize_id=prize.id,
                row_id=prize.row_id,
            )

            return PrizeResult(
                status=PrizeStatus.PHYSICAL,
                row_id=prize.row_id,
                prize_id=prize.id,
            )

        logger.warning(
            "unknown_prize_type_postgres",
            telegram_id=telegram_id,
            code_word=code_word,
            prize_type=prize.prize_type,
            prize_id=prize.id,
        )
        return PrizeResult(status=PrizeStatus.NOT_FOUND)

    async def _check_prize_sheets(
        self,
        telegram_id: int,
        code_word: str,
    ) -> PrizeResult:
        """
        Проверяет приз через Google Sheets (старая логика).

        Raises:
            MissingPromoCodeError: Если для цифрового приза отсутствует промокод
        """
        prize_data = await self.sheets_service.find_winner(telegram_id, code_word)

        if not prize_data:
            logger.info(
                "prize_not_found",
                telegram_id=telegram_id,
                code_word=code_word,
            )
            return PrizeResult(status=PrizeStatus.NOT_FOUND)

        prize_type = prize_data.get('prize_type')

        if prize_type == 'digital':
            promo_code = prize_data.get('promo_code')
            instructions = prize_data.get('instructions')

            if not promo_code:
                logger.error(
                    "missing_promo_code",
                    telegram_id=telegram_id,
                    code_word=code_word,
                    row_id=prize_data.get('row_id'),
                )
                raise MissingPromoCodeError(
                    f"Промокод отсутствует для пользователя {telegram_id}"
                )

            logger.info(
                "promo_code_retrieved_from_sheets",
                telegram_id=telegram_id,
                row_id=prize_data.get('row_id'),
                has_promo_code=True,
            )

            # Проверяем, не получен ли уже приз (через PostgreSQL).
            # Нужно для идемпотентности при использовании Google Sheets режима.
            try:
                prize_in_db = await self.prize_repository.find_prize(
                    telegram_id=telegram_id,
                    code_word=code_word,
                    timeout_ms=500,
                )

                if prize_in_db and prize_in_db.claimed_at is None:
                    await self._mark_prize_claimed_async(
                        telegram_id=telegram_id,
                        code_word=code_word,
                        row_id=prize_data.get('row_id'),
                        sheet_name=code_word,
                    )
                    logger.info(
                        "prize_marked_as_claimed_sheets",
                        telegram_id=telegram_id,
                        code_word=code_word,
                        row_id=prize_data.get('row_id'),
                    )
                elif prize_in_db and prize_in_db.claimed_at is not None:
                    logger.info(
                        "prize_already_claimed_idempotent_return_sheets",
                        telegram_id=telegram_id,
                        code_word=code_word,
                        row_id=prize_data.get('row_id'),
                        claimed_at=prize_in_db.claimed_at,
                    )
                else:
                    # Приз не найден в БД, но есть в Sheets — нормально при
                    # первой синхронизации.
                    await self._mark_prize_claimed_async(
                        telegram_id=telegram_id,
                        code_word=code_word,
                        row_id=prize_data.get('row_id'),
                        sheet_name=code_word,
                    )
                    logger.info(
                        "prize_marked_as_claimed_sheets_first_sync",
                        telegram_id=telegram_id,
                        code_word=code_word,
                        row_id=prize_data.get('row_id'),
                    )
            except Exception as e:
                # Если не удалось проверить БД, всё равно отмечаем приз как
                # полученный (fallback для обратной совместимости).
                logger.warning(
                    "failed_to_check_claimed_status_fallback_to_mark",
                    telegram_id=telegram_id,
                    code_word=code_word,
                    error=str(e),
                )
                await self._mark_prize_claimed_async(
                    telegram_id=telegram_id,
                    code_word=code_word,
                    row_id=prize_data.get('row_id'),
                    sheet_name=code_word,
                )

            logger.info(
                "digital_prize_found",
                telegram_id=telegram_id,
                code_word=code_word,
                has_promo_code=bool(promo_code),
            )

            return PrizeResult(
                status=PrizeStatus.DIGITAL,
                promo_code=promo_code,
                instructions=instructions or "Используйте промокод при оформлении заказа",
            )

        if prize_type == 'physical':
            logger.info(
                "physical_prize_found",
                telegram_id=telegram_id,
                code_word=code_word,
                row_id=prize_data.get('row_id'),
            )

            return PrizeResult(
                status=PrizeStatus.PHYSICAL,
                row_id=prize_data.get('row_id'),
                prize_id=prize_data.get('row_id'),
            )

        logger.warning(
            "unknown_prize_type",
            telegram_id=telegram_id,
            code_word=code_word,
            prize_type=prize_type,
        )
        return PrizeResult(status=PrizeStatus.NOT_FOUND)
