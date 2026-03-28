"""
FastAPI сервер для Backend API

Предоставляет REST API endpoints для взаимодействия с Frontend приложением.
Основной endpoint: GET /api/prize/{prize_id} для получения информации о призе.
"""
import sys
import asyncio

# Исправление для Windows: принудительно используем SelectorEventLoop
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional

from database.connection import init_database, get_database
from database.repositories.prize_info_repository import PrizeInfoRepository
from utils.logging_config import get_logger, configure_logging
from config import get_config


# Настройка логирования
configure_logging(log_level="INFO", json_logs=False)
logger = get_logger(__name__)

# Создание FastAPI приложения
app = FastAPI(
    title="Prize Backend API",
    description="API для получения информации о призах",
    version="1.0.0"
)


class PrizeInfoResponse(BaseModel):
    """Модель ответа с информацией о призе"""
    sheet_name: str = Field(..., description="Название листа в Google Таблице")
    row_id: int = Field(..., description="Номер строки в Google Sheets")
    code_word: str = Field(..., description="Кодовое слово для верификации")


class ErrorResponse(BaseModel):
    """Модель ответа с ошибкой"""
    error: str = Field(..., description="Тип ошибки")
    message: str = Field(..., description="Описание ошибки")


@app.on_event("startup")
async def startup_event():
    """
    Инициализация при запуске приложения
    
    Инициализирует подключение к базе данных и создает таблицы если их нет.
    """
    logger.info("api_server_starting")
    
    # Загрузка конфигурации
    config = get_config()
    
    # Инициализация подключения к БД
    init_database(
        database_url=config.database.connection_url,
        pool_size=config.database.pool_size,
        max_overflow=config.database.max_overflow,
        pool_pre_ping=config.database.pool_pre_ping
    )
    
    # Создание таблиц если их нет
    db = get_database()
    await db.create_tables()
    
    logger.info("api_server_started")


@app.on_event("shutdown")
async def shutdown_event():
    """
    Очистка при остановке приложения
    
    Закрывает подключение к базе данных.
    """
    logger.info("api_server_shutting_down")
    
    db = get_database()
    await db.close()
    
    logger.info("api_server_stopped")


@app.get(
    "/api/prize/{prize_id}",
    response_model=PrizeInfoResponse,
    responses={
        200: {
            "description": "Информация о призе успешно получена",
            "model": PrizeInfoResponse
        },
        400: {
            "description": "Невалидный prize_id",
            "model": ErrorResponse
        },
        404: {
            "description": "Приз не найден",
            "model": ErrorResponse
        },
        500: {
            "description": "Внутренняя ошибка сервера",
            "model": ErrorResponse
        }
    },
    summary="Получить информацию о призе",
    description="Возвращает информацию о призе (sheet_name, row_id, code_word) по prize_id"
)
async def get_prize(prize_id: int):
    """
    Получает информацию о призе по prize_id
    
    Args:
        prize_id: ID приза (должен быть положительным целым числом)
    
    Returns:
        PrizeInfoResponse: Информация о призе
    
    Raises:
        HTTPException 400: Если prize_id невалидный (не положительное число)
        HTTPException 404: Если приз с указанным prize_id не найден
        HTTPException 500: Если произошла ошибка при работе с базой данных
    """
    # Валидация prize_id: должен быть положительным целым числом
    if prize_id <= 0:
        logger.warning(
            "invalid_prize_id",
            prize_id=prize_id,
            reason="not_positive"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "Invalid prize_id",
                "message": "prize_id должен быть положительным целым числом"
            }
        )
    
    try:
        # Создание repository для работы с базой данных
        repository = PrizeInfoRepository(None)  # Использует глобальное подключение
        
        # Получение информации о призе
        prize_info = await repository.get_prize_info(prize_id)
        
        # Если приз не найден, возвращаем HTTP 404
        if prize_info is None:
            logger.info(
                "prize_not_found_api",
                prize_id=prize_id
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": "Prize not found",
                    "message": f"Приз с ID {prize_id} не найден"
                }
            )
        
        # Возвращаем информацию о призе
        logger.info(
            "prize_info_returned",
            prize_id=prize_id,
            sheet_name=prize_info['sheet_name'],
            row_id=prize_info['row_id']
        )
        
        return PrizeInfoResponse(
            sheet_name=prize_info['sheet_name'],
            row_id=prize_info['row_id'],
            code_word=prize_info['code_word']
        )
    
    except HTTPException:
        # Пробрасываем HTTP исключения дальше
        raise
    
    except Exception as e:
        # Логируем ошибку и возвращаем HTTP 500
        logger.error(
            "prize_info_api_error",
            prize_id=prize_id,
            error=str(e),
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Internal server error",
                "message": "Ошибка при получении информации о призе"
            }
        )


@app.get("/health", summary="Health check", description="Проверка работоспособности API")
async def health_check():
    """
    Health check endpoint для мониторинга
    
    Returns:
        dict: Статус сервиса
    """
    return {"status": "ok", "service": "prize-backend-api"}


class DeliveryNotificationRequest(BaseModel):
    """Модель запроса на отправку уведомлений о доставке"""
    telegram_id: int = Field(..., description="Telegram ID пользователя")
    prize_id: int = Field(..., description="ID приза")


@app.post(
    "/bot/delivery-notification",
    summary="Отправить уведомления о доставке",
    description="Отправляет уведомления пользователю после сохранения данных доставки"
)
async def send_delivery_notification(request: DeliveryNotificationRequest):
    """
    Отправляет уведомления пользователю через NotificationService
    
    Args:
        request: Данные запроса (telegram_id, prize_id)
    
    Returns:
        dict: Результат отправки уведомлений
    """
    try:
        # Импортируем необходимые модули
        from aiogram import Bot
        from services.notification_service import NotificationService
        from config import get_config
        
        # Получаем конфигурацию
        config = get_config()
        
        # Создаём бота
        bot = Bot(token=config.bot.token)
        
        # Создаём NotificationService
        notification_service = NotificationService(bot=bot, session_manager=None)
        
        # Отправляем уведомления
        result = await notification_service.send_delivery_notifications(
            telegram_id=request.telegram_id,
            prize_id=request.prize_id,
            session_id=None
        )
        
        # Закрываем сессию бота
        await bot.session.close()
        
        logger.info(
            "delivery_notification_sent_via_api",
            telegram_id=request.telegram_id,
            prize_id=request.prize_id,
            confirmation_sent=result.confirmation_sent,
            main_menu_sent=result.main_menu_sent
        )
        
        return {
            "success": True,
            "confirmation_sent": result.confirmation_sent,
            "main_menu_sent": result.main_menu_sent,
            "both_sent": result.both_sent
        }
    
    except Exception as e:
        logger.error(
            "delivery_notification_api_error",
            telegram_id=request.telegram_id,
            prize_id=request.prize_id,
            error=str(e),
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Failed to send notification",
                "message": "Не удалось отправить уведомление"
            }
        )


if __name__ == "__main__":
    import uvicorn
    
    # Запуск сервера
    uvicorn.run(
        "api_server:app",
        host="0.0.0.0",
        port=5000,
        reload=True,
        log_level="info"
    )
