#!/bin/bash

# Скрипт для очистки production базы данных через Docker

echo "🗑️  Очистка production базы данных..."
echo ""

# Запускаем скрипт очистки внутри Docker контейнера
docker-compose exec telegram-bot python scripts/clear_production_db.py

echo ""
echo "Готово!"
