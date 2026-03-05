#!/usr/bin/env python3
"""
Скрипт для автоматического закрытия неактивных сессий

Использование:
    python scripts/close_inactive_sessions.py [--hours HOURS]

Аргументы:
    --hours: Количество часов неактивности (по умолчанию 24)

Примеры:
    python scripts/close_inactive_sessions.py
    python scripts/close_inactive_sessions.py --hours 48
"""

import asyncio
import argparse
import sys
from pathlib import Path

# Добавляем корневую директорию проекта в путь
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from database.connection import init_database
from database.repository import SupportRepository
from services.session_manager import SessionManager
from utils.logger import get_logger, configure_logging
from config import get_config

# Инициализируем логгер
logger = get_logger(__name__)


async def main(inactive_hours: int = 24) -> int:
    """
    Основная функция для закрытия неактивных сессий
    
    Args:
        inactive_hours: Количество часов неактивности
        
    Returns:
        Количество закрытых сессий
    """
    logger.info(
        "starting_inactive_sessions_cleanup",
        inactive_hours=inactive_hours
    )
    
    # Получаем конфигурацию и инициализируем подключение к БД
    cfg = get_config()
    db = init_database(cfg.database.connection_url)
    
    try:
        # Получаем сессию БД через context manager
        async with db.session() as db_session:
            # Создаём репозиторий и менеджер
            repository = SupportRepository(db_session)
            session_manager = SessionManager(repository)
            
            # Закрываем неактивные сессии
            closed_count = await session_manager.close_inactive_sessions(
                inactive_hours=inactive_hours
            )
            
            logger.info(
                "inactive_sessions_cleanup_finished",
                closed_count=closed_count,
                inactive_hours=inactive_hours
            )
            
            return closed_count
            
    except Exception as e:
        logger.error(
            "inactive_sessions_cleanup_failed",
            inactive_hours=inactive_hours,
            error=str(e),
            exc_info=True
        )
        raise
    finally:
        # Закрываем соединения с БД
        await db.close()


if __name__ == "__main__":
    # Инициализация логирования
    configure_logging(log_level='INFO', json_format=False)
    
    # Парсинг аргументов командной строки
    parser = argparse.ArgumentParser(
        description="Закрытие неактивных сессий диалогов"
    )
    parser.add_argument(
        "--hours",
        type=int,
        default=24,
        help="Количество часов неактивности (по умолчанию 24)"
    )
    
    args = parser.parse_args()
    
    # Валидация аргументов
    if args.hours <= 0:
        logger.error(
            "invalid_hours_argument",
            hours=args.hours
        )
        print(f"Ошибка: количество часов должно быть положительным числом")
        sys.exit(1)
    
    # Запуск основной функции
    try:
        closed_count = asyncio.run(main(args.hours))
        print(f"Закрыто сессий: {closed_count}")
        sys.exit(0)
    except Exception as e:
        print(f"Ошибка выполнения: {e}")
        sys.exit(1)
