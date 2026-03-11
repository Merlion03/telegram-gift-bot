"""
Sync Worker - автономный процесс для периодической синхронизации данных

Запускает синхронизацию данных из Google Sheets в PostgreSQL по расписанию.
Обеспечивает graceful shutdown и корректное управление ресурсами.
"""
import asyncio
import signal
import sys
from typing import Optional

# Исправление для Windows: принудительно используем SelectorEventLoop
if sys.platform == "win32":
    try:
        # Для Python 3.14+ используем встроенную политику
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except AttributeError:
        # Для старых версий Python создаем собственную политику
        import selectors
        class WindowsSelectorEventLoopPolicy(asyncio.DefaultEventLoopPolicy):
            def new_event_loop(self):
                return asyncio.SelectorEventLoop(selectors.SelectSelector())
        
        asyncio.set_event_loop_policy(WindowsSelectorEventLoopPolicy())

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from config import get_config
from database.connection import init_database, get_database
from services.sync_service import SyncService
from utils.logging_config import get_logger, configure_logging


logger = get_logger(__name__)


class SyncWorker:
    """
    Worker для периодической синхронизации данных из Google Sheets в PostgreSQL
    
    Использует APScheduler для запуска синхронизации по расписанию.
    Обеспечивает graceful shutdown при получении сигналов SIGTERM/SIGINT.
    """
    
    def __init__(self):
        """Инициализирует sync worker"""
        self.scheduler: Optional[AsyncIOScheduler] = None
        self.sync_service: Optional[SyncService] = None
        self.running = False
        self.current_sync_task: Optional[asyncio.Task] = None
        
        logger.info("sync_worker_initialized")
    
    async def start(self) -> None:
        """
        Запускает sync worker
        
        Инициализирует все необходимые компоненты:
        - Загружает конфигурацию
        - Инициализирует подключение к БД
        - Создает SyncService
        - Запускает scheduler
        """
        try:
            logger.info("sync_worker_starting")
            
            # Загружаем конфигурацию
            config = get_config()
            
            logger.info(
                "configuration_loaded",
                sync_interval_seconds=config.sync.sync_interval_seconds,
                use_postgres=config.sync.use_postgres,
                batch_size=config.sync.batch_size,
                max_retries=config.sync.max_retries
            )
            
            # Инициализируем подключение к БД с connection pooling
            init_database(
                database_url=config.database.connection_url,
                pool_size=config.database.pool_size,
                max_overflow=config.database.max_overflow,
                pool_pre_ping=config.database.pool_pre_ping
            )
            
            logger.info("database_connection_initialized")
            
            # Проверяем доступность БД
            db = get_database()
            is_healthy = await db.health_check()
            
            if not is_healthy:
                logger.error("database_health_check_failed")
                raise RuntimeError("База данных недоступна")
            
            logger.info("database_health_check_passed")
            
            # Создаем SyncService
            self.sync_service = SyncService(
                google_sheets_config=config.google_sheets,
                sync_config=config.sync
            )
            
            logger.info("sync_service_created")
            
            # Инициализируем scheduler
            self.scheduler = AsyncIOScheduler()
            
            # Добавляем job для синхронизации
            self.scheduler.add_job(
                func=self.sync_job,
                trigger=IntervalTrigger(seconds=config.sync.sync_interval_seconds),
                id='sync_job',
                name='Синхронизация данных из Google Sheets',
                replace_existing=True,
                max_instances=1  # Только одна синхронизация одновременно
            )
            
            logger.info(
                "scheduler_job_added",
                interval_seconds=config.sync.sync_interval_seconds
            )
            
            # Запускаем scheduler
            self.scheduler.start()
            self.running = True
            
            logger.info("sync_worker_started")
            
            # Выполняем первую синхронизацию сразу
            logger.info("running_initial_sync")
            await self.sync_job()
            
            # Держим worker запущенным
            while self.running:
                await asyncio.sleep(1)
                
        except Exception as e:
            logger.error(
                "sync_worker_start_failed",
                error=str(e),
                exc_info=True
            )
            raise
    
    async def stop(self) -> None:
        """
        Останавливает sync worker (graceful shutdown)
        
        Выполняет:
        - Остановку scheduler
        - Ожидание завершения текущей синхронизации
        - Закрытие подключений к БД
        """
        logger.info("sync_worker_stopping")
        self.running = False
        
        try:
            # Останавливаем scheduler (не принимаем новые задачи)
            if self.scheduler and self.scheduler.running:
                logger.info("stopping_scheduler")
                self.scheduler.shutdown(wait=False)
                logger.info("scheduler_stopped")
            
            # Ждем завершения текущей синхронизации
            if self.current_sync_task and not self.current_sync_task.done():
                logger.info("waiting_for_current_sync_to_complete")
                
                try:
                    # Даем 60 секунд на завершение текущей синхронизации
                    await asyncio.wait_for(self.current_sync_task, timeout=60.0)
                    logger.info("current_sync_completed")
                except asyncio.TimeoutError:
                    logger.warning("current_sync_timeout_cancelling")
                    self.current_sync_task.cancel()
                    try:
                        await self.current_sync_task
                    except asyncio.CancelledError:
                        logger.info("current_sync_cancelled")
            
            # Закрываем подключения к БД
            logger.info("closing_database_connections")
            db = get_database()
            await db.close()
            logger.info("database_connections_closed")
            
            logger.info("sync_worker_stopped")
            
        except Exception as e:
            logger.error(
                "sync_worker_stop_error",
                error=str(e),
                exc_info=True
            )
            raise
    
    async def sync_job(self) -> None:
        """
        Job для выполнения синхронизации
        
        Вызывается scheduler'ом по расписанию.
        Обрабатывает ошибки и логирует результаты.
        """
        # Проверяем, что не запущена другая синхронизация
        if self.current_sync_task and not self.current_sync_task.done():
            logger.warning("sync_job_skipped_previous_still_running")
            return
        
        # Создаем задачу для синхронизации
        self.current_sync_task = asyncio.create_task(self._run_sync())
        
        try:
            await self.current_sync_task
        except Exception as e:
            logger.error(
                "sync_job_failed",
                error=str(e),
                exc_info=True
            )
    
    async def _run_sync(self) -> None:
        """
        Внутренний метод для выполнения синхронизации
        
        Вызывает SyncService.sync_all_sheets() и обрабатывает результат.
        """
        try:
            logger.info("sync_job_started")
            
            # Выполняем синхронизацию
            stats = await self.sync_service.sync_all_sheets()
            
            # Логируем результаты
            logger.info(
                "sync_job_completed",
                sheets_processed=stats['sheets_processed'],
                sheets_failed=stats['sheets_failed'],
                total_records=stats['total_records'],
                new_records=stats['new_records'],
                updated_records=stats['updated_records'],
                errors_count=len(stats['errors']),
                elapsed_seconds=stats['elapsed_seconds']
            )
            
            # Если были ошибки, логируем их детали
            if stats['errors']:
                for error_info in stats['errors']:
                    logger.warning(
                        "sync_sheet_error_detail",
                        sheet_name=error_info['sheet_name'],
                        error_type=error_info['error_type'],
                        error=error_info['error']
                    )
            
        except Exception as e:
            logger.error(
                "sync_job_execution_failed",
                error=str(e),
                exc_info=True
            )
            # Не пробрасываем исключение - scheduler продолжит работу


def setup_signal_handlers(worker: SyncWorker, loop: asyncio.AbstractEventLoop) -> None:
    """
    Настраивает обработчики сигналов для graceful shutdown
    
    Args:
        worker: Экземпляр SyncWorker
        loop: Event loop
    """
    def signal_handler(signum: int) -> None:
        """Обработчик сигналов SIGTERM и SIGINT"""
        signal_name = signal.Signals(signum).name
        logger.info(
            "signal_received",
            signal=signal_name
        )
        
        # Создаем задачу для остановки worker
        asyncio.create_task(worker.stop())
    
    # Регистрируем обработчики для SIGTERM и SIGINT
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda s=sig: signal_handler(s))
    
    logger.info("signal_handlers_registered")


async def main() -> None:
    """
    Точка входа для sync worker
    
    Создает worker, настраивает обработчики сигналов и запускает синхронизацию.
    """
    # Настраиваем логирование через новую конфигурацию
    import os
    log_level = os.getenv('LOG_LEVEL', 'INFO')
    json_logs = os.getenv('JSON_LOGS', 'false').lower() == 'true'
    configure_logging(log_level=log_level, json_logs=json_logs)
    
    logger.info("sync_worker_main_started")
    
    # Создаем worker
    worker = SyncWorker()
    
    # Получаем event loop
    loop = asyncio.get_event_loop()
    
    # Настраиваем обработчики сигналов (только для Unix-подобных систем)
    if sys.platform != 'win32':
        setup_signal_handlers(worker, loop)
    else:
        logger.warning("signal_handlers_not_supported_on_windows")
    
    try:
        # Запускаем worker
        await worker.start()
    except KeyboardInterrupt:
        logger.info("keyboard_interrupt_received")
        await worker.stop()
    except Exception as e:
        logger.error(
            "sync_worker_main_failed",
            error=str(e),
            exc_info=True
        )
        await worker.stop()
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
