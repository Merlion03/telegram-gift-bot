"""
Точка входа для Telegram бота.
Инициализация и запуск бота с регистрацией всех handlers и настройкой FSM storage.
"""

import asyncio
import signal
import sys
from aiogram import Bot, Dispatcher
from aiogram.filters import Command, StateFilter
from aiogram.fsm.state import default_state
from aiogram.types import Message
import structlog

from config import get_config
from fsm.storage import create_fsm_storage
from fsm.states import SupportStates

# Импорт handlers
from handlers.common_handler import CommonHandler
from handlers.prize_handler import PrizeHandler
from handlers.support_handler import SupportHandler

# Импорт services
from services.google_sheets_service import GoogleSheetsService
from services.prize_service import PrizeService
from services.support_service import SupportService

# Импорт database
from database.connection import DatabaseConnection
from database.repository import SupportRepository

# Импорт утилит
from utils.logger import configure_logging
from utils.error_handler import setup_error_handlers

logger = structlog.get_logger(__name__)


class BotApplication:
    """Класс приложения бота для управления жизненным циклом"""
    
    def __init__(self):
        """Инициализирует приложение бота"""
        self.config = None
        self.bot = None
        self.dp = None
        self.db_connection = None
        self.shutdown_event = asyncio.Event()
    
    async def setup(self):
        """Настраивает все компоненты бота"""
        # Загрузка конфигурации
        self.config = get_config()
        
        # Настройка логирования
        configure_logging(
            log_level=self.config.app.log_level,
            json_format=True
        )
        
        logger.info(
            "bot_initialization_started",
            log_level=self.config.app.log_level
        )
        
        # Инициализация бота
        self.bot = Bot(token=self.config.bot.token)
        
        # Создание FSM storage
        storage = create_fsm_storage(self.config.fsm)
        logger.info(
            "fsm_storage_created",
            storage_type=self.config.fsm.storage_type
        )
        
        # Инициализация диспетчера
        self.dp = Dispatcher(storage=storage)
        
        # Инициализация подключения к БД
        self.db_connection = DatabaseConnection(self.config.database.connection_url)
        # Создание таблиц если их нет (идемпотентная операция)
        await self.db_connection.create_tables()
        logger.info("database_connection_initialized")
        
        # Создание сервисов
        google_sheets_service = GoogleSheetsService(
            credentials_path=self.config.google_sheets.credentials_path,
            spreadsheet_id=self.config.google_sheets.spreadsheet_id
        )
        
        prize_service = PrizeService(google_sheets_service)
        
        support_repository = SupportRepository(self.db_connection)
        support_service = SupportService(support_repository)
        
        # Создание handlers
        common_handler = CommonHandler()
        prize_handler = PrizeHandler(
            prize_service=prize_service,
            webapp_url=self.config.app.webapp_url
        )
        support_handler = SupportHandler(support_service)
        
        # Регистрация handlers
        self._register_handlers(common_handler, prize_handler, support_handler)
        
        # Настройка обработчиков ошибок
        setup_error_handlers(self.dp)
        
        logger.info("bot_setup_completed")
    
    def _register_handlers(
        self,
        common_handler: CommonHandler,
        prize_handler: PrizeHandler,
        support_handler: SupportHandler
    ):
        """
        Регистрирует все handlers в диспетчере
        
        Args:
            common_handler: Обработчик общих команд
            prize_handler: Обработчик призов
            support_handler: Обработчик поддержки
        """
        # Регистрация обработчиков общих команд
        self.dp.message.register(
            common_handler.handle_start,
            Command(commands=['start'])
        )
        
        self.dp.message.register(
            common_handler.handle_help,
            Command(commands=['help'])
        )
        
        # Регистрация обработчика кнопки "Позвать человека"
        # Эта кнопка запускает режим поддержки
        self.dp.message.register(
            support_handler.start_support,
            lambda message: message.text == "Позвать человека",
            StateFilter(default_state)  # Только когда не в режиме поддержки
        )
        
        # Регистрация обработчиков режима поддержки
        # Обработка всех сообщений в состоянии поддержки
        self.dp.message.register(
            support_handler.handle_support_message,
            StateFilter(SupportStates.in_support)
        )
        
        # Обёртка для обработки кодовых слов (нужна для async вызова)
        async def handle_code_word_wrapper(message: Message):
            """Обёртка для вызова handle_code_word с await"""
            await prize_handler.handle_code_word(message, message.text)
        
        # Регистрация обработчика кодовых слов (все остальные текстовые сообщения)
        # Этот обработчик срабатывает только вне режима поддержки
        self.dp.message.register(
            handle_code_word_wrapper,
            lambda message: message.text is not None,
            StateFilter(default_state)
        )
        
        logger.info("handlers_registered")
    
    async def start(self):
        """Запускает бота"""
        logger.info("bot_starting")
        
        try:
            # Удаление webhook (если был установлен)
            await self.bot.delete_webhook(drop_pending_updates=True)
            logger.info("webhook_deleted")
            
            # Запуск polling
            logger.info("polling_started")
            await self.dp.start_polling(
                self.bot,
                allowed_updates=self.dp.resolve_used_update_types()
            )
        
        except asyncio.CancelledError:
            logger.info("polling_cancelled")
        
        except Exception as e:
            logger.error(
                "bot_runtime_error",
                error=str(e),
                exc_info=True
            )
            raise
    
    async def shutdown(self):
        """Выполняет graceful shutdown бота"""
        logger.info("bot_shutdown_started")
        
        try:
            # Остановка polling
            await self.dp.stop_polling()
            logger.info("polling_stopped")
            
            # Закрытие FSM storage
            await self.dp.storage.close()
            logger.info("fsm_storage_closed")
            
            # Закрытие подключения к БД
            if self.db_connection:
                await self.db_connection.close()
                logger.info("database_connection_closed")
            
            # Закрытие сессии бота
            if self.bot:
                await self.bot.session.close()
                logger.info("bot_session_closed")
        
        except Exception as e:
            logger.error(
                "shutdown_error",
                error=str(e),
                exc_info=True
            )
        
        finally:
            logger.info("bot_shutdown_completed")


async def main():
    """Главная функция запуска бота"""
    app = BotApplication()
    
    # Настройка обработчиков сигналов для graceful shutdown
    loop = asyncio.get_running_loop()
    
    def signal_handler(sig):
        """Обработчик сигналов завершения"""
        logger.info(
            "shutdown_signal_received",
            signal=signal.Signals(sig).name
        )
        loop.create_task(app.shutdown())
        loop.stop()
    
    # Регистрация обработчиков сигналов (только для Unix-подобных систем)
    if sys.platform != 'win32':
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, lambda s=sig: signal_handler(s))
    
    try:
        # Настройка бота
        await app.setup()
        
        # Запуск бота
        await app.start()
    
    except KeyboardInterrupt:
        logger.info("keyboard_interrupt_received")
    
    except Exception as e:
        logger.error(
            "fatal_error",
            error=str(e),
            exc_info=True
        )
        raise
    
    finally:
        # Graceful shutdown
        await app.shutdown()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
