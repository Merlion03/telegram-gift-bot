"""
Скрипт для проверки инициализации базовых сервисов системы авторизации
"""

import asyncio
import sys
import os

# Добавляем корневую директорию в путь для импорта модулей
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.asyncpg_connection import get_asyncpg_pool
from database.repositories.admin_repository import AdminRepository
from database.repositories.auth_attempts_repository import AuthAttemptsRepository
from database.repositories.config_repository import ConfigRepository
from services.password_hasher import PasswordHasher
from services.jwt_session_service import JWTSessionService
from services.rate_limit_service import RateLimitService
from services.role_service import RoleService
from services.auth_service import AuthService
from services.config_service import ConfigService
from services.admin_notification_service import AdminNotificationService


async def check_services_initialization():
    """Проверяет инициализацию всех базовых сервисов"""
    
    print("=" * 80)
    print("Проверка инициализации базовых сервисов")
    print("=" * 80)
    
    pool_manager = None
    errors = []
    
    try:
        # 1. Инициализация connection pool
        print("\n1. Инициализация connection pool...")
        pool_manager = get_asyncpg_pool()
        await pool_manager.initialize()
        pool = pool_manager.get_pool()
        print("   ✓ Connection pool инициализирован")
        
        # 2. Инициализация репозиториев
        print("\n2. Инициализация репозиториев...")
        
        admin_repo = None
        auth_attempts_repo = None
        config_repo = None
        
        try:
            admin_repo = AdminRepository()
            print("   ✓ AdminRepository инициализирован")
        except Exception as e:
            errors.append(f"AdminRepository: {e}")
            print(f"   ✗ AdminRepository: {e}")
        
        try:
            auth_attempts_repo = AuthAttemptsRepository()
            print("   ✓ AuthAttemptsRepository инициализирован")
        except Exception as e:
            errors.append(f"AuthAttemptsRepository: {e}")
            print(f"   ✗ AuthAttemptsRepository: {e}")
        
        try:
            config_repo = ConfigRepository()
            print("   ✓ ConfigRepository инициализирован")
        except Exception as e:
            errors.append(f"ConfigRepository: {e}")
            print(f"   ✗ ConfigRepository: {e}")
        
        # 3. Инициализация базовых сервисов
        print("\n3. Инициализация базовых сервисов...")
        
        password_hasher = None
        jwt_service = None
        rate_limit_service = None
        role_service = None
        
        try:
            password_hasher = PasswordHasher()
            print("   ✓ PasswordHasher инициализирован")
        except Exception as e:
            errors.append(f"PasswordHasher: {e}")
            print(f"   ✗ PasswordHasher: {e}")
        
        try:
            jwt_service = JWTSessionService(
                secret_key="test_secret_key_for_initialization_check",
                session_lifetime_hours=24
            )
            print("   ✓ JWTSessionService инициализирован")
        except Exception as e:
            errors.append(f"JWTSessionService: {e}")
            print(f"   ✗ JWTSessionService: {e}")
        
        if auth_attempts_repo:
            try:
                rate_limit_service = RateLimitService(auth_attempts_repo)
                print("   ✓ RateLimitService инициализирован")
            except Exception as e:
                errors.append(f"RateLimitService: {e}")
                print(f"   ✗ RateLimitService: {e}")
        else:
            print("   ⊘ RateLimitService (пропущен из-за ошибки AuthAttemptsRepository)")
        
        try:
            role_service = RoleService()
            print("   ✓ RoleService инициализирован")
        except Exception as e:
            errors.append(f"RoleService: {e}")
            print(f"   ✗ RoleService: {e}")
        
        # 4. Инициализация сервисов с зависимостями
        print("\n4. Инициализация сервисов с зависимостями...")
        
        auth_service = None
        config_service = None
        
        if admin_repo and rate_limit_service and password_hasher:
            try:
                auth_service = AuthService(
                    admin_repository=admin_repo,
                    rate_limit_service=rate_limit_service,
                    password_hasher=password_hasher
                )
                print("   ✓ AuthService инициализирован")
            except Exception as e:
                errors.append(f"AuthService: {e}")
                print(f"   ✗ AuthService: {e}")
        else:
            print("   ⊘ AuthService (пропущен из-за ошибок зависимостей)")
        
        if config_repo:
            try:
                config_service = ConfigService(config_repository=config_repo)
                print("   ✓ ConfigService инициализирован")
            except Exception as e:
                errors.append(f"ConfigService: {e}")
                print(f"   ✗ ConfigService: {e}")
        else:
            print("   ⊘ ConfigService (пропущен из-за ошибки ConfigRepository)")
        
        # AdminNotificationService требует Bot, пропускаем для этой проверки
        print("   ⊘ AdminNotificationService (требует Bot, пропущен)")
        
        # 5. Проверка Dependency Injection
        print("\n5. Проверка Dependency Injection...")
        
        # Проверяем, что AuthService имеет правильные зависимости
        if auth_service:
            if hasattr(auth_service, '_admin_repo') and auth_service._admin_repo is admin_repo:
                print("   ✓ AuthService -> AdminRepository")
            else:
                errors.append("AuthService: неправильная зависимость AdminRepository")
                print("   ✗ AuthService -> AdminRepository")
            
            if hasattr(auth_service, '_rate_limiter') and auth_service._rate_limiter is rate_limit_service:
                print("   ✓ AuthService -> RateLimitService")
            else:
                errors.append("AuthService: неправильная зависимость RateLimitService")
                print("   ✗ AuthService -> RateLimitService")
            
            if hasattr(auth_service, '_hasher') and auth_service._hasher is password_hasher:
                print("   ✓ AuthService -> PasswordHasher")
            else:
                errors.append("AuthService: неправильная зависимость PasswordHasher")
                print("   ✗ AuthService -> PasswordHasher")
        else:
            print("   ⊘ AuthService DI (пропущен)")
        
        # Проверяем RateLimitService -> AuthAttemptsRepository
        if rate_limit_service and auth_attempts_repo:
            if hasattr(rate_limit_service, '_auth_attempts_repo') and rate_limit_service._auth_attempts_repo is auth_attempts_repo:
                print("   ✓ RateLimitService -> AuthAttemptsRepository")
            else:
                errors.append("RateLimitService: неправильная зависимость AuthAttemptsRepository")
                print("   ✗ RateLimitService -> AuthAttemptsRepository")
        else:
            print("   ⊘ RateLimitService DI (пропущен)")
        
        # Проверяем ConfigService -> ConfigRepository
        if config_service and config_repo:
            if hasattr(config_service, '_config_repo') and config_service._config_repo is config_repo:
                print("   ✓ ConfigService -> ConfigRepository")
            else:
                errors.append("ConfigService: неправильная зависимость ConfigRepository")
                print("   ✗ ConfigService -> ConfigRepository")
        else:
            print("   ⊘ ConfigService DI (пропущен)")
        
        # 6. Итоговый результат
        print("\n" + "=" * 80)
        
        if not errors:
            print("✓ ВСЕ СЕРВИСЫ ИНИЦИАЛИЗИРОВАНЫ УСПЕШНО")
            print("✓ DEPENDENCY INJECTION РАБОТАЕТ КОРРЕКТНО")
            print("=" * 80)
            return True
        else:
            print(f"✗ ОБНАРУЖЕНО ОШИБОК: {len(errors)}")
            for error in errors:
                print(f"  - {error}")
            print("=" * 80)
            return False
            
    except Exception as e:
        print(f"\n✗ КРИТИЧЕСКАЯ ОШИБКА: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        if pool_manager:
            await pool_manager.close()
            print("\nConnection pool закрыт")


if __name__ == "__main__":
    result = asyncio.run(check_services_initialization())
    sys.exit(0 if result else 1)
