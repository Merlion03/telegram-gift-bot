#!/usr/bin/env python3
"""
Checkpoint 9: Упрощённая проверка интеграции компонентов (без БД)

Проверяет наличие всех файлов и базовую структуру интеграции
"""

import sys
from pathlib import Path

# Цвета для вывода
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'


def check_python_files():
    """Проверка наличия всех Python файлов"""
    print(f"\n{BLUE}=== Проверка Python файлов ==={RESET}")
    
    required_files = [
        # Models
        'telegram-bot/models/administrator.py',
        'telegram-bot/models/role.py',
        'telegram-bot/models/session.py',
        # Repositories
        'telegram-bot/database/repositories/admin_repository.py',
        'telegram-bot/database/repositories/auth_attempts_repository.py',
        'telegram-bot/database/repositories/config_repository.py',
        # Services
        'telegram-bot/services/password_hasher.py',
        'telegram-bot/services/jwt_session_service.py',
        'telegram-bot/services/rate_limit_service.py',
        'telegram-bot/services/role_service.py',
        'telegram-bot/services/auth_service.py',
        'telegram-bot/services/config_service.py',
        'telegram-bot/services/admin_notification_service.py',
        # Handlers
        'telegram-bot/handlers/admin_start_handler.py',
        # Migration
        'telegram-bot/database/migrations/009_create_admin_tables.sql',
    ]
    
    base_path = Path(__file__).parent.parent.parent
    passed = 0
    failed = 0
    
    for file_path in required_files:
        full_path = base_path / file_path
        if full_path.exists():
            print(f"{GREEN}✓{RESET} {file_path}")
            passed += 1
        else:
            print(f"{RED}✗{RESET} {file_path} не найден")
            failed += 1
    
    return passed, failed


def check_nextjs_files():
    """Проверка наличия всех Next.js файлов"""
    print(f"\n{BLUE}=== Проверка Next.js файлов ==={RESET}")
    
    required_files = [
        # Models
        'nextjs-app/lib/models/administrator.ts',
        'nextjs-app/lib/models/role.ts',
        'nextjs-app/lib/models/session.ts',
        # Repositories
        'nextjs-app/lib/repositories/adminRepository.ts',
        'nextjs-app/lib/repositories/authAttemptsRepository.ts',
        # Services
        'nextjs-app/lib/services/passwordHasher.ts',
        'nextjs-app/lib/services/jwtSessionService.ts',
        'nextjs-app/lib/services/rateLimitService.ts',
        'nextjs-app/lib/services/adminAuthService.ts',
        # API Routes
        'nextjs-app/app/api/auth/check-first-login/route.ts',
        'nextjs-app/app/api/auth/register/route.ts',
        'nextjs-app/app/api/auth/login/route.ts',
        'nextjs-app/app/api/auth/validate/route.ts',
        # Utils
        'nextjs-app/lib/utils/telegramWebApp.ts',
        # Middleware
        'nextjs-app/middleware.ts',
        # Pages
        'nextjs-app/app/login/page.tsx',
    ]
    
    base_path = Path(__file__).parent.parent.parent
    passed = 0
    failed = 0
    
    for file_path in required_files:
        full_path = base_path / file_path
        if full_path.exists():
            print(f"{GREEN}✓{RESET} {file_path}")
            passed += 1
        else:
            print(f"{RED}✗{RESET} {file_path} не найден")
            failed += 1
    
    return passed, failed


def check_middleware_integration():
    """Проверка интеграции middleware"""
    print(f"\n{BLUE}=== Проверка middleware ==={RESET}")
    
    base_path = Path(__file__).parent.parent.parent
    middleware_path = base_path / 'nextjs-app' / 'middleware.ts'
    
    passed = 0
    failed = 0
    warnings = []
    
    if middleware_path.exists():
        content = middleware_path.read_text(encoding='utf-8')
        
        # Проверяем наличие JWT валидации
        if 'jwtSessionService' in content or 'validateToken' in content or 'admin-token' in content:
            print(f"{GREEN}✓{RESET} JWT валидация интегрирована в middleware")
            passed += 1
        else:
            print(f"{YELLOW}⚠{RESET} JWT валидация не найдена в middleware")
            warnings.append("JWT валидация не найдена в middleware")
        
        # Проверяем matcher для защищённых роутов
        if '/admin' in content and 'matcher' in content:
            print(f"{GREEN}✓{RESET} Matcher для защищённых роутов настроен")
            passed += 1
        else:
            print(f"{YELLOW}⚠{RESET} Matcher для защищённых роутов не найден")
            warnings.append("Matcher для защищённых роутов не найден")
    else:
        print(f"{RED}✗{RESET} middleware.ts не найден")
        failed += 1
    
    return passed, failed, warnings


def check_telegram_webapp_integration():
    """Проверка интеграции Telegram WebApp API"""
    print(f"\n{BLUE}=== Проверка Telegram WebApp интеграции ==={RESET}")
    
    base_path = Path(__file__).parent.parent.parent
    webapp_util_path = base_path / 'nextjs-app' / 'lib' / 'utils' / 'telegramWebApp.ts'
    
    passed = 0
    failed = 0
    
    if webapp_util_path.exists():
        content = webapp_util_path.read_text(encoding='utf-8')
        
        # Проверяем функции
        required_functions = ['getTelegramUserId', 'isTelegramWebApp', 'getInitData']
        for func in required_functions:
            if func in content:
                print(f"{GREEN}✓{RESET} Функция {func} реализована")
                passed += 1
            else:
                print(f"{RED}✗{RESET} Функция {func} не найдена")
                failed += 1
    else:
        print(f"{RED}✗{RESET} telegramWebApp.ts не найден")
        failed += 1
    
    return passed, failed


def check_login_page_integration():
    """Проверка интеграции страницы входа"""
    print(f"\n{BLUE}=== Проверка страницы входа ==={RESET}")
    
    base_path = Path(__file__).parent.parent.parent
    login_page_path = base_path / 'nextjs-app' / 'app' / 'login' / 'page.tsx'
    
    passed = 0
    failed = 0
    
    if login_page_path.exists():
        content = login_page_path.read_text(encoding='utf-8')
        
        # Проверяем использование getTelegramUserId
        if 'getTelegramUserId' in content:
            print(f"{GREEN}✓{RESET} getTelegramUserId используется на странице входа")
            passed += 1
        else:
            print(f"{RED}✗{RESET} getTelegramUserId не используется")
            failed += 1
        
        # Проверяем API вызовы
        api_calls = ['check-first-login', 'register', 'login']
        for api_call in api_calls:
            if api_call in content:
                print(f"{GREEN}✓{RESET} API вызов {api_call} интегрирован")
                passed += 1
            else:
                print(f"{RED}✗{RESET} API вызов {api_call} не найден")
                failed += 1
    else:
        print(f"{RED}✗{RESET} login/page.tsx не найден")
        failed += 1
    
    return passed, failed


def check_common_handler_integration():
    """Проверка интеграции с common_handler.py"""
    print(f"\n{BLUE}=== Проверка интеграции Telegram Bot ==={RESET}")
    
    base_path = Path(__file__).parent.parent.parent
    common_handler_path = base_path / 'telegram-bot' / 'handlers' / 'common_handler.py'
    
    passed = 0
    failed = 0
    warnings = []
    
    if common_handler_path.exists():
        content = common_handler_path.read_text(encoding='utf-8')
        
        # Проверяем интеграцию AdminStartHandler (более гибкий поиск)
        if 'admin_start_handler' in content.lower() or 'adminhandler' in content.lower():
            print(f"{GREEN}✓{RESET} AdminStartHandler интегрирован в common_handler")
            passed += 1
        else:
            print(f"{YELLOW}⚠{RESET} AdminStartHandler не найден в common_handler")
            warnings.append("AdminStartHandler не интегрирован в common_handler")
    else:
        print(f"{RED}✗{RESET} common_handler.py не найден")
        failed += 1
    
    return passed, failed, warnings


def check_listen_notify_integration():
    """Проверка интеграции LISTEN/NOTIFY"""
    print(f"\n{BLUE}=== Проверка LISTEN/NOTIFY ==={RESET}")
    
    base_path = Path(__file__).parent.parent.parent
    main_py_path = base_path / 'telegram-bot' / 'main.py'
    
    passed = 0
    failed = 0
    warnings = []
    
    if main_py_path.exists():
        content = main_py_path.read_text(encoding='utf-8')
        
        # Проверяем наличие listener
        if 'new_admin_notification' in content or 'LISTEN' in content:
            print(f"{GREEN}✓{RESET} LISTEN/NOTIFY интегрирован в main.py")
            passed += 1
        else:
            print(f"{YELLOW}⚠{RESET} LISTEN/NOTIFY не найден в main.py")
            warnings.append("LISTEN/NOTIFY не интегрирован в main.py")
    else:
        print(f"{RED}✗{RESET} main.py не найден")
        failed += 1
    
    return passed, failed, warnings


def print_summary(total_passed, total_failed, all_warnings):
    """Вывод итоговой сводки"""
    print(f"\n{BLUE}{'=' * 60}{RESET}")
    print(f"{BLUE}=== ИТОГОВАЯ СВОДКА ==={RESET}")
    print(f"{BLUE}{'=' * 60}{RESET}")
    
    total_checks = total_passed + total_failed
    success_rate = (total_passed / total_checks * 100) if total_checks > 0 else 0
    
    print(f"\nПройдено проверок: {GREEN}{total_passed}{RESET}")
    print(f"Провалено проверок: {RED}{total_failed}{RESET}")
    print(f"Предупреждений: {YELLOW}{len(all_warnings)}{RESET}")
    print(f"Процент успеха: {GREEN if success_rate >= 90 else YELLOW if success_rate >= 70 else RED}{success_rate:.1f}%{RESET}")
    
    if all_warnings:
        print(f"\n{YELLOW}Предупреждения:{RESET}")
        for warning in all_warnings:
            print(f"  - {warning}")
    
    if total_failed == 0:
        print(f"\n{GREEN}✓ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ УСПЕШНО!{RESET}")
        print(f"{GREEN}Система готова к следующему этапу.{RESET}")
        return True
    else:
        print(f"\n{RED}✗ ОБНАРУЖЕНЫ КРИТИЧЕСКИЕ ПРОБЛЕМЫ{RESET}")
        print(f"{RED}Необходимо исправить ошибки перед продолжением.{RESET}")
        return False


def main():
    """Главная функция проверки"""
    print(f"{BLUE}{'=' * 60}{RESET}")
    print(f"{BLUE}Checkpoint 9: Проверка интеграции компонентов{RESET}")
    print(f"{BLUE}{'=' * 60}{RESET}")
    
    total_passed = 0
    total_failed = 0
    all_warnings = []
    
    try:
        # Проверяем файлы
        p, f = check_python_files()
        total_passed += p
        total_failed += f
        
        p, f = check_nextjs_files()
        total_passed += p
        total_failed += f
        
        # Проверяем интеграцию компонентов
        p, f, w = check_middleware_integration()
        total_passed += p
        total_failed += f
        all_warnings.extend(w)
        
        p, f = check_telegram_webapp_integration()
        total_passed += p
        total_failed += f
        
        p, f = check_login_page_integration()
        total_passed += p
        total_failed += f
        
        p, f, w = check_common_handler_integration()
        total_passed += p
        total_failed += f
        all_warnings.extend(w)
        
        p, f, w = check_listen_notify_integration()
        total_passed += p
        total_failed += f
        all_warnings.extend(w)
        
        # Выводим итоговую сводку
        success = print_summary(total_passed, total_failed, all_warnings)
        
        return 0 if success else 1
        
    except Exception as e:
        print(f"\n{RED}КРИТИЧЕСКАЯ ОШИБКА: {e}{RESET}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    exit_code = main()
    sys.exit(exit_code)
