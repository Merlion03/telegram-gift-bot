"""
Скрипт для полного удаления данных пользователя из всех таблиц

Удаляет данные пользователя из:
- prizes (включая архивированные записи)
- gdpr_consents
- support_sessions (и связанные support_messages через CASCADE)
"""
import asyncio
import sys
import os
from pathlib import Path

# Добавляем корневую директорию в PYTHONPATH
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.asyncpg_connection import initialize_asyncpg_pool, close_asyncpg_pool
from config import settings
import structlog

logger = structlog.get_logger()


async def delete_user_data(telegram_id: int) -> dict:
    """
    Полностью удаляет все данные пользователя из базы данных
    
    Args:
        telegram_id: Telegram ID пользователя для удаления
    
    Returns:
        dict: Статистика удаления по таблицам
    """
    # Инициализируем connection pool
    pool_manager = await initialize_asyncpg_pool()
    pool = pool_manager.get_pool()
    
    stats = {
        'prizes': 0,
        'gdpr_consents': 0,
        'support_messages': 0,
        'support_sessions': 0
    }
    
    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                # 1. Удаляем призы (включая архивированные)
                result = await conn.execute(
                    "DELETE FROM prizes WHERE telegram_id = $1",
                    telegram_id
                )
                stats['prizes'] = int(result.split()[-1])
                
                # 2. Удаляем GDPR согласия
                result = await conn.execute(
                    "DELETE FROM gdpr_consents WHERE telegram_id = $1",
                    telegram_id
                )
                stats['gdpr_consents'] = int(result.split()[-1])
                
                # 3. Удаляем сообщения поддержки
                result = await conn.execute(
                    "DELETE FROM support_messages WHERE telegram_id = $1",
                    telegram_id
                )
                stats['support_messages'] = int(result.split()[-1])
                
                # 4. Удаляем сессии поддержки (CASCADE удалит связанные сообщения)
                result = await conn.execute(
                    "DELETE FROM support_sessions WHERE telegram_id = $1",
                    telegram_id
                )
                stats['support_sessions'] = int(result.split()[-1])
                
                logger.info(
                    "user_data_deleted",
                    telegram_id=telegram_id,
                    stats=stats
                )
                
    finally:
        await close_asyncpg_pool()
    
    return stats


async def main():
    """Главная функция скрипта"""
    if len(sys.argv) < 2:
        print("Использование: python delete_user_data.py <telegram_id>")
        print("Пример: python delete_user_data.py 712309051")
        sys.exit(1)
    
    try:
        telegram_id = int(sys.argv[1])
    except ValueError:
        print("Ошибка: telegram_id должен быть числом")
        sys.exit(1)
    
    print(f"\n⚠️  ВНИМАНИЕ: Вы собираетесь удалить ВСЕ данные пользователя {telegram_id}")
    print("Это действие необратимо!")
    print("\nБудут удалены данные из таблиц:")
    print("  - prizes (включая архивированные записи)")
    print("  - gdpr_consents")
    print("  - support_sessions")
    print("  - support_messages")
    
    confirm = input("\nВы уверены? Введите 'YES' для подтверждения: ")
    
    if confirm != 'YES':
        print("Отменено")
        sys.exit(0)
    
    print(f"\nУдаление данных пользователя {telegram_id}...")
    
    stats = await delete_user_data(telegram_id)
    
    print("\n✅ Удаление завершено!")
    print("\nСтатистика:")
    print(f"  - Призы: {stats['prizes']} записей")
    print(f"  - GDPR согласия: {stats['gdpr_consents']} записей")
    print(f"  - Сессии поддержки: {stats['support_sessions']} записей")
    print(f"  - Сообщения поддержки: {stats['support_messages']} записей")
    print(f"\nВсего удалено: {sum(stats.values())} записей")


if __name__ == "__main__":
    asyncio.run(main())
