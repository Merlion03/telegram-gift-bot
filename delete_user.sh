#!/bin/bash

# Скрипт для удаления данных пользователя через Docker

# Проверка аргументов
if [ -z "$1" ]; then
    echo "Использование: ./delete_user.sh <telegram_id>"
    echo "Пример: ./delete_user.sh 712309051"
    exit 1
fi

TELEGRAM_ID=$1

echo "=========================================="
echo "Удаление данных пользователя: $TELEGRAM_ID"
echo "=========================================="
echo ""

# Проверяем, запущен ли контейнер
if ! docker ps | grep -q telegram-bot; then
    echo "❌ Контейнер telegram-bot не запущен!"
    echo ""
    echo "Запустите контейнеры командой:"
    echo "  docker-compose up -d"
    exit 1
fi

# Запускаем скрипт удаления в контейнере
docker exec -it telegram-bot python scripts/delete_user_data.py "$TELEGRAM_ID"

echo ""
echo "=========================================="
echo "Готово!"
echo "=========================================="
