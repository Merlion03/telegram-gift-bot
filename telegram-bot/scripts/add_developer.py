"""
Скрипт для добавления разработчика в систему

Использование:
    python scripts/add_developer.py <telegram_id> <username>
    
Пример:
    python scripts/add_developer.py 712309051 Merlion0
"""
import asyncio
import asyncpg
import sys
from pathlib import Path
from datetime import datetime, timezone

# Добавляем корневую директорию в путь для импорта config
sys.path.insert(0, str(Path(__file__).parent.parent))

from config import get_config


async def add_developer(tg_id: int, username: str):
    """Добавляет разработчика в систему"""
    config = get_config()
    
    # Формируем строку подключения
    db_url = f"postgresql://{config.database.user}:{config.database.password}@{config.database.host}:{config.database.port}/{config.database.name}"
    
    print(f"Подключение к базе данных: {config.database.host}:{config.database.port}/{config.database.name}\n")
    
    try:
        conn = await asyncpg.connect(db_url)
        
        # Проверяем, существует ли уже администратор с таким tg_id
        exists = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM administrators WHERE tg_id = $1)",
            tg_id
        )
        
        if exists:
            # Получаем информацию о существующем администраторе
            admin = await conn.fetchrow(
                "SELECT tg_id, username, role FROM administrators WHERE tg_id = $1",
                tg_id
            )
            role_names = {
                0: "Developer",
                1: "Assistant",
                2: "Administrator",
                3: "Operator"
            }
            print(f"⚠️  Администратор уже существует:")
            print(f"   Telegram ID: {admin['tg_id']}")
            print(f"   Username:    @{admin['username']}")
            print(f"   Роль:        {role_names.get(admin['role'], 'Unknown')}")
            print("\nДля обновления используйте другой скрипт или удалите существующую запись.")
        else:
            # Создаём нового разработчика (role=0)
            now = datetime.now(timezone.utc)
            
            await conn.execute(
                """
                INSERT INTO administrators (tg_id, username, role, password_hash, created_at, updated_at)
                VALUES ($1, $2, 0, NULL, $3, $4)
                """,
                tg_id, username, now, now
            )
            
            print(f"✓ Разработчик успешно добавлен!")
            print(f"  Telegram ID: {tg_id}")
            print(f"  Username:    @{username}")
            print(f"  Роль:        Developer (0)")
            print(f"  Пароль:      Не установлен (будет установлен при первом входе)")
        
        await conn.close()
        
    except Exception as e:
        print(f"\n✗ Ошибка добавления разработчика: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Использование: python scripts/add_developer.py <telegram_id> <username>")
        print("Пример: python scripts/add_developer.py 712309051 Merlion0")
        sys.exit(1)
    
    try:
        tg_id = int(sys.argv[1])
        username = sys.argv[2]
        
        asyncio.run(add_developer(tg_id, username))
    except ValueError:
        print("✗ Ошибка: telegram_id должен быть числом")
        sys.exit(1)
