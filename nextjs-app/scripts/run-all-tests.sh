#!/bin/bash

# Скрипт для запуска всех тестов проекта
# Requirements: все

echo "=========================================="
echo "Запуск всех тестов проекта"
echo "=========================================="
echo ""

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Счётчики
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Функция для запуска тестов
run_test_suite() {
  local suite_name=$1
  local test_command=$2
  
  echo -e "${YELLOW}Запуск: $suite_name${NC}"
  
  if eval "$test_command"; then
    echo -e "${GREEN}✓ $suite_name пройдены${NC}"
    ((PASSED_TESTS++))
  else
    echo -e "${RED}✗ $suite_name не пройдены${NC}"
    ((FAILED_TESTS++))
  fi
  
  ((TOTAL_TESTS++))
  echo ""
}

# 1. Unit-тесты для Header
run_test_suite "Unit-тесты Header" \
  "npm run test -- nextjs-app/__tests__/components/admin/Header.test.tsx --run"

# 2. Property-тесты для Header
run_test_suite "Property-тесты Header" \
  "npm run test -- nextjs-app/__tests__/components/admin/Header.property.test.tsx --run"

# 3. Unit-тесты для Sidebar
run_test_suite "Unit-тесты Sidebar" \
  "npm run test -- nextjs-app/__tests__/components/admin/Sidebar.test.tsx --run"

# 4. Property-тесты для Sidebar
run_test_suite "Property-тесты Sidebar" \
  "npm run test -- nextjs-app/__tests__/components/admin/Sidebar.property.test.tsx --run"

# 5. Unit-тесты для ChatWindow
run_test_suite "Unit-тесты ChatWindow" \
  "npm run test -- nextjs-app/__tests__/components/admin/ChatWindow.test.tsx --run"

# 6. Property-тесты для ChatWindow
run_test_suite "Property-тесты ChatWindow" \
  "npm run test -- nextjs-app/__tests__/components/admin/ChatWindow.property.test.tsx --run"

# 7. Unit-тесты для MessageInput
run_test_suite "Unit-тесты MessageInput" \
  "npm run test -- nextjs-app/__tests__/components/admin/MessageInput.test.tsx --run"

# 8. Property-тесты для MessageInput
run_test_suite "Property-тесты MessageInput" \
  "npm run test -- nextjs-app/__tests__/components/admin/MessageInput.property.test.tsx --run"

# 9. Unit-тесты для UserPanel
run_test_suite "Unit-тесты UserPanel" \
  "npm run test -- nextjs-app/__tests__/components/admin/UserPanel.test.tsx --run"

# 10. Property-тесты для UserPanel
run_test_suite "Property-тесты UserPanel" \
  "npm run test -- nextjs-app/__tests__/components/admin/UserPanel.property.test.tsx --run"

# 11. Property-тесты для главной страницы
run_test_suite "Property-тесты главной страницы" \
  "npm run test -- nextjs-app/__tests__/pages/admin/page.property.test.tsx --run"

# 12. Property-тесты для типографики
run_test_suite "Property-тесты типографики" \
  "npm run test -- nextjs-app/__tests__/properties/typography.property.test.tsx --run"

# 13. Интеграционные тесты
run_test_suite "Интеграционные тесты" \
  "npm run test -- nextjs-app/__tests__/integration/admin-ui-integration.test.tsx --run"

# Финальный отчёт
echo "=========================================="
echo "Финальный отчёт"
echo "=========================================="
echo -e "Всего тестов: ${YELLOW}$TOTAL_TESTS${NC}"
echo -e "Пройдено: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Не пройдено: ${RED}$FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "${GREEN}✓ Все тесты пройдены успешно!${NC}"
  exit 0
else
  echo -e "${RED}✗ Некоторые тесты не пройдены${NC}"
  exit 1
fi
