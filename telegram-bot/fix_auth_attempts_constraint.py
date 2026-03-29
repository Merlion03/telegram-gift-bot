"""
Скрипт для удаления foreign key constraint из таблицы auth_attempts

Удаляет constraint fk_admin, чтобы разрешить запись попыток входа
для несуществующих tg_id (защита от перебора)
"""
import asyncio
import os
from database.asyncpg_connection import get_asyncpg_pool


async def fix_constraint():
    """Удаляет foreign key constraint из auth_attempts"""
    # Инициализируем pool
    db_host = 'localhost'
    db_port = os.getenv('DB_PORT', '5433')
    db_name = os.getenv('DB_NAME', 'telegram_bot')
    db_user = os.getenv('DB_USER', 'postgres')
    db_password = os.getenv('DB_PASSWORD', 'postgres')
    
    database_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    
    pool_instance = get_asyncpg_pool()
    await pool_instance.initialize(database_url=database_url, min_size=2, max_size=5)
    
    pool = pool_instance.get_pool()
    
    try:
        async with pool.acquire() as conn:
            # Удаляем constraint если существует
            await conn.execute(
                """
                ALTER TABLE auth_attempts
                DROP CONSTRAINT IF EXISTS fk_admin
                """
            )
            print("✓ Foreign key constraint fk_admin удалён из auth_attempts")
    
    except Exception as e:
        print(f"✗ Ошибка: {e}")
        raise
    
    finally:
        await pool_instance.close()


if __name__ == "__main__":
    asyncio.run(fix_constraint())
