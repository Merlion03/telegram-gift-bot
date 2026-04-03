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
from aiogram.types import Message, CallbackQuery
from aiogram import F

from config import get_config
from fsm.storage import create_fsm_storage
from fsm.states import SupportStates, PrizeFlowStates
from utils.logging_config import get_logger, configure_logging

# Импорт handlers
from handlers.common_handler import CommonHandler
from handlers.prize_handler import PrizeHandler
from handlers.support_handler import SupportHandler
from handlers.delivery_handler import DeliveryHandler
from handlers.prize_flow_handler import PrizeFlowHandler

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
        self.notification_listener_task = None  # Task для LISTEN/NOTIFY
    
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
        
        # Инициализация asyncpg connection pool для LISTEN/NOTIFY
        from database.asyncpg_connection import initialize_asyncpg_pool
        await initialize_asyncpg_pool(
            database_url=self.config.database.connection_url,
            min_size=5,
            max_size=20
        )
        self.logger.info("asyncpg_pool_initialized")
        
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
        
        # Создание FileDownloader для скачивания медиафайлов
        from services.file_downloader import FileDownloader
        import os
        base_media_path = os.path.join(os.path.dirname(__file__), 'media')
        file_downloader = FileDownloader(bot=self.bot, base_media_path=base_media_path)
        
        # Создание StickerConverter для конвертации стикеров
        from services.sticker_converter import StickerConverter
        sticker_converter = StickerConverter()
        
        # Создание MediaHandler для обработки медиа-сообщений
        from handlers.media_handler import MediaHandler
        media_handler = MediaHandler(
            file_downloader=file_downloader,
            sticker_converter=sticker_converter,
            support_service=support_service
        )
        
        # Создание NotificationService для отправки уведомлений
        from services.notification_service import NotificationService
        notification_service = NotificationService(
            bot=self.bot,
            session_manager=session_manager
        )
        
        # Создание AdminRepository для проверки администраторов
        from database.repositories.admin_repository import AdminRepository
        admin_repository = AdminRepository()
        
        # Создание AdminNotificationService для уведомлений новых администраторов
        from services.admin_notification_service import AdminNotificationService
        admin_notification_service = AdminNotificationService(
            bot=self.bot,
            webapp_url=self.config.app.webapp_url
        )
        
        # Создание AdminStartHandler для обработки /start администраторов
        from handlers.admin_start_handler import AdminStartHandler
        admin_start_handler = AdminStartHandler(
            admin_repository=admin_repository,
            session_manager=session_manager,
            webapp_url=self.config.app.webapp_url
        )
        
        # Создание handlers
        common_handler = CommonHandler(session_manager, admin_start_handler)
        prize_handler = PrizeHandler(
            prize_service=prize_service,
            webapp_url=self.config.app.webapp_url,
            session_manager=session_manager
        )
        support_handler = SupportHandler(support_service, media_handler, session_manager)
        
        # Создание DeliveryHandler для обработки данных доставки из WebApp
        from database.repositories.prize_repository import PrizeRepository
        prize_repository = PrizeRepository(None)  # Использует глобальное подключение
        delivery_handler = DeliveryHandler(
            sheets_service=google_sheets_service,
            prize_repository=prize_repository,
            prize_service=prize_service,
            notification_service=notification_service,
            session_manager=session_manager
        )
        
        # Создание PrizeFlowHandler для управления процессом получения приза
        prize_flow_handler = PrizeFlowHandler(
            prize_service=prize_service,
            notification_service=notification_service,
            session_manager=session_manager,
            webapp_url=self.config.app.webapp_url
        )
        
        # Регистрация middleware (должна быть ДО регистрации handlers)
        self._register_middleware(session_manager)
        
        # Регистрация handlers
        self._register_handlers(common_handler, prize_handler, support_handler, delivery_handler, prize_flow_handler)
        
        # Настройка обработчиков ошибок
        setup_error_handlers(self.dp)
        
        # Запуск PostgreSQL LISTEN/NOTIFY для уведомлений новых администраторов
        self.notification_listener_task = asyncio.create_task(
            self._start_notification_listener(admin_notification_service)
        )
        
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
        delivery_handler: DeliveryHandler,
        prize_flow_handler: PrizeFlowHandler
    ):
        """
        Регистрирует все handlers в диспетчере
        
        Args:
            common_handler: Обработчик общих команд
            prize_handler: Обработчик призов
            support_handler: Обработчик поддержки
            delivery_handler: Обработчик данных доставки из WebApp
            prize_flow_handler: Обработчик процесса получения приза
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
        
        # Регистрация обработчиков Prize Flow
        # Обработчик кнопки "🎁 Получить приз"
        async def start_prize_flow_wrapper(message: Message, state: FSMContext, **kwargs):
            session_id = kwargs.get('session_id')
            await prize_flow_handler.start_prize_flow(message, state, session_id)
        
        self.dp.message.register(
            start_prize_flow_wrapper,
            lambda message: message.text == "🎁 Получить приз",
            StateFilter(default_state)
        )
        
        # Обработчик состояния waiting_for_consent
        async def handle_consent_wrapper(message: Message, state: FSMContext, **kwargs):
            session_id = kwargs.get('session_id')
            await prize_flow_handler.handle_consent_response(message, state, session_id)
        
        self.dp.message.register(
            handle_consent_wrapper,
            StateFilter(PrizeFlowStates.waiting_for_consent)
        )
        
        # Обработчик состояния waiting_for_code_word
        async def handle_code_word_flow_wrapper(message: Message, state: FSMContext, **kwargs):
            session_id = kwargs.get('session_id')
            await prize_flow_handler.handle_code_word_input(message, state, session_id)
        
        self.dp.message.register(
            handle_code_word_flow_wrapper,
            StateFilter(PrizeFlowStates.waiting_for_code_word)
        )
        
        # Обработчик состояния waiting_for_delivery_data (WebApp данные)
        async def handle_delivery_flow_wrapper(message: Message, state: FSMContext, **kwargs):
            session_id = kwargs.get('session_id')
            await delivery_handler.handle_delivery_data(message, state, session_id)
        
        self.dp.message.register(
            handle_delivery_flow_wrapper,
            lambda message: message.web_app_data is not None,
            StateFilter(PrizeFlowStates.waiting_for_delivery_data)
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
        
        # Обработчик кодовых слов УДАЛЁН
        # Причина: Бот не должен проверять каждое сообщение как кодовое слово
        # Кодовые слова теперь вводятся только через Prize Flow (после нажатия кнопки "Получить приз")
        # См. PrizeFlowHandler.handle_code_word_input() для обработки кодовых слов
        
        # Регистрация обработчика данных доставки из WebApp (только в default_state)
        # Срабатывает когда пользователь отправляет данные из WebApp вне Prize Flow
        async def handle_delivery_data_wrapper(message: Message, state: FSMContext, **kwargs):
            """Обёртка для обработки данных доставки из WebApp"""
            session_id = kwargs.get('session_id')
            await delivery_handler.handle_delivery_data(message, state, session_id)
        
        self.dp.message.register(
            handle_delivery_data_wrapper,
            lambda message: message.web_app_data is not None,
            StateFilter(default_state)
        )
        
        # Регистрация callback обработчиков
        # Callback для кнопки "🎁 Получить приз"
        # Обрабатывается в любом состоянии, чтобы старые кнопки в чате тоже работали
        async def get_prize_callback_wrapper(callback: CallbackQuery, state: FSMContext, **kwargs):
            session_id = kwargs.get('session_id')
            # Сбрасываем состояние перед началом нового Prize Flow
            await state.clear()
            await prize_flow_handler.handle_get_prize_callback(callback, state, session_id)
        
        self.dp.callback_query.register(
            get_prize_callback_wrapper,
            F.data == "get_prize"
            # Убрали StateFilter, чтобы обрабатывать callback в любом состоянии
        )
        
        # Callback для кнопок согласия GDPR
        async def consent_callback_wrapper(callback: CallbackQuery, state: FSMContext, **kwargs):
            session_id = kwargs.get('session_id')
            await prize_flow_handler.handle_consent_callback(callback, state, session_id)
        
        self.dp.callback_query.register(
            consent_callback_wrapper,
            F.data.in_(["consent_agree", "consent_back"]),
            StateFilter(PrizeFlowStates.waiting_for_consent)
        )
        
        # Callback для кнопок действий с заполненной формой доставки
        async def confirm_delivery_callback_wrapper(callback: CallbackQuery, state: FSMContext, **kwargs):
            session_id = kwargs.get('session_id')
            # Извлекаем prize_id из callback_data
            prize_id = int(callback.data.split(':')[1])
            await prize_flow_handler.handle_confirm_delivery_callback(callback, state, prize_id, session_id)
        
        self.dp.callback_query.register(
            confirm_delivery_callback_wrapper,
            F.data.startswith("confirm_delivery:")
        )
        
        # Callback для кнопки "Завершить диалог" в поддержке
        async def support_end_callback_wrapper(callback: CallbackQuery, state: FSMContext, **kwargs):
            session_id = kwargs.get('session_id')
            await support_handler.handle_support_end_callback(callback, state)
        
        self.dp.callback_query.register(
            support_end_callback_wrapper,
            F.data == "support_end",
            StateFilter(SupportStates.in_support)
        )
        
        self.logger.info("handlers_registered")
    
    async def _start_notification_listener(self, admin_notification_service) -> None:
        """
        Запускает PostgreSQL LISTEN/NOTIFY listener для уведомлений новых администраторов
        
        Слушает канал 'new_admin_notification' и вызывает AdminNotificationService
        при получении уведомления от триггера БД.
        
        Args:
            admin_notification_service: Сервис для отправки уведомлений
        
        Validates: Requirements 5.1, 5.4
        """
        from database.asyncpg_connection import get_asyncpg_pool
        import json
        
        while not self.shutdown_event.is_set():
            try:
                pool = get_asyncpg_pool().get_pool()
                
                async with pool.acquire() as conn:
                    self.logger.info("notification_listener_started")
                    
                    # Подписываемся на канал
                    await conn.add_listener('new_admin_notification', self._handle_notification)
                    
                    self.logger.info("listening_for_admin_notifications")
                    
                    # Сохраняем ссылку на сервис для использования в callback
                    self._admin_notification_service = admin_notification_service
                    
                    # Ждём завершения работы бота
                    await self.shutdown_event.wait()
                    
                    # Отписываемся от канала
                    await conn.remove_listener('new_admin_notification', self._handle_notification)
                    self.logger.info("notification_listener_stopped")
                    break
            
            except Exception as e:
                self.logger.error(
                    "notification_listener_error",
                    error=str(e),
                    exc_info=True
                )
                
                # Переподключение через 5 секунд
                if not self.shutdown_event.is_set():
                    self.logger.info("notification_listener_reconnecting_in_5s")
                    await asyncio.sleep(5)
    
    async def _handle_notification(self, connection, pid, channel, payload):
        """
        Обрабатывает уведомление о новом администраторе
        
        Args:
            connection: Подключение к БД
            pid: Process ID отправителя
            channel: Название канала
            payload: JSON payload с данными администратора
        
        Validates: Requirements 5.1, 5.4
        """
        import json
        
        try:
            # Парсим payload
            data = json.loads(payload)
            tg_id = data.get('tg_id')
            username = data.get('username')
            role = data.get('role')
            
            self.logger.info(
                "new_admin_notification_received",
                tg_id=tg_id,
                username=username,
                role=role
            )
            
            # Отправляем уведомление через AdminNotificationService
            await self._admin_notification_service.notify_new_admin(
                tg_id=tg_id,
                username=username,
                role=role
            )
        
        except json.JSONDecodeError as e:
            self.logger.error(
                "notification_payload_parse_error",
                payload=payload,
                error=str(e)
            )
        
        except Exception as e:
            self.logger.error(
                "notification_handler_error",
                payload=payload,
                error=str(e),
                exc_info=True
            )
    
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
            # Устанавливаем событие завершения для остановки listener
            self.shutdown_event.set()
            
            # Ждём завершения notification listener
            if self.notification_listener_task:
                try:
                    await asyncio.wait_for(self.notification_listener_task, timeout=5.0)
                    self.logger.info("notification_listener_task_stopped")
                except asyncio.TimeoutError:
                    self.logger.warning("notification_listener_task_timeout")
                    self.notification_listener_task.cancel()
            
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
            
            # Закрытие asyncpg connection pool
            from database.asyncpg_connection import close_asyncpg_pool
            await close_asyncpg_pool()
            self.logger.info("asyncpg_pool_closed")
            
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
