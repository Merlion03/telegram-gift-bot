import asyncio
import asyncpg

async def apply_migration():
    conn = await asyncpg.connect('postgresql://postgres:postgres@localhost:5433/telegram_bot')
    
    with open('database/migrations/013_add_is_archived_to_prizes.sql', 'r', encoding='utf-8') as f:
        migration_sql = f.read()
    
    # Разбиваем на отдельные команды
    commands = [cmd.strip() for cmd in migration_sql.split(';') if cmd.strip() and not cmd.strip().startswith('--')]
    
    for cmd in commands:
        if cmd:
            try:
                await conn.execute(cmd)
                print(f"✓ Выполнено: {cmd[:50]}...")
            except Exception as e:
                print(f"✗ Ошибка: {e}")
                print(f"  Команда: {cmd[:100]}...")
    
    await conn.close()
    print("\n✓ Миграция применена успешно!")

if __name__ == '__main__':
    asyncio.run(apply_migration())
