"""
Скрипт для добавления нового администратора в систему

Создаёт запись в таблице administrators с password_hash = NULL.
Триггер notify_new_admin() автоматически отправит уведомление пользователю в Telegram.

Использование:
    source venv/bin/activate && python telegram-bot/scripts/add_admin.py <tg_id> <username> <role>
    
Аргументы:
    tg_id - Telegram ID администратора (число)
    username - Telegram username администратора (строка)
    role - Уровень роли: 0=Developer, 1=Assistant, 2=Administrator, 3=Operator
    
Примеры:
    python telegram-bot/scripts/add_admin.py 123456789 john_doe 2
    python telegram-bot/scripts/add_admin.py 987654321 jane_smith 3
    
Requirements: 5.1, 5.4
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


# Маппинг ролей для удобства
ROLE_NAMES = {
    0: "Developer (Разработчик)",
    1: "Assistant (Помощник)",
    2: "Administrator (Администратор)",
    3: "Operator (Оператор)"
}


def print_usage():
    """Выводит справку по использованию скрипта"""
    print("\nИспользование:")
    print("  python telegram-bot/scripts/add_admin.py <tg_id> <username> <role>")
    print("\nАргументы:")
    print("  tg_id    - Telegram ID администратора (число)")
    print("  username - Telegram username администратора (строка)")
    print("  role     - Уровень роли (0-3):")
    print("             0 = Developer (Разработчик)")
    print("             1 = Assistant (Помощник)")
    print("             2 = Administrator (Администратор)")
    print("             3 = Operator (Оператор)")
    print("\nПримеры:")
    print("  python telegram-bot/scripts/add_admin.py 123456789 john_doe 2")
    print("  python telegram-bot/scripts/add_admin.py 987654321 jane_smith 3")


def validate_arguments():
    """Валидирует аргументы командной строки"""
    
    if len(sys.argv) != 4:
        print("✗ Ошибка: Неверное количество аргументов")
        print_usage()
        sys.exit(1)
    
    # Валидация tg_id
    try:
        tg_id = int(sys.argv[1])
    except ValueError:
        print(f"✗ Ошибка: tg_id должен быть числом, получено: {sys.argv[1]}")
        print_usage()
        sys.exit(1)
    
    # Валидация username
    username = sys.argv[2].strip()
    if not username:
        print("✗ Ошибка: username не может быть пустым")
        print_usage()
        sys.exit(1)
    
    # Валидация role
    try:
        role = int(sys.argv[3])
        if role < 0 or role > 3:
            raise ValueError("role должен быть в диапазоне 0-3")
    except ValueError as e:
        print(f"✗ Ошибка: {e}")
        print_usage()
        sys.exit(1)
    
    return tg_id, username, role


async def add_administrator(tg_id: int, username: str, role: int):
    """Добавляет нового администратора в систему"""
    
    # Параметры подключения
    db_host = os.getenv('DB_HOST', 'localhost')
    db_port = os.getenv('DB_PORT', '5432')
    db_name = os.getenv('DB_NAME', 'telegram_bot')
    db_user = os.getenv('DB_USER', 'postgres')
    db_password = os.getenv('DB_PASSWORD', 'postgres')
    
    database_url = f'postgresql+asyncpg://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}'
    
    print("=" * 80)
    print("ДОБАВЛЕНИЕ НОВОГО АДМИНИСТРАТОРА")
    print("=" * 80)
    print(f"\nПодключение к БД: {db_host}:{db_port}/{db_name}")
    
    # Создаём подключение
    db = DatabaseConnection(database_url, echo=False)
    session = db.get_session()
    
    try:
        # Проверяем, существует ли уже администратор
        result = await session.execute(
            text("SELECT tg_id, username, role FROM administrators WHERE tg_id = :tg_id"),
            {"tg_id": tg_id}
        )
        existing = result.fetchone()
        
        if existing:
            print(f"\n✗ Ошибка: Администратор с tg_id={tg_id} уже существует")
            print(f"  Username: {existing[1]}")
            print(f"  Role: {existing[2]} ({ROLE_NAMES.get(existing[2], 'Unknown')})")
            sys.exit(1)
        
        # Создаём нового администратора
        print(f"\n=== Создание администратора ===")
        print(f"Telegram ID: {tg_id}")
        print(f"Username: {username}")
        print(f"Role: {role} ({ROLE_NAMES.get(role, 'Unknown')})")
        print(f"Password: не установлен (password_hash = NULL)")
        
        await session.execute(
            text("""
                INSERT INTO administrators (tg_id, username, role, password_hash)
                VALUES (:tg_id, :username, :role, NULL)
            """),
            {
                "tg_id": tg_id,
                "username": username,
                "role": role
            }
        )
        await session.commit()
        
        print("\n✓ Администратор успешно создан")
        print("\n📨 Триггер notify_new_admin() автоматически отправит уведомление в Telegram")
        print("   (убедитесь, что Telegram Bot запущен для получения уведомления)")
        print("\nСледующие шаги:")
        print("1. Пользователь получит уведомление в Telegram с кнопкой WebApp")
        print("2. При первом входе в WebApp будет предложено установить пароль")
        print("3. После установки пароля администратор получит полный доступ")
        
    except Exception as e:
        print(f"\n✗ Ошибка при создании администратора: {e}")
        await session.rollback()
        raise
    finally:
        await session.close()
        await db.close()


async def main():
    """Главная функция"""
    
    # Валидируем аргументы
    tg_id, username, role = validate_arguments()
    
    # Добавляем администратора
    await add_administrator(tg_id, username, role)


if __name__ == '__main__':
    asyncio.run(main())
