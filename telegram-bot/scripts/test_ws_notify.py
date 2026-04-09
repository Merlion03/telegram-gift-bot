#!/usr/bin/env python3
import sys
import os
import psycopg2
import structlog

logger = structlog.get_logger(__name__)

def test():
    logger.info("=== Тест WebSocket уведомлений ===")
    
    # Подключаемся напрямую через psycopg2
    conn = psycopg2.connect(
        host=os.getenv('POSTGRES_HOST', 'postgres'),
        port=os.getenv('POSTGRES_PORT', '5432'),
        database=os.getenv('POSTGRES_DB', 'telegram_bot_db'),
        user=os.getenv('POSTGRES_USER', 'telegram_bot_user'),
        password=os.getenv('POSTGRES_PASSWORD', 'secure_password_123')
    )
    
    try:
        with conn.cursor() as cur:
            test_tg_id = 999999999
            
            # Создаём сессию
            cur.execute("INSERT INTO support_sessions (telegram_id, status, session_type) VALUES (%s, 'open', 'general') RETURNING id", (test_tg_id,))
            session_id = cur.fetchone()[0]
            conn.commit()
            logger.info(f"✓ Сессия создана: {session_id}")
            
            # Отправляем сообщение
            cur.execute("INSERT INTO support_messages (session_id, telegram_id, message_text, message_type) VALUES (%s, %s, 'Test', 'from_user') RETURNING id", (session_id, test_tg_id))
            msg_id = cur.fetchone()[0]
            conn.commit()
            logger.info(f"✓ Сообщение: {msg_id} → триггер notify_new_message()")
            
            # Меняем статус
            cur.execute("UPDATE support_sessions SET status = 'in_progress' WHERE id = %s", (session_id,))
            conn.commit()
            logger.info(f"✓ Статус изменён → триггер notify_session_status_change()")
            
            # Меняем тип
            cur.execute("UPDATE support_sessions SET session_type = 'prize_claim' WHERE id = %s", (session_id,))
            conn.commit()
            logger.info(f"✓ Тип изменён → триггер notify_session_type_change()")
            
            logger.info("\n✅ Проверьте логи: docker logs telegram-webapp --tail=50\n")
            
            # Очистка
            cur.execute("DELETE FROM support_messages WHERE session_id = %s", (session_id,))
            cur.execute("DELETE FROM support_sessions WHERE id = %s", (session_id,))
            conn.commit()
            
    except Exception as e:
        logger.error(f"❌ Ошибка: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()
    return True

if __name__ == "__main__":
    sys.exit(0 if test() else 1)
