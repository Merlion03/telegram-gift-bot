#!/bin/sh
# Entrypoint скрипт для webapp контейнера
# Применяет PostgreSQL миграции перед запуском сервера

set -e

echo "[Entrypoint] Ожидание готовности PostgreSQL..."
until PGPASSWORD=$POSTGRES_PASSWORD psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\q' 2>/dev/null; do
  echo "[Entrypoint] PostgreSQL недоступен - ожидание..."
  sleep 2
done

echo "[Entrypoint] PostgreSQL готов!"

# Применяем миграции в правильном порядке
echo "[Entrypoint] Применение миграций..."

# Создание таблиц
echo "[Entrypoint] Применение миграции 001: создание таблиц..."
PGPASSWORD=$POSTGRES_PASSWORD psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /app/migrations/001_create_tables.sql

# Создание триггеров
echo "[Entrypoint] Применение миграции 005: realtime триггеры..."
PGPASSWORD=$POSTGRES_PASSWORD psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /app/migrations/005_realtime_triggers.sql

echo "[Entrypoint] Все миграции применены успешно!"

# Запускаем основное приложение
echo "[Entrypoint] Запуск Next.js сервера..."
exec "$@"
