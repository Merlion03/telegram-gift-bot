"""
Простой скрипт для удаления данных пользователя через asyncpg

Использует прямое подключение без зависимостей от других модулей
"""
import asyncio
import asyncpg
import sys
import os


async def delete_user_data(telegram_id: int):
    """
    Удаляет все данные пользователя из базы данных
    
    Args:
        telegram_id: Telegram ID пользователя
    """
    # Получаем параметры подключения из переменных окружения
    db_host = os.getenv('DB_HOST', 'localhost')
    db_port = os.getenv('DB_PORT', '5432')
    db_name = os.getenv('DB_NAME', 'telegram_bot')
    db_user = os.getenv('DB_USER', 'botuser')
    db_password = os.getenv('DB_PASSWORD', 'changeme')
    
    # Формируем DSN
    dsn = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    
    print(f"\nПодключение к базе данных: {db_host}:{db_port}/{db_name}")
    
    try:
        # Подключаемся к базе данных
        conn = await asyncpg.connect(dsn)
        
        print(f"✓ Подключение установлено")
        print(f"\nУдаление данных пользователя {telegram_id}...\n")
        
        stats = {}
        
        # Начинаем транзакцию
        async with conn.transaction():
            # 1. Удаляем призы (включая архивированные)
            result = await conn.execute(
                "DELETE FROM prizes WHERE telegram_id = $1",
                telegram_id
            )
            stats['prizes'] = int(result.split()[-1])
            print(f"  Призы: {stats['prizes']} записей удалено")
            
            # 2. Удаляем GDPR согласия
            result = await conn.execute(
                "DELETE FROM gdpr_consents WHERE telegram_id = $1",
                telegram_id
            )
            stats['gdpr_consents'] = int(result.split()[-1])
            print(f"  GDPR согласия: {stats['gdpr_consents']} записей удалено")
            
            # 3. Удаляем сообщения поддержки
            result = await conn.execute(
                "DELETE FROM support_messages WHERE telegram_id = $1",
                telegram_id
            )
            stats['support_messages'] = int(result.split()[-1])
            print(f"  Сообщения поддержки: {stats['support_messages']} записей удалено")
            
            # 4. Удаляем сессии поддержки
            result = await conn.execute(
                "DELETE FROM support_sessions WHERE telegram_id = $1",
                telegram_id
            )
            stats['support_sessions'] = int(result.split()[-1])
            print(f"  Сессии поддержки: {stats['support_sessions']} записей удалено")
        
        await conn.close()
        
        total = sum(stats.values())
        print(f"\n✅ Удаление завершено! Всего удалено: {total} записей")
        
        return stats
        
    except Exception as e:
        print(f"\n❌ Ошибка: {e}")
        raise


async def main():
    """Главная функция"""
    if len(sys.argv) < 2:
        print("\nИспользование: python delete_user_simple.py <telegram_id>")
        print("Пример: python delete_user_simple.py 712309051\n")
        sys.exit(1)
    
    try:
        telegram_id = int(sys.argv[1])
    except ValueError:
        print("\n❌ Ошибка: telegram_id должен быть числом\n")
        sys.exit(1)
    
    print("\n" + "="*60)
    print(f"  УДАЛЕНИЕ ДАННЫХ ПОЛЬЗОВАТЕЛЯ {telegram_id}")
    print("="*60)
    print("\n⚠️  ВНИМАНИЕ: Это действие необратимо!")
    print("\nБудут удалены данные из таблиц:")
    print("  • prizes (включая архивированные записи)")
    print("  • gdpr_consents")
    print("  • support_sessions")
    print("  • support_messages")
    
    # В Docker режиме автоматически подтверждаем
    if os.getenv('DOCKER_MODE') == 'true':
        confirm = 'YES'
    else:
        confirm = input("\nВы уверены? Введите 'YES' для подтверждения: ")
    
    if confirm != 'YES':
        print("\n❌ Отменено\n")
        sys.exit(0)
    
    await delete_user_data(telegram_id)
    
    print("\n" + "="*60)
    print("  ГОТОВО!")
    print("="*60 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
