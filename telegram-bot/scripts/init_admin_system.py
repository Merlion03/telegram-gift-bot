"""
Скрипт для инициализации системы авторизации администраторов

Выполняет:
1. Применение миграции 009_create_admin_tables.sql
2. Создание первого администратора (Developer) из переменных окружения
3. Установка начальной конфигурации в system_config

Использование:
    source venv/bin/activate && python telegram-bot/scripts/init_admin_system.py
    
Переменные окружения:
    ADMIN_TG_ID - Telegram ID первого администратора (обязательно)
    ADMIN_USERNAME - Telegram username первого администратора (обязательно)
"""
import asyncio
import sys
from pathlib import Path

# Добавляем корневую директорию в путь для импорта модулей
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.connection import DatabaseConnection
from sqlalchemy import text
import os
from dotenv import load_dotenv

# Загружаем переменные окружения
env_path = Path(__file__).parent.parent.parent / '.env'
load_dotenv(env_path)


async def apply_migration(session):
    """Применяет миграцию 009_create_admin_tables.sql"""
    
    migration_path = Path(__file__).parent.parent / 'database' / 'migrations' / '009_create_admin_tables.sql'
    
    with open(migration_path, 'r', encoding='utf-8') as f:
        migration_sql = f.read()
    
    print("\n=== Применение миграции 009_create_admin_tables.sql ===\n")
    
    # Разбиваем на отдельные команды (по точке с запятой)
    commands = [cmd.strip() for cmd in migration_sql.split(';') if cmd.strip() and not cmd.strip().startswith('--')]
    
    for i, command in enumerate(commands, 1):
        if command:
            print(f"\nВыполнение команды {i}/{len(commands)}:")
            # Показываем первые 100 символов команды
            preview = command[:100].replace('\n', ' ')
            print(f"{preview}...")
            
            await session.execute(text(command))
            await session.commit()
            
            print("✓ Успешно")
    
    print("\n=== Миграция успешно применена ===")


async def create_first_admin(session):
    """Создаёт первого администратора (Developer) из переменных окружения"""
    
    admin_tg_id = os.getenv('ADMIN_TG_ID')
    admin_username = os.getenv('ADMIN_USERNAME')
    
    if not admin_tg_id or not admin_username:
        print("\n⚠ ВНИМАНИЕ: Переменные ADMIN_TG_ID и ADMIN_USERNAME не установлены")
        print("Первый администратор не будет создан автоматически")
        print("Используйте скрипт add_admin.py для добавления администратора вручную")
        return
    
    try:
        admin_tg_id = int(admin_tg_id)
    except ValueError:
        print(f"\n✗ Ошибка: ADMIN_TG_ID должен быть числом, получено: {admin_tg_id}")
        return
    
    print(f"\n=== Создание первого администратора ===")
    print(f"Telegram ID: {admin_tg_id}")
    print(f"Username: {admin_username}")
    print(f"Role: 0 (Developer)")
    
    # Проверяем, существует ли уже администратор
    result = await session.execute(
        text("SELECT tg_id FROM administrators WHERE tg_id = :tg_id"),
        {"tg_id": admin_tg_id}
    )
    existing = result.fetchone()
    
    if existing:
        print(f"\n⚠ Администратор с tg_id={admin_tg_id} уже существует, пропускаем создание")
        return
    
    # Создаём первого администратора с ролью Developer (0)
    await session.execute(
        text("""
            INSERT INTO administrators (tg_id, username, role, password_hash)
            VALUES (:tg_id, :username, :role, NULL)
        """),
        {
            "tg_id": admin_tg_id,
            "username": admin_username,
            "role": 0  # Developer
        }
    )
    await session.commit()
    
    print("✓ Первый администратор успешно создан")
    print("  Пароль не установлен (password_hash = NULL)")
    print("  При первом входе в WebApp будет предложено установить пароль")


async def verify_config(session):
    """Проверяет наличие начальной конфигурации в system_config"""
    
    print("\n=== Проверка конфигурации ===")
    
    result = await session.execute(
        text("SELECT key, value FROM system_config WHERE key = 'session_lifetime_hours'")
    )
    config = result.fetchone()
    
    if config:
        print(f"✓ Конфигурация session_lifetime_hours = {config[1]} часов")
    else:
        print("⚠ Конфигурация session_lifetime_hours не найдена (должна быть создана миграцией)")


async def main():
    """Главная функция инициализации"""
    
    # Параметры подключения
    db_host = os.getenv('DB_HOST', 'localhost')
    db_port = os.getenv('DB_PORT', '5432')
    db_name = os.getenv('DB_NAME', 'telegram_bot')
    db_user = os.getenv('DB_USER', 'postgres')
    db_password = os.getenv('DB_PASSWORD', 'postgres')
    
    database_url = f'postgresql+asyncpg://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}'
    
    print("=" * 80)
    print("ИНИЦИАЛИЗАЦИЯ СИСТЕМЫ АВТОРИЗАЦИИ АДМИНИСТРАТОРОВ")
    print("=" * 80)
    print(f"\nПодключение к БД: {db_host}:{db_port}/{db_name}")
    
    # Создаём подключение
    db = DatabaseConnection(database_url, echo=False)
    session = db.get_session()
    
    try:
        # Шаг 1: Применяем миграцию
        await apply_migration(session)
        
        # Шаг 2: Создаём первого администратора
        await create_first_admin(session)
        
        # Шаг 3: Проверяем конфигурацию
        await verify_config(session)
        
        print("\n" + "=" * 80)
        print("✓ ИНИЦИАЛИЗАЦИЯ ЗАВЕРШЕНА УСПЕШНО")
        print("=" * 80)
        print("\nСледующие шаги:")
        print("1. Запустите Telegram Bot: source venv/bin/activate && python telegram-bot/main.py")
        print("2. Запустите Next.js: cd nextjs-app && npm run dev")
        print("3. Отправьте /start боту от имени администратора")
        print("4. Откройте WebApp и установите пароль")
        
    except Exception as e:
        print(f"\n✗ Ошибка при инициализации: {e}")
        await session.rollback()
        raise
    finally:
        await session.close()
        await db.close()


if __name__ == '__main__':
    asyncio.run(main())
