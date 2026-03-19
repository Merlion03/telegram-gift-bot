#!/usr/bin/env python3
"""
Скрипт миграции данных для поддержки чтения code_word из столбца B в Google Sheets

Этот скрипт выполняет одноразовую миграцию существующих данных в PostgreSQL
для соответствия новой структуре, где code_word читается из отдельного столбца B
вместо использования названия листа (sheet_name).

Функциональность:
- Создание резервной копии данных перед миграцией
- Проверка корректности существующих данных
- Подсчёт записей, требующих обновления
- Логирование статистики выполнения
- Возврат детального статуса выполнения

Примечание: В текущей реализации все записи уже имеют code_word = sheet_name,
поэтому фактически обновлять нечего. Скрипт нужен для:
- Проверки целостности данных
- Создания резервной копии перед развёртыванием новой версии
- Документирования процесса миграции
"""

import asyncio
import logging
import sys
import os
from pathlib import Path
from typing import Dict, Any, List
from datetime import datetime, timezone

# Добавляем корневую директорию проекта в PYTHONPATH
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database.connection import init_database, get_database
from config import get_config


# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


async def create_backup_table(session: AsyncSession) -> bool:
    """
    Создаёт резервную копию таблицы prizes перед миграцией
    
    Args:
        session: Асинхронная сессия SQLAlchemy
    
    Returns:
        bool: True если резервная копия успешно создана
    
    Raises:
        Exception: При ошибке создания резервной копии
    """
    try:
        logger.info("Создание резервной копии таблицы prizes...")
        
        # Удаляем старую резервную копию, если существует
        await session.execute(text("DROP TABLE IF EXISTS prizes_backup"))
        
        # Создаём новую резервную копию
        await session.execute(text("""
            CREATE TABLE prizes_backup AS 
            SELECT * FROM prizes
        """))
        
        # Подсчитываем количество скопированных записей
        result = await session.execute(text("SELECT COUNT(*) FROM prizes_backup"))
        backup_count = result.scalar()
        
        await session.commit()
        
        logger.info(f"✅ Резервная копия создана успешно. Скопировано записей: {backup_count}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Ошибка при создании резервной копии: {e}", exc_info=True)
        await session.rollback()
        raise


async def check_and_count_records(session: AsyncSession) -> Dict[str, int]:
    """
    Проверяет и подсчитывает записи, требующие обновления
    
    Args:
        session: Асинхронная сессия SQLAlchemy
    
    Returns:
        Dict с ключами:
        - total_records: общее количество записей
        - records_with_matching_code_word: записи где code_word == sheet_name
        - records_with_different_code_word: записи где code_word != sheet_name
        - records_with_empty_code_word: записи с пустым code_word
    
    Raises:
        Exception: При ошибке проверки данных
    """
    try:
        logger.info("Проверка существующих данных...")
        
        # Общее количество записей
        result = await session.execute(text("SELECT COUNT(*) FROM prizes"))
        total_records = result.scalar()
        
        # Записи где code_word == sheet_name (ожидаемое состояние)
        result = await session.execute(text("""
            SELECT COUNT(*) FROM prizes 
            WHERE code_word = sheet_name
        """))
        matching_records = result.scalar()
        
        # Записи где code_word != sheet_name (неожиданное состояние)
        result = await session.execute(text("""
            SELECT COUNT(*) FROM prizes 
            WHERE code_word != sheet_name
        """))
        different_records = result.scalar()
        
        # Записи с пустым code_word (проблемные данные)
        result = await session.execute(text("""
            SELECT COUNT(*) FROM prizes 
            WHERE code_word IS NULL OR code_word = ''
        """))
        empty_code_word = result.scalar()
        
        stats = {
            'total_records': total_records,
            'records_with_matching_code_word': matching_records,
            'records_with_different_code_word': different_records,
            'records_with_empty_code_word': empty_code_word
        }
        
        logger.info(f"📊 Статистика данных:")
        logger.info(f"  - Всего записей: {total_records}")
        logger.info(f"  - Записей с code_word == sheet_name: {matching_records}")
        logger.info(f"  - Записей с code_word != sheet_name: {different_records}")
        logger.info(f"  - Записей с пустым code_word: {empty_code_word}")
        
        return stats
        
    except Exception as e:
        logger.error(f"❌ Ошибка при проверке данных: {e}", exc_info=True)
        raise


async def validate_data_integrity(session: AsyncSession) -> List[str]:
    """
    Проверяет целостность данных и выявляет потенциальные проблемы
    
    Args:
        session: Асинхронная сессия SQLAlchemy
    
    Returns:
        List[str]: Список предупреждений о проблемах с данными
    
    Raises:
        Exception: При ошибке валидации
    """
    warnings = []
    
    try:
        logger.info("Проверка целостности данных...")
        
        # Проверка на дубликаты (telegram_id, code_word)
        result = await session.execute(text("""
            SELECT telegram_id, code_word, COUNT(*) as count
            FROM prizes
            GROUP BY telegram_id, code_word
            HAVING COUNT(*) > 1
        """))
        duplicates = result.fetchall()
        
        if duplicates:
            warning = f"Найдено {len(duplicates)} дублирующихся комбинаций (telegram_id, code_word)"
            warnings.append(warning)
            logger.warning(f"⚠️ {warning}")
            for dup in duplicates[:5]:  # Показываем первые 5
                logger.warning(f"  - telegram_id={dup[0]}, code_word={dup[1]}, count={dup[2]}")
        
        # Проверка на пустые обязательные поля
        result = await session.execute(text("""
            SELECT COUNT(*) FROM prizes
            WHERE telegram_id IS NULL OR prize_type IS NULL
        """))
        invalid_records = result.scalar()
        
        if invalid_records > 0:
            warning = f"Найдено {invalid_records} записей с пустыми обязательными полями"
            warnings.append(warning)
            logger.warning(f"⚠️ {warning}")
        
        if not warnings:
            logger.info("✅ Проблем с целостностью данных не обнаружено")
        
        return warnings
        
    except Exception as e:
        logger.error(f"❌ Ошибка при валидации данных: {e}", exc_info=True)
        raise


async def migrate_code_word_column() -> Dict[str, Any]:
    """
    Выполняет миграцию данных для поддержки нового формата с code_word в столбце B
    
    Этапы миграции:
    1. Создание резервной копии данных
    2. Проверка и подсчёт записей
    3. Валидация целостности данных
    4. Возврат статистики выполнения
    
    Returns:
        Dict с ключами:
        - success: bool - успешность выполнения
        - records_checked: int - количество проверенных записей
        - records_updated: int - количество обновлённых записей (0 в текущей реализации)
        - backup_created: bool - создана ли резервная копия
        - errors: List[str] - список ошибок (если есть)
        - warnings: List[str] - список предупреждений
        - stats: Dict - детальная статистика
        - timestamp: str - время выполнения миграции
    
    Raises:
        Exception: При критической ошибке миграции
    """
    start_time = datetime.now(timezone.utc)
    errors = []
    warnings = []
    backup_created = False
    stats = {}
    
    try:
        logger.info("🚀 Начало миграции данных для code_word column")
        logger.info("=" * 60)
        
        # Инициализация подключения к БД
        config = get_config()
        db = init_database(
            database_url=config.database.connection_url,
            echo=False,
            pool_size=config.database.pool_size,
            max_overflow=config.database.max_overflow,
            pool_pre_ping=config.database.pool_pre_ping
        )
        
        logger.info(f"✅ Подключение к базе данных установлено")
        logger.info(f"   Database: {config.database.name}")
        logger.info(f"   Host: {config.database.host}:{config.database.port}")
        
        # Получаем сессию для работы с БД
        async with db.session() as session:
            # Этап 1: Создание резервной копии
            try:
                backup_created = await create_backup_table(session)
            except Exception as e:
                error_msg = f"Не удалось создать резервную копию: {str(e)}"
                errors.append(error_msg)
                logger.error(f"❌ {error_msg}")
                # Продолжаем выполнение для проверки данных
            
            # Этап 2: Проверка и подсчёт записей
            try:
                stats = await check_and_count_records(session)
            except Exception as e:
                error_msg = f"Не удалось проверить данные: {str(e)}"
                errors.append(error_msg)
                logger.error(f"❌ {error_msg}")
                raise
            
            # Этап 3: Валидация целостности данных
            try:
                data_warnings = await validate_data_integrity(session)
                warnings.extend(data_warnings)
            except Exception as e:
                warning_msg = f"Не удалось выполнить валидацию целостности: {str(e)}"
                warnings.append(warning_msg)
                logger.warning(f"⚠️ {warning_msg}")
        
        # Закрываем подключение к БД
        await db.close()
        
        # Формируем результат
        end_time = datetime.now(timezone.utc)
        duration = (end_time - start_time).total_seconds()
        
        result = {
            'success': len(errors) == 0,
            'records_checked': stats.get('total_records', 0),
            'records_updated': 0,  # В текущей реализации обновлений не требуется
            'backup_created': backup_created,
            'errors': errors,
            'warnings': warnings,
            'stats': stats,
            'timestamp': start_time.isoformat(),
            'duration_seconds': duration
        }
        
        # Итоговая статистика
        logger.info("=" * 60)
        logger.info("📋 Итоговая статистика миграции:")
        logger.info(f"  - Успешность: {'✅ Да' if result['success'] else '❌ Нет'}")
        logger.info(f"  - Проверено записей: {result['records_checked']}")
        logger.info(f"  - Обновлено записей: {result['records_updated']}")
        logger.info(f"  - Резервная копия создана: {'✅ Да' if backup_created else '❌ Нет'}")
        logger.info(f"  - Ошибок: {len(errors)}")
        logger.info(f"  - Предупреждений: {len(warnings)}")
        logger.info(f"  - Время выполнения: {duration:.2f} сек")
        logger.info("=" * 60)
        
        if result['success']:
            logger.info("✅ Миграция завершена успешно")
        else:
            logger.error("❌ Миграция завершена с ошибками")
        
        return result
        
    except Exception as e:
        logger.error(f"❌ Критическая ошибка при выполнении миграции: {e}", exc_info=True)
        errors.append(f"Критическая ошибка: {str(e)}")
        
        return {
            'success': False,
            'records_checked': stats.get('total_records', 0) if stats else 0,
            'records_updated': 0,
            'backup_created': backup_created,
            'errors': errors,
            'warnings': warnings,
            'stats': stats,
            'timestamp': start_time.isoformat(),
            'duration_seconds': (datetime.now(timezone.utc) - start_time).total_seconds()
        }


async def main():
    """Точка входа для выполнения скрипта"""
    try:
        result = await migrate_code_word_column()
        
        # Возвращаем код выхода на основе успешности
        if result['success']:
            sys.exit(0)
        else:
            sys.exit(1)
            
    except Exception as e:
        logger.error(f"❌ Неожиданная ошибка: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    print("🚀 Миграция данных: code_word column")
    print("=" * 60)
    asyncio.run(main())
