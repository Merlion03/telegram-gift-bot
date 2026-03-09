"""
Скрипт для проверки работы PostgreSQL LISTEN/NOTIFY триггеров

Проверяет корректность работы триггеров real-time уведомлений:
- trigger_notify_new_message
- trigger_notify_session_status_change
- trigger_notify_session_type_change
"""
import os
import sys
from pathlib import Path
import json
import asyncio
from typing import Optional

# Добавляем корневую директорию в PYTHONPATH
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
import psycopg
import structlog


# Загружаем переменные окружения
env_path = Path(__file__).parent.parent.parent / '.env.test'
if env_path.exists():
    load_dotenv(env_path, override=True)
else:
    # Пробуем загрузить из telegram-bot/.env
    env_path = Path(__file__).parent.parent / '.env'
    if env_path.exists():
        load_dotenv(env_path, override=True)

# Настройка логирования
logger = structlog.get_logger()


class TriggerTester:
    """
    Класс для тестирования PostgreSQL LISTEN/NOTIFY триггеров
    """
    
    def __init__(self):
        """Инициализация тестера"""
        # Получаем параметры подключения
        db_host = os.getenv('DB_HOST', 'localhost')
        db_port = os.getenv('DB_PORT', '5433')
        db_name = os.getenv('DB_NAME', 'telegram_bot')
        db_user = os.getenv('DB_USER', 'postgres')
        db_password = os.getenv('DB_PASSWORD', 'postgres')
        
        # Формируем URL подключения
        self.conn_string = f'postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}'
        
        self.listen_conn: Optional[psycopg.Connection] = None
        self.query_conn: Optional[psycopg.Connection] = None
        
        logger.info(
            "Инициализация тестера триггеров",
            host=db_host,
            port=db_port,
            database=db_name
        )
    
    def connect(self):
        """Создаёт подключения к PostgreSQL"""
        try:
            # Подключение для LISTEN
            logger.info("Создание LISTEN подключения")
            self.listen_conn = psycopg.connect(
                self.conn_string,
                autocommit=True  # Необходимо для LISTEN/NOTIFY
            )
            
            # Подключение для запросов
            logger.info("Создание подключения для запросов")
            self.query_conn = psycopg.connect(self.conn_string)
            
            logger.info("✓ Подключения установлены")
            return True
            
        except Exception as e:
            logger.error("Ошибка при подключении к БД", error=str(e))
            return False
    
    def disconnect(self):
        """Закрывает подключения"""
        if self.listen_conn:
            self.listen_conn.close()
            logger.info("LISTEN подключение закрыто")
        
        if self.query_conn:
            self.query_conn.close()
            logger.info("Query подключение закрыто")
    
    def test_new_message_trigger(self) -> bool:
        """
        Тестирует триггер notify_new_message
        
        Returns:
            True если тест прошёл успешно
        """
        logger.info("=" * 80)
        logger.info("Тест 1: trigger_notify_new_message")
        logger.info("=" * 80)
        
        try:
            # Подписываемся на канал
            logger.info("Подписка на канал 'new_message'")
            with self.listen_conn.cursor() as cur:
                cur.execute("LISTEN new_message")
            
            # Создаём тестовую сессию
            logger.info("Создание тестовой сессии")
            with self.query_conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO support_sessions (telegram_id, status, session_type)
                    VALUES (999999, 'active', 'chat')
                    RETURNING id
                """)
                session_id = cur.fetchone()[0]
                self.query_conn.commit()
                logger.info("Тестовая сессия создана", session_id=session_id)
            
            # Вставляем тестовое сообщение
            logger.info("Вставка тестового сообщения")
            with self.query_conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO support_messages (session_id, telegram_id, message_type, message_text)
                    VALUES (%s, 999999, 'from_user', 'Test message for trigger')
                    RETURNING id
                """, (session_id,))
                message_id = cur.fetchone()[0]
                self.query_conn.commit()
                logger.info("Тестовое сообщение вставлено", message_id=message_id)
            
            # Ожидаем уведомление
            logger.info("Ожидание уведомления (timeout 5 секунд)")
            gen = self.listen_conn.notifies(timeout=5.0)
            
            notification_received = False
            for notify in gen:
                logger.info(
                    "Уведомление получено",
                    channel=notify.channel,
                    payload_length=len(notify.payload)
                )
                
                # Парсим JSON payload
                try:
                    payload = json.loads(notify.payload)
                    logger.info("Payload распарсен", payload=payload)
                    
                    # Проверяем структуру payload
                    assert 'operation' in payload, "Отсутствует поле 'operation'"
                    assert 'table' in payload, "Отсутствует поле 'table'"
                    assert 'session_id' in payload, "Отсутствует поле 'session_id'"
                    assert 'message_id' in payload, "Отсутствует поле 'message_id'"
                    assert 'data' in payload, "Отсутствует поле 'data'"
                    
                    # Проверяем значения
                    assert payload['operation'] == 'INSERT', f"Неверная операция: {payload['operation']}"
                    assert payload['table'] == 'support_messages', f"Неверная таблица: {payload['table']}"
                    assert payload['session_id'] == session_id, f"Неверный session_id: {payload['session_id']}"
                    assert payload['message_id'] == message_id, f"Неверный message_id: {payload['message_id']}"
                    
                    # Проверяем данные
                    data = payload['data']
                    assert data['id'] == message_id, f"Неверный id в data: {data['id']}"
                    assert data['session_id'] == session_id, f"Неверный session_id в data: {data['session_id']}"
                    assert data['message_text'] == 'Test message for trigger', f"Неверный текст сообщения"
                    
                    logger.info("✓ Все проверки payload пройдены")
                    notification_received = True
                    break
                    
                except json.JSONDecodeError as e:
                    logger.error("Ошибка парсинга JSON payload", error=str(e))
                    return False
                except AssertionError as e:
                    logger.error("Ошибка проверки payload", error=str(e))
                    return False
            
            # Очистка тестовых данных
            logger.info("Очистка тестовых данных")
            with self.query_conn.cursor() as cur:
                cur.execute("DELETE FROM support_messages WHERE id = %s", (message_id,))
                cur.execute("DELETE FROM support_sessions WHERE id = %s", (session_id,))
                self.query_conn.commit()
            
            # Отписываемся от канала
            with self.listen_conn.cursor() as cur:
                cur.execute("UNLISTEN new_message")
            
            if notification_received:
                logger.info("✓ Тест trigger_notify_new_message ПРОЙДЕН")
                return True
            else:
                logger.error("✗ Уведомление не получено в течение timeout")
                return False
                
        except Exception as e:
            logger.error("Ошибка при тестировании триггера", error=str(e), exc_info=True)
            return False
    
    def test_session_status_change_trigger(self) -> bool:
        """
        Тестирует триггер notify_session_status_change
        
        Returns:
            True если тест прошёл успешно
        """
        logger.info("=" * 80)
        logger.info("Тест 2: trigger_notify_session_status_change")
        logger.info("=" * 80)
        
        try:
            # Подписываемся на канал
            logger.info("Подписка на канал 'session_status_change'")
            with self.listen_conn.cursor() as cur:
                cur.execute("LISTEN session_status_change")
            
            # Создаём тестовую сессию
            logger.info("Создание тестовой сессии")
            with self.query_conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO support_sessions (telegram_id, status, session_type)
                    VALUES (999998, 'active', 'chat')
                    RETURNING id
                """)
                session_id = cur.fetchone()[0]
                self.query_conn.commit()
                logger.info("Тестовая сессия создана", session_id=session_id)
            
            # Обновляем статус сессии
            logger.info("Обновление статуса сессии на 'closed'")
            with self.query_conn.cursor() as cur:
                cur.execute("""
                    UPDATE support_sessions
                    SET status = 'closed'
                    WHERE id = %s
                """, (session_id,))
                self.query_conn.commit()
            
            # Ожидаем уведомление
            logger.info("Ожидание уведомления (timeout 5 секунд)")
            gen = self.listen_conn.notifies(timeout=5.0)
            
            notification_received = False
            for notify in gen:
                logger.info(
                    "Уведомление получено",
                    channel=notify.channel,
                    payload_length=len(notify.payload)
                )
                
                # Парсим JSON payload
                try:
                    payload = json.loads(notify.payload)
                    logger.info("Payload распарсен", payload=payload)
                    
                    # Проверяем структуру payload
                    assert 'operation' in payload, "Отсутствует поле 'operation'"
                    assert 'table' in payload, "Отсутствует поле 'table'"
                    assert 'session_id' in payload, "Отсутствует поле 'session_id'"
                    assert 'old_status' in payload, "Отсутствует поле 'old_status'"
                    assert 'new_status' in payload, "Отсутствует поле 'new_status'"
                    assert 'data' in payload, "Отсутствует поле 'data'"
                    
                    # Проверяем значения
                    assert payload['operation'] == 'UPDATE', f"Неверная операция: {payload['operation']}"
                    assert payload['table'] == 'support_sessions', f"Неверная таблица: {payload['table']}"
                    assert payload['session_id'] == session_id, f"Неверный session_id: {payload['session_id']}"
                    assert payload['old_status'] == 'active', f"Неверный old_status: {payload['old_status']}"
                    assert payload['new_status'] == 'closed', f"Неверный new_status: {payload['new_status']}"
                    
                    logger.info("✓ Все проверки payload пройдены")
                    notification_received = True
                    break
                    
                except json.JSONDecodeError as e:
                    logger.error("Ошибка парсинга JSON payload", error=str(e))
                    return False
                except AssertionError as e:
                    logger.error("Ошибка проверки payload", error=str(e))
                    return False
            
            # Очистка тестовых данных
            logger.info("Очистка тестовых данных")
            with self.query_conn.cursor() as cur:
                cur.execute("DELETE FROM support_sessions WHERE id = %s", (session_id,))
                self.query_conn.commit()
            
            # Отписываемся от канала
            with self.listen_conn.cursor() as cur:
                cur.execute("UNLISTEN session_status_change")
            
            if notification_received:
                logger.info("✓ Тест trigger_notify_session_status_change ПРОЙДЕН")
                return True
            else:
                logger.error("✗ Уведомление не получено в течение timeout")
                return False
                
        except Exception as e:
            logger.error("Ошибка при тестировании триггера", error=str(e), exc_info=True)
            return False
    
    def test_session_type_change_trigger(self) -> bool:
        """
        Тестирует триггер notify_session_type_change
        
        Returns:
            True если тест прошёл успешно
        """
        logger.info("=" * 80)
        logger.info("Тест 3: trigger_notify_session_type_change")
        logger.info("=" * 80)
        
        try:
            # Подписываемся на канал
            logger.info("Подписка на канал 'session_type_change'")
            with self.listen_conn.cursor() as cur:
                cur.execute("LISTEN session_type_change")
            
            # Создаём тестовую сессию
            logger.info("Создание тестовой сессии")
            with self.query_conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO support_sessions (telegram_id, status, session_type)
                    VALUES (999997, 'active', 'chat')
                    RETURNING id
                """)
                session_id = cur.fetchone()[0]
                self.query_conn.commit()
                logger.info("Тестовая сессия создана", session_id=session_id)
            
            # Обновляем тип сессии
            logger.info("Обновление типа сессии на 'support'")
            with self.query_conn.cursor() as cur:
                cur.execute("""
                    UPDATE support_sessions
                    SET session_type = 'support'
                    WHERE id = %s
                """, (session_id,))
                self.query_conn.commit()
            
            # Ожидаем уведомление
            logger.info("Ожидание уведомления (timeout 5 секунд)")
            gen = self.listen_conn.notifies(timeout=5.0)
            
            notification_received = False
            for notify in gen:
                logger.info(
                    "Уведомление получено",
                    channel=notify.channel,
                    payload_length=len(notify.payload)
                )
                
                # Парсим JSON payload
                try:
                    payload = json.loads(notify.payload)
                    logger.info("Payload распарсен", payload=payload)
                    
                    # Проверяем структуру payload
                    assert 'operation' in payload, "Отсутствует поле 'operation'"
                    assert 'table' in payload, "Отсутствует поле 'table'"
                    assert 'session_id' in payload, "Отсутствует поле 'session_id'"
                    assert 'old_type' in payload, "Отсутствует поле 'old_type'"
                    assert 'new_type' in payload, "Отсутствует поле 'new_type'"
                    assert 'data' in payload, "Отсутствует поле 'data'"
                    
                    # Проверяем значения
                    assert payload['operation'] == 'UPDATE', f"Неверная операция: {payload['operation']}"
                    assert payload['table'] == 'support_sessions', f"Неверная таблица: {payload['table']}"
                    assert payload['session_id'] == session_id, f"Неверный session_id: {payload['session_id']}"
                    assert payload['old_type'] == 'chat', f"Неверный old_type: {payload['old_type']}"
                    assert payload['new_type'] == 'support', f"Неверный new_type: {payload['new_type']}"
                    
                    logger.info("✓ Все проверки payload пройдены")
                    notification_received = True
                    break
                    
                except json.JSONDecodeError as e:
                    logger.error("Ошибка парсинга JSON payload", error=str(e))
                    return False
                except AssertionError as e:
                    logger.error("Ошибка проверки payload", error=str(e))
                    return False
            
            # Очистка тестовых данных
            logger.info("Очистка тестовых данных")
            with self.query_conn.cursor() as cur:
                cur.execute("DELETE FROM support_sessions WHERE id = %s", (session_id,))
                self.query_conn.commit()
            
            # Отписываемся от канала
            with self.listen_conn.cursor() as cur:
                cur.execute("UNLISTEN session_type_change")
            
            if notification_received:
                logger.info("✓ Тест trigger_notify_session_type_change ПРОЙДЕН")
                return True
            else:
                logger.error("✗ Уведомление не получено в течение timeout")
                return False
                
        except Exception as e:
            logger.error("Ошибка при тестировании триггера", error=str(e), exc_info=True)
            return False


def main():
    """
    Главная функция скрипта
    """
    logger.info("=" * 80)
    logger.info("Проверка работы PostgreSQL LISTEN/NOTIFY триггеров")
    logger.info("=" * 80)
    
    tester = TriggerTester()
    
    # Подключаемся к БД
    if not tester.connect():
        logger.error("✗ Не удалось подключиться к БД")
        sys.exit(1)
    
    try:
        # Запускаем тесты
        results = []
        
        results.append(("trigger_notify_new_message", tester.test_new_message_trigger()))
        results.append(("trigger_notify_session_status_change", tester.test_session_status_change_trigger()))
        results.append(("trigger_notify_session_type_change", tester.test_session_type_change_trigger()))
        
        # Выводим итоги
        logger.info("=" * 80)
        logger.info("ИТОГИ ТЕСТИРОВАНИЯ")
        logger.info("=" * 80)
        
        all_passed = True
        for trigger_name, passed in results:
            status = "✓ ПРОЙДЕН" if passed else "✗ ПРОВАЛЕН"
            logger.info(f"{trigger_name}: {status}")
            if not passed:
                all_passed = False
        
        logger.info("=" * 80)
        
        if all_passed:
            logger.info("✓ ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО")
            sys.exit(0)
        else:
            logger.error("✗ НЕКОТОРЫЕ ТЕСТЫ ПРОВАЛЕНЫ")
            sys.exit(1)
            
    finally:
        tester.disconnect()


if __name__ == '__main__':
    main()
