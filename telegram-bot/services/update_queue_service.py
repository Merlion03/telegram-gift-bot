"""
Сервис очереди обновлений для асинхронной синхронизации PostgreSQL -> Google Sheets

Обеспечивает быстрый ответ пользователю и надежную синхронизацию данных в фоне.
"""
import asyncio
import time
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from dataclasses import dataclass
from enum import Enum

from services.google_sheets_service import GoogleSheetsService
from database.repositories.prize_repository import PrizeRepository
from utils.logging_config import get_logger

logger = get_logger(__name__)


class UpdateType(Enum):
    """Тип обновления"""
    PRIZE_CLAIMED = "prize_claimed"
    DELIVERY_DATA = "delivery_data"


@dataclass
class UpdateTask:
    """Задача обновления Google Sheets"""
    id: str
    update_type: UpdateType
    telegram_id: int
    code_word: str
    data: Dict[str, Any]
    created_at: datetime
    attempts: int = 0
    max_attempts: int = 3


class UpdateQueueService:
    """
    Сервис очереди обновлений для асинхронной синхронизации
    
    Принимает задачи на обновление Google Sheets и выполняет их в фоне,
    не блокируя основной поток обработки сообщений.
    """
    
    def __init__(
        self,
        google_sheets_service: GoogleSheetsService,
        prize_repository: Optional[PrizeRepository] = None
    ):
        """
        Инициализирует сервис очереди
        
        Args:
            google_sheets_service: Сервис для работы с Google Sheets
            prize_repository: Repository для работы с призами
        """
        self.google_sheets_service = google_sheets_service
        self.prize_repository = prize_repository or PrizeRepository()
        
        # Очередь задач
        self.queue: asyncio.Queue[UpdateTask] = asyncio.Queue()
        
        # Флаг работы воркера
        self.running = False
        self.worker_task: Optional[asyncio.Task] = None
        
        logger.info("update_queue_service_initialized")
    
    async def start(self) -> None:
        """Запускает воркер очереди"""
        if self.running:
            logger.warning("update_queue_already_running")
            return
        
        self.running = True
        self.worker_task = asyncio.create_task(self._worker())
        
        logger.info("update_queue_worker_started")
    
    async def stop(self) -> None:
        """Останавливает воркер очереди"""
        if not self.running:
            return
        
        self.running = False
        
        if self.worker_task:
            self.worker_task.cancel()
            try:
                await self.worker_task
            except asyncio.CancelledError:
                pass
        
        logger.info("update_queue_worker_stopped")
    
    async def add_prize_claimed_update(
        self,
        telegram_id: int,
        code_word: str,
        row_id: int,
        claimed_at: str
    ) -> None:
        """
        Добавляет задачу обновления статуса приза в очередь
        
        Args:
            telegram_id: Telegram ID пользователя
            code_word: Кодовое слово
            row_id: Номер строки в Google Sheets
            claimed_at: Время получения приза
        """
        task = UpdateTask(
            id=f"claimed_{telegram_id}_{code_word}_{int(time.time())}",
            update_type=UpdateType.PRIZE_CLAIMED,
            telegram_id=telegram_id,
            code_word=code_word,
            data={
                "row_id": row_id,
                "claimed_at": claimed_at
            },
            created_at=datetime.now(timezone.utc)
        )
        
        await self.queue.put(task)
        
        logger.info(
            "prize_claimed_update_queued",
            telegram_id=telegram_id,
            code_word=code_word,
            row_id=row_id,
            task_id=task.id
        )
    
    async def add_delivery_data_update(
        self,
        telegram_id: int,
        code_word: str,
        row_id: int,
        delivery_data: Dict[str, str]
    ) -> None:
        """
        Добавляет задачу обновления данных доставки в очередь
        
        Args:
            telegram_id: Telegram ID пользователя
            code_word: Кодовое слово
            row_id: Номер строки в Google Sheets
            delivery_data: Данные доставки
        """
        task = UpdateTask(
            id=f"delivery_{telegram_id}_{code_word}_{int(time.time())}",
            update_type=UpdateType.DELIVERY_DATA,
            telegram_id=telegram_id,
            code_word=code_word,
            data={
                "row_id": row_id,
                "delivery_data": delivery_data
            },
            created_at=datetime.now(timezone.utc)
        )
        
        await self.queue.put(task)
        
        logger.info(
            "delivery_data_update_queued",
            telegram_id=telegram_id,
            code_word=code_word,
            row_id=row_id,
            task_id=task.id
        )
    
    async def _worker(self) -> None:
        """
        Воркер очереди - обрабатывает задачи обновления в фоне
        """
        logger.info("update_queue_worker_loop_started")
        
        while self.running:
            try:
                # Ждем задачу из очереди с таймаутом
                try:
                    task = await asyncio.wait_for(self.queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue
                
                # Обрабатываем задачу
                await self._process_task(task)
                
                # Помечаем задачу как выполненную
                self.queue.task_done()
                
            except asyncio.CancelledError:
                logger.info("update_queue_worker_cancelled")
                break
            except Exception as e:
                logger.error(
                    "update_queue_worker_error",
                    error=str(e),
                    exc_info=True
                )
                # Продолжаем работу даже при ошибках
                continue
        
        logger.info("update_queue_worker_loop_stopped")
    
    async def _process_task(self, task: UpdateTask) -> None:
        """
        Обрабатывает одну задачу обновления
        
        Args:
            task: Задача для обработки
        """
        start_time = time.time()
        task.attempts += 1
        
        try:
            logger.info(
                "processing_update_task",
                task_id=task.id,
                update_type=task.update_type.value,
                telegram_id=task.telegram_id,
                code_word=task.code_word,
                attempt=task.attempts
            )
            
            if task.update_type == UpdateType.PRIZE_CLAIMED:
                await self._process_prize_claimed(task)
            elif task.update_type == UpdateType.DELIVERY_DATA:
                await self._process_delivery_data(task)
            else:
                logger.error(
                    "unknown_update_type",
                    task_id=task.id,
                    update_type=task.update_type.value
                )
                return
            
            elapsed_ms = (time.time() - start_time) * 1000
            
            logger.info(
                "update_task_completed",
                task_id=task.id,
                update_type=task.update_type.value,
                telegram_id=task.telegram_id,
                code_word=task.code_word,
                elapsed_ms=round(elapsed_ms, 2),
                attempt=task.attempts
            )
            
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            
            logger.error(
                "update_task_failed",
                task_id=task.id,
                update_type=task.update_type.value,
                telegram_id=task.telegram_id,
                code_word=task.code_word,
                error=str(e),
                elapsed_ms=round(elapsed_ms, 2),
                attempt=task.attempts,
                max_attempts=task.max_attempts,
                exc_info=True
            )
            
            # Повторяем попытку если не превышен лимит
            if task.attempts < task.max_attempts:
                # Добавляем задачу обратно в очередь с задержкой
                await asyncio.sleep(min(2 ** task.attempts, 30))  # Exponential backoff
                await self.queue.put(task)
                
                logger.info(
                    "update_task_retrying",
                    task_id=task.id,
                    attempt=task.attempts,
                    max_attempts=task.max_attempts
                )
            else:
                logger.error(
                    "update_task_max_attempts_exceeded",
                    task_id=task.id,
                    update_type=task.update_type.value,
                    telegram_id=task.telegram_id,
                    code_word=task.code_word,
                    attempts=task.attempts
                )
    
    async def _process_prize_claimed(self, task: UpdateTask) -> None:
        """
        Обрабатывает обновление статуса приза
        
        Args:
            task: Задача обновления
        """
        row_id = task.data["row_id"]
        claimed_at = task.data["claimed_at"]
        
        # Обновляем Google Sheets
        success = await self.google_sheets_service.save_delivery_data(
            row_id=row_id,
            delivery_data={"claimed_at": claimed_at},
            worksheet_name=task.code_word
        )
        
        if not success:
            raise RuntimeError(f"Failed to update Google Sheets for row {row_id}")
    
    async def _process_delivery_data(self, task: UpdateTask) -> None:
        """
        Обрабатывает обновление данных доставки
        
        Args:
            task: Задача обновления
        """
        row_id = task.data["row_id"]
        delivery_data = task.data["delivery_data"]
        
        # Обновляем Google Sheets
        success = await self.google_sheets_service.save_delivery_data(
            row_id=row_id,
            delivery_data=delivery_data,
            worksheet_name=task.code_word
        )
        
        if not success:
            raise RuntimeError(f"Failed to update delivery data for row {row_id}")
    
    async def get_queue_size(self) -> int:
        """Возвращает размер очереди"""
        return self.queue.qsize()
    
    async def wait_empty(self, timeout: float = 30.0) -> bool:
        """
        Ждет пока очередь не станет пустой
        
        Args:
            timeout: Максимальное время ожидания в секундах
        
        Returns:
            True если очередь опустела, False если таймаут
        """
        try:
            await asyncio.wait_for(self.queue.join(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            return False