"""
Скрипт для проверки наличия таблиц системы авторизации администраторов
"""

import asyncio
import sys
import os

# Добавляем корневую директорию в путь для импорта модулей
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.asyncpg_connection import get_asyncpg_pool


async def check_admin_tables():
    """Проверяет наличие таблиц администраторов в базе данных"""
    
    print("=" * 80)
    print("Проверка таблиц системы авторизации администраторов")
    print("=" * 80)
    
    pool_manager = None
    conn = None
    try:
        # Инициализируем connection pool
        pool_manager = get_asyncpg_pool()
        await pool_manager.initialize()
        
        # Получаем соединение из пула
        pool = pool_manager.get_pool()
        conn = await pool.acquire()
        print("✓ Подключение к базе данных установлено")
        
        # Проверяем наличие таблиц
        tables_query = """
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('administrators', 'auth_attempts', 'system_config')
            ORDER BY table_name
        """
        
        tables = await conn.fetch(tables_query)
        table_names = [row['table_name'] for row in tables]
        
        print(f"\nНайдено таблиц: {len(table_names)}/3")
        
        expected_tables = ['administrators', 'auth_attempts', 'system_config']
        
        for table in expected_tables:
            if table in table_names:
                print(f"  ✓ {table}")
            else:
                print(f"  ✗ {table} - ОТСУТСТВУЕТ")
        
        # Проверяем структуру таблицы administrators
        if 'administrators' in table_names:
            print("\n" + "-" * 80)
            print("Структура таблицы administrators:")
            print("-" * 80)
            
            columns_query = """
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = 'administrators'
                ORDER BY ordinal_position
            """
            
            columns = await conn.fetch(columns_query)
            for col in columns:
                nullable = "NULL" if col['is_nullable'] == 'YES' else "NOT NULL"
                default = f" DEFAULT {col['column_default']}" if col['column_default'] else ""
                print(f"  - {col['column_name']}: {col['data_type']} {nullable}{default}")
        
        # Проверяем наличие триггера
        print("\n" + "-" * 80)
        print("Проверка триггера notify_new_admin:")
        print("-" * 80)
        
        trigger_query = """
            SELECT trigger_name, event_manipulation, action_statement
            FROM information_schema.triggers
            WHERE trigger_name = 'trigger_notify_new_admin'
        """
        
        triggers = await conn.fetch(trigger_query)
        if triggers:
            print(f"  ✓ Триггер trigger_notify_new_admin найден")
            for trigger in triggers:
                print(f"    Event: {trigger['event_manipulation']}")
        else:
            print(f"  ✗ Триггер trigger_notify_new_admin НЕ НАЙДЕН")
        
        # Проверяем начальную конфигурацию
        if 'system_config' in table_names:
            print("\n" + "-" * 80)
            print("Проверка начальной конфигурации:")
            print("-" * 80)
            
            config_query = """
                SELECT key, value
                FROM system_config
                WHERE key = 'session_lifetime_hours'
            """
            
            config = await conn.fetch(config_query)
            if config:
                print(f"  ✓ session_lifetime_hours = {config[0]['value']}")
            else:
                print(f"  ✗ session_lifetime_hours НЕ УСТАНОВЛЕН")
        
        print("\n" + "=" * 80)
        
        # Итоговый результат
        if len(table_names) == 3 and triggers:
            print("✓ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ УСПЕШНО")
            print("=" * 80)
            return True
        else:
            print("✗ ОБНАРУЖЕНЫ ПРОБЛЕМЫ - ТРЕБУЕТСЯ ПРИМЕНИТЬ МИГРАЦИЮ")
            print("=" * 80)
            return False
            
    except Exception as e:
        print(f"\n✗ ОШИБКА: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        if conn:
            pool = pool_manager.get_pool()
            await pool.release(conn)
            print("\nСоединение возвращено в пул")
        
        if pool_manager:
            await pool_manager.close()
            print("Connection pool закрыт")


if __name__ == "__main__":
    result = asyncio.run(check_admin_tables())
    sys.exit(0 if result else 1)
