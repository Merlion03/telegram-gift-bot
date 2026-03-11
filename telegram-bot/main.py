"""
Точка входа для Telegram бота.
Инициализация и запуск бота с регистрацией всех handlers и настройкой FSM storage.
"""

import asyncio
import signal
import sys

# Исправление для Windows: принудительно используем SelectorEventLoop
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
from aiogram import Bot, Dispatcher
from aiogram.filters import Command, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import default_state
from aiogram.types import Message

from config import get_config
from fsm.storage import create_fsm_storage
from fsm.states import SupportStates
from utils.logging_config import get_logger, configure_logging

# Импорт handlers
from handlers.common_handler import CommonHandler
from handlers.prize_handler import PrizeHandler
from handlers.support_handler import SupportHandler
from handlers.delivery_handler import DeliveryHandler

# Импорт services
from services.google_sheets_service import GoogleSheetsService
from services.prize_service import PrizeService
from services.update_queue_service import UpdateQueueService
from services.support_service import SupportService
from services.session_manager import SessionManager

# Импорт middleware
from middleware.message_interceptor import MessageInterceptor

# Импорт database
from database.connection import DatabaseConnection
from database.repository import SupportRepository

# Импорт утилит
from utils.logger import configure_logging
from utils.error_handler import setup_error_handlers


class BotApplication:
    """Класс приложения бота для управления жизненным циклом"""
    
    def __init__(self):
        """Инициализирует приложение бота"""
        self.config = None
        self.bot = None
        self.dp = None
        self.db_connection = None
        self.update_queue_service = None
        self.shutdown_event = asyncio.Event()
        self.logger = None
    
    async def setup(self):
        """Настраивает все компоненты бота"""
        # Загрузка конфигурации
        self.config = get_config()
        
        # Настройка логирования через старый модуль (для совместимости)
        from utils.logger import configure_logging as old_configure_logging
        old_configure_logging(
            log_level=self.config.app.log_level,
            json_format=True
        )
        
        # Получаем logger после настройки
        self.logger = get_logger(__name__)
        
        self.logger.info(
            "bot_initialization_started",
            log_level=self.config.app.log_level
        )
        
        # Инициализация бота
        self.bot = Bot(token=self.config.bot.token)
        
        # Создание FSM storage
        storage = create_fsm_storage(self.config.fsm)
        self.logger.info(
            "fsm_storage_created",
            storage_type=self.config.fsm.storage_type
        )
        
        # Инициализация диспетчера
        self.dp = Dispatcher(storage=storage)
        
        # Инициализация глобального подключения к БД с connection pooling
        from database.connection import init_database
        init_database(
            database_url=self.config.database.connection_url,
            pool_size=self.config.database.pool_size,
            max_overflow=self.config.database.max_overflow,
            pool_pre_ping=self.config.database.pool_pre_ping
        )
        
        # Получаем глобальное подключение для создания таблиц
        from database.connection import get_database
        self.db_connection = get_database()
        
        # Создание таблиц если их нет (идемпотентная операция)
        await self.db_connection.create_tables()
        self.logger.info("database_connection_initialized")
        
        # Создание сервисов
        google_sheets_service = GoogleSheetsService(
            credentials_path=self.config.google_sheets.credentials_path,
            spreadsheet_id=self.config.google_sheets.spreadsheet_id
        )
        
        # Создание сервиса очереди обновлений
        update_queue_service = UpdateQueueService(google_sheets_service)
        self.update_queue_service = update_queue_service
        
        # Запуск воркера очереди
        await update_queue_service.start()
        
        prize_service = PrizeService(
            sheets_service=google_sheets_service,
            update_queue_service=update_queue_service
        )
        
        # SupportRepository работает с глобальным подключением через get_database()
        # Передаём None, чтобы использовать глобальное подключение
        support_repository = SupportRepository(None)
        support_service = SupportService(support_repository)
        
        # Создание SessionManager для автоматического сохранения диалогов
        session_manager = SessionManager(support_repository)
        
        # Создание handlers
        common_handler = CommonHandler(session_manager)
        prize_handler = PrizeHandler(
            prize_service=prize_service,
            webapp_url=self.config.app.webapp_url,
            session_manager=session_manager
        )
        support_handler = SupportHandler(support_service, session_manager)
        
        # Создание DeliveryHandler для обработки данных доставки из WebApp
        from database.repositories.prize_repository import PrizeRepository
        prize_repository = PrizeRepository(None)  # Использует глобальное подключение
        delivery_handler = DeliveryHandler(
            sheets_service=google_sheets_service,
            prize_repository=prize_repository,
            session_manager=session_manager
        )
        
        # Регистрация middleware (должна быть ДО регистрации handlers)
        self._register_middleware(session_manager)
        
        # Регистрация handlers
        self._register_handlers(common_handler, prize_handler, support_handler, delivery_handler)
        
        # Настройка обработчиков ошибок
        setup_error_handlers(self.dp)
        
        self.logger.info("bot_setup_completed")
    
    def _register_middleware(self, session_manager: SessionManager):
        """
        Регистрирует middleware в диспетчере
        
        Middleware выполняются в порядке регистрации, поэтому MessageInterceptor
        регистрируется первым для перехвата всех сообщений до обработчиков.
        
        Args:
            session_manager: Менеджер сессий для MessageInterceptor
        """
        # Создание MessageInterceptor
        message_interceptor = MessageInterceptor(session_manager)
        
        # Регистрация middleware для всех входящих сообщений
        # Middleware выполняется ДО всех handlers
        self.dp.message.middleware(message_interceptor)
        
        self.logger.info("middleware_registered")
    
    def _register_handlers(
        self,
        common_handler: CommonHandler,
        prize_handler: PrizeHandler,
        support_handler: SupportHandler,
        delivery_handler: DeliveryHandler
    ):
        """
        Регистрирует все handlers в диспетчере
        
        Args:
            common_handler: Обработчик общих команд
            prize_handler: Обработчик призов
            support_handler: Обработчик поддержки
            delivery_handler: Обработчик данных доставки из WebApp
        """
        # Регистрация обработчиков общих команд
        # Обёртки для передачи session_id из middleware context
        async def handle_start_wrapper(message: Message, **kwargs):
            session_id = kwargs.get('session_id')
            await common_handler.handle_start(message, session_id)
        
        async def handle_help_wrapper(message: Message, **kwargs):
            session_id = kwargs.get('session_id')
            await common_handler.handle_help(message, session_id)
        
        self.dp.message.register(
            handle_start_wrapper,
            Command(commands=['start'])
        )
        
        self.dp.message.register(
            handle_help_wrapper,
            Command(commands=['help'])
        )
        
        # Регистрация обработчика кнопки "Позвать человека"
        # Эта кнопка запускает режим поддержки
        async def start_support_wrapper(message: Message, state: FSMContext, **kwargs):
            session_id = kwargs.get('session_id')
            await support_handler.start_support(message, state, session_id)
        
        self.dp.message.register(
            start_support_wrapper,
            lambda message: message.text == "Позвать человека",
            StateFilter(default_state)  # Только когда не в режиме поддержки
        )
        
        # Регистрация обработчиков режима поддержки
        # Обработка всех сообщений в состоянии поддержки
        async def handle_support_message_wrapper(message: Message, state: FSMContext, **kwargs):
            session_id = kwargs.get('session_id')
            await support_handler.handle_support_message(message, state, session_id)
        
        self.dp.message.register(
            handle_support_message_wrapper,
            StateFilter(SupportStates.in_support)
        )
        
        # Обёртка для обработки кодовых слов (нужна для async вызова)
        async def handle_code_word_wrapper(message: Message, **kwargs):
            """Обёртка для вызова handle_code_word с await"""
            session_id = kwargs.get('session_id')
            await prize_handler.handle_code_word(message, message.text, session_id)
        
        # Регистрация обработчика кодовых слов (все остальные текстовые сообщения)
        # Этот обработчик срабатывает только вне режима поддержки
        self.dp.message.register(
            handle_code_word_wrapper,
            lambda message: message.text is not None,
            StateFilter(default_state)
        )
        
        # Регистрация обработчика данных доставки из WebApp
        # Срабатывает когда пользователь отправляет данные из WebApp
        async def handle_delivery_data_wrapper(message: Message, **kwargs):
            """Обёртка для обработки данных доставки из WebApp"""
            session_id = kwargs.get('session_id')
            await delivery_handler.handle_delivery_data(message, session_id)
        
        self.dp.message.register(
            handle_delivery_data_wrapper,
            lambda message: message.web_app_data is not None,
            StateFilter(default_state)
        )
        
        self.logger.info("handlers_registered")
    
    async def start(self):
        """Запускает бота"""
        self.logger.info("bot_starting")
        
        try:
            # Удаление webhook (если был установлен)
            await self.bot.delete_webhook(drop_pending_updates=True)
            self.logger.info("webhook_deleted")
            
            # Запуск polling
            self.logger.info("polling_started")
            await self.dp.start_polling(
                self.bot,
                allowed_updates=self.dp.resolve_used_update_types()
            )
        
        except asyncio.CancelledError:
            self.logger.info("polling_cancelled")
        
        except Exception as e:
            self.logger.error(
                "bot_runtime_error",
                error=str(e),
                exc_info=True
            )
            raise
    
    async def shutdown(self):
        """Выполняет graceful shutdown бота"""
        self.logger.info("bot_shutdown_started")
        
        try:
            # Остановка сервиса очереди обновлений
            if self.update_queue_service:
                await self.update_queue_service.stop()
                self.logger.info("update_queue_service_stopped")
            
            # Остановка polling
            await self.dp.stop_polling()
            self.logger.info("polling_stopped")
            
            # Закрытие FSM storage
            await self.dp.storage.close()
            self.logger.info("fsm_storage_closed")
            
            # Закрытие подключения к БД
            if self.db_connection:
                await self.db_connection.close()
                self.logger.info("database_connection_closed")
            
            # Закрытие сессии бота
            if self.bot:
                await self.bot.session.close()
                self.logger.info("bot_session_closed")
        
        except Exception as e:
            self.logger.error(
                "shutdown_error",
                error=str(e),
                exc_info=True
            )
        
        finally:
            self.logger.info("bot_shutdown_completed")


async def main():
    """Главная функция запуска бота"""
    # Настраиваем логирование через новую конфигурацию
    import os
    log_level = os.getenv('LOG_LEVEL', 'INFO')
    json_logs = os.getenv('JSON_LOGS', 'false').lower() == 'true'
    
    # Используем новую конфигурацию логирования
    from utils.logging_config import configure_logging as new_configure_logging
    new_configure_logging(log_level=log_level, json_logs=json_logs)
    
    logger = get_logger(__name__)
    logger.info("bot_starting")
    
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
