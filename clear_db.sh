#!/bin/bash

# Скрипт для очистки базы данных
# Использование: ./clear_db.sh [--force]

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  Очистка базы данных${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# Переходим в директорию telegram-bot
cd telegram-bot

# Активируем виртуальное окружение
if [ -d "../venv" ]; then
    echo -e "${GREEN}Активация виртуального окружения...${NC}"
    source ../venv/Scripts/activate 2>/dev/null || source ../venv/bin/activate
else
    echo -e "${RED}Ошибка: виртуальное окружение не найдено!${NC}"
    echo -e "${YELLOW}Создайте виртуальное окружение командой: python -m venv venv${NC}"
    exit 1
fi

# Проверяем аргументы
if [ "$1" == "--force" ]; then
    echo -e "${YELLOW}Режим: принудительная очистка (без подтверждения)${NC}"
    echo ""
    python scripts/clear_database_force.py
else
    echo -e "${YELLOW}Режим: очистка с подтверждением${NC}"
    echo ""
    python scripts/clear_database.py
fi

# Возвращаемся в корневую директорию
cd ..

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Готово!${NC}"
echo -e "${GREEN}========================================${NC}"
