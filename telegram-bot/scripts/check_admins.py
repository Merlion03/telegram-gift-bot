"""
Скрипт для проверки списка администраторов в базе данных

Использование:
    python scripts/check_admins.py
"""
import asyncio
import asyncpg
import sys
from pathlib import Path

# Добавляем корневую директорию в путь для импорта config
sys.path.insert(0, str(Path(__file__).parent.parent))

from config import get_config


async def check_admins():
    """Проверяет список администраторов"""
    config = get_config()
    
    # Формируем строку подключения
    db_url = f"postgresql://{config.database.user}:{config.database.password}@{config.database.host}:{config.database.port}/{config.database.name}"
    
    print(f"Подключение к базе данных: {config.database.host}:{config.database.port}/{config.database.name}\n")
    
    try:
        conn = await asyncpg.connect(db_url)
        
        # Получаем список всех администраторов
        admins = await conn.fetch("""
            SELECT tg_id, username, role, password_hash, created_at, updated_at
            FROM administrators
            ORDER BY role ASC, created_at ASC
        """)
        
        if not admins:
            print("❌ В базе данных нет администраторов\n")
        else:
            print(f"✓ Найдено администраторов: {len(admins)}\n")
            print("=" * 80)
            
            role_names = {
                0: "Developer (Разработчик)",
                1: "Assistant (Ассистент)",
                2: "Administrator (Администратор)",
                3: "Operator (Оператор)"
            }
            
            for admin in admins:
                role_name = role_names.get(admin['role'], f"Unknown ({admin['role']})")
                has_password = "✓ Да" if admin['password_hash'] else "✗ Нет"
                
                print(f"Telegram ID: {admin['tg_id']}")
                print(f"Username:    @{admin['username']}")
                print(f"Роль:        {role_name}")
                print(f"Пароль:      {has_password}")
                print(f"Создан:      {admin['created_at']}")
                print(f"Обновлён:    {admin['updated_at']}")
                print("=" * 80)
        
        await conn.close()
        
    except Exception as e:
        print(f"\n✗ Ошибка проверки администраторов: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(check_admins())
