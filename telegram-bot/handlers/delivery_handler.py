"""
Обработчик данных доставки из WebApp.
Принимает данные доставки физических призов и сохраняет их в Google Sheets и PostgreSQL.
"""

import json
from typing import Optional
from aiogram import Router
from aiogram.types import Message

from services.google_sheets_service import GoogleSheetsService
from database.repositories.prize_repository import PrizeRepository
from database.connection import get_database
from utils.retry import retry_with_backoff
from utils.logging_config import get_logger

logger = get_logger(__name__)

# Создаём router для обработчиков доставки
router = Router()


class DeliveryHandler:
    """Обработчик данных доставки из WebApp"""
    
    def __init__(
        self,
        sheets_service: GoogleSheetsService,
        prize_repository: PrizeRepository,
        session_manager=None
    ):
        """
        Инициализирует обработчик данных доставки
        
        Args:
            sheets_service: Сервис для работы с Google Sheets
            prize_repository: Repository для работы с призами
            session_manager: Менеджер сессий для сохранения ответов бота (опционально)
        """
        self.sheets_service = sheets_service
        self.prize_repository = prize_repository
        self.session_manager = session_manager
        
        logger.info("delivery_handler_initialized")
    
    async def handle_delivery_data(
        self,
        message: Message,
        session_id: Optional[int] = None
    ) -> None:
        """
        Обрабатывает данные доставки из WebApp
        
        Args:
            message: Сообщение с web_app_data
            session_id: ID сессии из middleware (опционально)
        """
        telegram_id = message.from_user.id
        
        # Проверяем наличие web_app_data
        if not message.web_app_data:
            logger.warning(
                "no_web_app_data",
                telegram_id=telegram_id
            )
            return
        
        try:
            # Парсим JSON данные из WebApp
            data = json.loads(message.web_app_data.data)
            
            logger.info(
                "received_delivery_data",
                telegram_id=telegram_id,
                prize_id=data.get('prize_id')
            )
            
            # Извлекаем prize_id и данные доставки
            prize_id = data.get('prize_id')
            if not prize_id:
                logger.error(
                    "missing_prize_id",
                    telegram_id=telegram_id
                )
                await self._send_error_message(
                    message,
                    "Ошибка: отсутствует идентификатор приза",
                    session_id
                )
                return
            
            # Получаем приз из БД по prize_id (row_id)
            prize = await self._find_prize_by_id(telegram_id, prize_id)
            
            if not prize:
                logger.error(
                    "prize_not_found_for_delivery",
                    telegram_id=telegram_id,
                    prize_id=prize_id
                )
                await self._send_error_message(
                    message,
                    "Ошибка: приз не найден",
                    session_id
                )
                return
            
            # Подготавливаем данные доставки
            delivery_data = {
                'last_name': data.get('last_name', ''),
                'first_name': data.get('first_name', ''),
                'patronymic': data.get('patronymic', ''),
                'city': data.get('city', ''),
                'street': data.get('street', ''),
                'house': data.get('house', ''),
                'apartment': data.get('apartment', ''),
                'phone': data.get('phone', ''),
                'comment': data.get('comment', '')
            }
            
            # Сохраняем данные в Google Sheets с retry логикой
            sheets_success = await self._save_to_sheets(
                prize.row_id,
                prize.sheet_name,
                delivery_data
            )
            
            if not sheets_success:
                # Критическая ошибка - не удалось записать в Sheets
                logger.error(
                    "failed_to_save_delivery_to_sheets",
                    telegram_id=telegram_id,
                    prize_id=prize_id,
                    row_id=prize.row_id,
                    sheet_name=prize.sheet_name
                )
                await self._send_error_message(
                    message,
                    "Произошла техническая ошибка при сохранении данных. Пожалуйста, обратитесь в поддержку.",
                    session_id
                )
                return
            
            # Обновляем данные в PostgreSQL
            postgres_success = await self._save_to_postgres(
                telegram_id,
                prize.code_word,
                delivery_data
            )
            
            if not postgres_success:
                # Логируем предупреждение, но не блокируем пользователя
                # Данные уже сохранены в Sheets, синхронизация подхватит их позже
                logger.warning(
                    "failed_to_save_delivery_to_postgres",
                    telegram_id=telegram_id,
                    code_word=prize.code_word
                )
            
            # Отправляем подтверждение пользователю
            success_text = (
                "✅ Спасибо! Ваши данные успешно сохранены.\n"
                "Мы свяжемся с вами для уточнения деталей доставки."
            )
            await message.answer(success_text)
            
            # Сохраняем ответ бота
            if self.session_manager and session_id:
                try:
                    await self.session_manager.save_bot_message(
                        session_id=session_id,
                        message_text=success_text
                    )
                except Exception as e:
                    logger.error(
                        "failed_to_save_bot_response",
                        session_id=session_id,
                        error=str(e)
                    )
            
            logger.info(
                "delivery_data_saved_successfully",
                telegram_id=telegram_id,
                prize_id=prize_id,
                sheets_success=sheets_success,
                postgres_success=postgres_success
            )
        
        except json.JSONDecodeError as e:
            logger.error(
                "invalid_json_from_webapp",
                telegram_id=telegram_id,
                error=str(e)
            )
            await self._send_error_message(
                message,
                "Ошибка обработки данных. Пожалуйста, попробуйте снова.",
                session_id
            )
        
        except Exception as e:
            logger.error(
                "delivery_data_processing_error",
                telegram_id=telegram_id,
                error=str(e),
                exc_info=True
            )
            await self._send_error_message(
                message,
                "Произошла ошибка при обработке данных. Пожалуйста, попробуйте позже.",
                session_id
            )
    
    async def _find_prize_by_id(
        self,
        telegram_id: int,
        prize_id: int
    ) -> Optional[object]:
        """
        Находит приз по telegram_id и prize_id (row_id)
        
        Args:
            telegram_id: Telegram ID пользователя
            prize_id: ID приза (row_id)
        
        Returns:
            Prize объект или None
        """
        try:
            # Используем репозиторий для поиска приза по row_id
            # Поскольку в PrizeRepository нет метода find_by_row_id, 
            # используем прямой запрос через контекст менеджер
            from sqlalchemy import select, and_
            from database.models.prize import Prize
            
            async with self.prize_repository._get_session_context() as session:
                stmt = select(Prize).where(
                    and_(
                        Prize.telegram_id == telegram_id,
                        Prize.row_id == prize_id,
                        Prize.prize_type == 'physical'
                    )
                )
                
                result = await session.execute(stmt)
                prize = result.scalar_one_or_none()
                
                return prize
        
        except Exception as e:
            logger.error(
                "error_finding_prize_by_id",
                telegram_id=telegram_id,
                prize_id=prize_id,
                error=str(e)
            )
            return None
    
    async def _save_to_sheets(
        self,
        row_id: int,
        sheet_name: str,
        delivery_data: dict
    ) -> bool:
        """
        Сохраняет данные доставки в Google Sheets с retry логикой
        
        Args:
            row_id: Номер строки в Google Sheets
            sheet_name: Название листа
            delivery_data: Данные доставки
        
        Returns:
            True если успешно сохранено
        """
        try:
            # Используем метод save_delivery_data с встроенной retry логикой
            success = await self.sheets_service.save_delivery_data(
                row_id=row_id,
                delivery_data=delivery_data,
                worksheet_name=sheet_name
            )
            
            return success
        
        except Exception as e:
            logger.error(
                "sheets_save_error",
                row_id=row_id,
                sheet_name=sheet_name,
                error=str(e)
            )
            return False
    
    async def _save_to_postgres(
        self,
        telegram_id: int,
        code_word: str,
        delivery_data: dict
    ) -> bool:
        """
        Обновляет данные доставки в PostgreSQL
        
        Args:
            telegram_id: Telegram ID пользователя
            code_word: Кодовое слово
            delivery_data: Данные доставки
        
        Returns:
            True если успешно обновлено
        """
        try:
            # Используем переданный prize_repository
            success = await self.prize_repository.update_delivery_data(
                telegram_id=telegram_id,
                code_word=code_word,
                delivery_data=delivery_data
            )
            
            return success
        
        except Exception as e:
            logger.error(
                "postgres_save_error",
                telegram_id=telegram_id,
                code_word=code_word,
                error=str(e)
            )
            return False
    
    async def _send_error_message(
        self,
        message: Message,
        error_text: str,
        session_id: Optional[int] = None
    ) -> None:
        """
        Отправляет сообщение об ошибке пользователю
        
        Args:
            message: Сообщение пользователя
            error_text: Текст ошибки
            session_id: ID сессии (опционально)
        """
        await message.answer(error_text)
        
        # Сохраняем ответ бота
        if self.session_manager and session_id:
            try:
                await self.session_manager.save_bot_message(
                    session_id=session_id,
                    message_text=error_text
                )
            except Exception as e:
                logger.error(
                    "failed_to_save_bot_response",
                    session_id=session_id,
                    error=str(e)
                )
