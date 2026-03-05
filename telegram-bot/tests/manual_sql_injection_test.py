"""
Скрипт для ручного тестирования SQL-инъекций через Telegram бота

Этот скрипт отправляет потенциально опасные сообщения боту
для проверки защиты от SQL-инъекций в реальных условиях.

ИСПОЛЬЗОВАНИЕ:
1. Убедитесь, что бот запущен
2. Активируйте виртуальное окружение: venv\Scripts\activate (Windows)
3. Запустите скрипт: python tests/manual_sql_injection_test.py
4. Следуйте инструкциям в консоли
"""

import asyncio
import os
from aiogram import Bot
from aiogram.types import User
from dotenv import load_dotenv

# Загружаем переменные окружения
load_dotenv()


# Список потенциально опасных SQL-инъекций для тестирования
SQL_INJECTION_PAYLOADS = [
    # Базовые инъекции
    {
        "name": "DROP TABLE",
        "payload": "'; DROP TABLE support_sessions; --",
        "description": "Попытка удалить таблицу"
    },
    {
        "name": "OR 1=1",
        "payload": "' OR '1'='1",
        "description": "Классическая инъекция для обхода аутентификации"
    },
    {
        "name": "UNION SELECT",
        "payload": "' UNION SELECT * FROM support_messages --",
        "description": "Попытка извлечь данные из другой таблицы"
    },
    {
        "name": "Comment injection",
        "payload": "test'; -- comment",
        "description": "Инъекция с комментарием"
    },
    {
        "name": "Stacked query - DELETE",
        "payload": "'; DELETE FROM support_messages WHERE 1=1; --",
        "description": "Попытка удалить все сообщения"
    },
    {
        "name": "Stacked query - UPDATE",
        "payload": "'; UPDATE support_sessions SET status='closed'; --",
        "description": "Попытка закрыть все сессии"
    },
    {
        "name": "Time-based blind",
        "payload": "'; SELECT pg_sleep(5) --",
        "description": "Временная атака для определения уязвимости"
    },
    {
        "name": "Boolean-based blind",
        "payload": "' OR telegram_id IS NOT NULL --",
        "description": "Логическая атака"
    },
    {
        "name": "Escaped quotes",
        "payload": "test\\'",
        "description": "Попытка экранирования кавычек"
    },
    {
        "name": "Double quotes",
        "payload": "test''",
        "description": "Двойные кавычки"
    },
    {
        "name": "Special characters",
        "payload": "test'; SELECT * FROM pg_tables; --",
        "description": "Попытка получить список таблиц"
    },
    {
        "name": "Hex injection",
        "payload": "0x27 OR 1=1",
        "description": "Hex-инъекция"
    },
]


async def test_sql_injection_via_bot():
    """
    Тестирует SQL-инъекции через Telegram бота
    """
    # Получаем токен бота
    bot_token = os.getenv('BOT_TOKEN')
    if not bot_token:
        print("❌ Ошибка: BOT_TOKEN не найден в .env файле")
        return
    
    # Получаем ваш Telegram ID для тестирования
    test_user_id = input("\n📝 Введите ваш Telegram ID для тестирования: ").strip()
    if not test_user_id.isdigit():
        print("❌ Ошибка: Telegram ID должен быть числом")
        return
    
    test_user_id = int(test_user_id)
    
    print("\n" + "="*70)
    print("🔒 ТЕСТИРОВАНИЕ ЗАЩИТЫ ОТ SQL-ИНЪЕКЦИЙ")
    print("="*70)
    print(f"\n📊 Будет протестировано {len(SQL_INJECTION_PAYLOADS)} различных инъекций")
    print("\n⚠️  ВНИМАНИЕ: Этот тест отправит сообщения боту от вашего имени")
    print("   Убедитесь, что бот запущен и вы начали диалог с поддержкой")
    
    confirm = input("\n❓ Продолжить? (yes/no): ").strip().lower()
    if confirm not in ['yes', 'y', 'да']:
        print("❌ Тест отменён")
        return
    
    # Создаём бота
    bot = Bot(token=bot_token)
    
    print("\n" + "-"*70)
    print("🚀 НАЧАЛО ТЕСТИРОВАНИЯ")
    print("-"*70 + "\n")
    
    results = {
        "success": 0,
        "failed": 0,
        "errors": []
    }
    
    for i, test_case in enumerate(SQL_INJECTION_PAYLOADS, 1):
        print(f"\n[{i}/{len(SQL_INJECTION_PAYLOADS)}] Тест: {test_case['name']}")
        print(f"   Описание: {test_case['description']}")
        print(f"   Payload: {test_case['payload'][:50]}...")
        
        try:
            # Отправляем сообщение боту
            # Примечание: это симулирует отправку сообщения от пользователя
            # В реальности вам нужно будет отправить это сообщение вручную через Telegram
            print(f"   ⏳ Отправка...")
            
            # Здесь мы не можем напрямую отправить сообщение от имени пользователя
            # Поэтому выводим инструкцию
            print(f"   📱 ОТПРАВЬТЕ ВРУЧНУЮ: {test_case['payload']}")
            print(f"   ⏸️  Нажмите Enter после отправки...")
            input()
            
            results["success"] += 1
            print(f"   ✅ Тест пройден (сообщение отправлено)")
            
        except Exception as e:
            results["failed"] += 1
            results["errors"].append({
                "test": test_case['name'],
                "error": str(e)
            })
            print(f"   ❌ Ошибка: {e}")
        
        # Небольшая задержка между тестами
        await asyncio.sleep(1)
    
    # Закрываем сессию бота
    await bot.session.close()
    
    # Выводим результаты
    print("\n" + "="*70)
    print("📊 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ")
    print("="*70)
    print(f"\n✅ Успешно: {results['success']}/{len(SQL_INJECTION_PAYLOADS)}")
    print(f"❌ Ошибок: {results['failed']}/{len(SQL_INJECTION_PAYLOADS)}")
    
    if results["errors"]:
        print("\n⚠️  Обнаруженные ошибки:")
        for error in results["errors"]:
            print(f"   - {error['test']}: {error['error']}")
    
    print("\n" + "="*70)
    print("🔍 ЧТО ПРОВЕРИТЬ В БАЗЕ ДАННЫХ:")
    print("="*70)
    print("""
1. Проверьте, что все таблицы существуют:
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public';

2. Проверьте, что сообщения сохранены как текст (не выполнены):
   SELECT message_text FROM support_messages 
   ORDER BY created_at DESC LIMIT 10;

3. Проверьте, что сессии не были закрыты:
   SELECT status, COUNT(*) FROM support_sessions 
   GROUP BY status;

4. Проверьте целостность данных:
   SELECT COUNT(*) FROM support_sessions;
   SELECT COUNT(*) FROM support_messages;
    """)
    
    print("\n✅ Если все таблицы существуют и данные не изменены - защита работает!")


def print_manual_test_instructions():
    """
    Выводит инструкции для ручного тестирования
    """
    print("\n" + "="*70)
    print("📋 ИНСТРУКЦИЯ ДЛЯ РУЧНОГО ТЕСТИРОВАНИЯ")
    print("="*70)
    print("""
1. Запустите Telegram бота
2. Откройте диалог с ботом в Telegram
3. Начните сессию поддержки (отправьте команду или нажмите кнопку)
4. Отправьте следующие сообщения боту:

""")
    
    for i, test_case in enumerate(SQL_INJECTION_PAYLOADS, 1):
        print(f"{i}. {test_case['name']}")
        print(f"   Отправьте: {test_case['payload']}")
        print(f"   Ожидаемый результат: Сообщение сохранено как текст\n")
    
    print("""
5. После отправки всех сообщений проверьте базу данных:
   
   a) Подключитесь к PostgreSQL:
      docker exec -it <container_name> psql -U postgres -d telegram_bot
   
   b) Выполните проверочные запросы:
      -- Проверка существования таблиц
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public';
      
      -- Проверка сохранённых сообщений
      SELECT id, message_text FROM support_messages 
      ORDER BY created_at DESC LIMIT 20;
      
      -- Проверка статусов сессий
      SELECT id, status FROM support_sessions 
      ORDER BY created_at DESC LIMIT 10;

6. Ожидаемые результаты:
   ✅ Все таблицы существуют (support_sessions, support_messages)
   ✅ Все сообщения сохранены как обычный текст
   ✅ SQL-команды НЕ выполнены
   ✅ Данные не изменены и не удалены
   ✅ Сессии остались в корректном состоянии

7. Если хотя бы один пункт не выполнен - обнаружена уязвимость!
""")
    print("="*70 + "\n")


if __name__ == "__main__":
    print("\n🔒 SQL INJECTION TESTING TOOL")
    print("="*70)
    print("\nВыберите режим тестирования:")
    print("1. Автоматический тест (требует Telegram ID)")
    print("2. Показать инструкции для ручного тестирования")
    
    choice = input("\nВаш выбор (1/2): ").strip()
    
    if choice == "1":
        asyncio.run(test_sql_injection_via_bot())
    elif choice == "2":
        print_manual_test_instructions()
    else:
        print("❌ Неверный выбор")
