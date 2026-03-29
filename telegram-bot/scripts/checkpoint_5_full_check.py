"""
Checkpoint 5: Полная проверка базовых сервисов

Проверяет:
1. Применение миграций базы данных
2. Инициализацию всех сервисов
3. Dependency Injection между компонентами
4. Базовую функциональность сервисов
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
from models.role import AdminRole


async def checkpoint_5_full_check():
    """Выполняет полную проверку базовых сервисов"""
    
    print("=" * 80)
    print("CHECKPOINT 5: Проверка базовых сервисов")
    print("=" * 80)
    
    pool_manager = None
    test_tg_id = 999999999  # Тестовый ID для проверки
    errors = []
    
    try:
        # ========================================================================
        # 1. Проверка миграций базы данных
        # ========================================================================
        print("\n[1/5] Проверка миграций базы данных...")
        
        pool_manager = get_asyncpg_pool()
        await pool_manager.initialize()
        pool = pool_manager.get_pool()
        
        async with pool.acquire() as conn:
            # Проверяем таблицы
            tables = await conn.fetch("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('administrators', 'auth_attempts', 'system_config')
            """)
            table_names = [row['table_name'] for row in tables]
            
            if len(table_names) == 3:
                print("      ✓ Все таблицы созданы (administrators, auth_attempts, system_config)")
            else:
                errors.append(f"Не все таблицы созданы: {table_names}")
                print(f"      ✗ Не все таблицы созданы: {table_names}")
            
            # Проверяем триггер
            triggers = await conn.fetch("""
                SELECT trigger_name 
                FROM information_schema.triggers 
                WHERE trigger_name = 'trigger_notify_new_admin'
            """)
            
            if triggers:
                print("      ✓ Триггер notify_new_admin создан")
            else:
                errors.append("Триггер notify_new_admin не найден")
                print("      ✗ Триггер notify_new_admin не найден")
            
            # Проверяем начальную конфигурацию
            config = await conn.fetchval("""
                SELECT value FROM system_config WHERE key = 'session_lifetime_hours'
            """)
            
            if config == '24':
                print("      ✓ Начальная конфигурация установлена (session_lifetime_hours = 24)")
            else:
                errors.append(f"Неправильная начальная конфигурация: {config}")
                print(f"      ✗ Неправильная начальная конфигурация: {config}")
        
        # ========================================================================
        # 2. Проверка инициализации сервисов
        # ========================================================================
        print("\n[2/5] Проверка инициализации сервисов...")
        
        admin_repo = AdminRepository()
        auth_attempts_repo = AuthAttemptsRepository()
        config_repo = ConfigRepository()
        password_hasher = PasswordHasher()
        jwt_service = JWTSessionService(
            secret_key="test_secret_key_32_chars_minimum_required_for_security",
            session_lifetime_hours=24
        )
        rate_limit_service = RateLimitService(auth_attempts_repo)
        role_service = RoleService()
        auth_service = AuthService(admin_repo, rate_limit_service, password_hasher)
        config_service = ConfigService(config_repo)
        
        print("      ✓ Все сервисы инициализированы успешно")
        
        # ========================================================================
        # 3. Проверка Dependency Injection
        # ========================================================================
        print("\n[3/5] Проверка Dependency Injection...")
        
        di_checks = [
            (auth_service._admin_repo is admin_repo, "AuthService -> AdminRepository"),
            (auth_service._rate_limiter is rate_limit_service, "AuthService -> RateLimitService"),
            (auth_service._hasher is password_hasher, "AuthService -> PasswordHasher"),
            (rate_limit_service._auth_attempts_repo is auth_attempts_repo, "RateLimitService -> AuthAttemptsRepository"),
            (config_service._config_repo is config_repo, "ConfigService -> ConfigRepository"),
        ]
        
        for check, name in di_checks:
            if check:
                print(f"      ✓ {name}")
            else:
                errors.append(f"DI: {name}")
                print(f"      ✗ {name}")
        
        # ========================================================================
        # 4. Проверка базовой функциональности
        # ========================================================================
        print("\n[4/5] Проверка базовой функциональности...")
        
        # 4.1 PasswordHasher
        try:
            test_password = "TestPassword123"
            password_hash = password_hasher.hash_password(test_password)
            
            if password_hash.startswith("$argon2id$"):
                print("      ✓ PasswordHasher: хеширование работает (Argon2id)")
            else:
                errors.append("PasswordHasher: неправильный формат хеша")
                print("      ✗ PasswordHasher: неправильный формат хеша")
            
            if password_hasher.verify_password(password_hash, test_password):
                print("      ✓ PasswordHasher: верификация работает")
            else:
                errors.append("PasswordHasher: верификация не работает")
                print("      ✗ PasswordHasher: верификация не работает")
            
            # Проверка уникальности солей
            hash2 = password_hasher.hash_password(test_password)
            if password_hash != hash2:
                print("      ✓ PasswordHasher: соли уникальны")
            else:
                errors.append("PasswordHasher: соли не уникальны")
                print("      ✗ PasswordHasher: соли не уникальны")
                
        except Exception as e:
            errors.append(f"PasswordHasher: {e}")
            print(f"      ✗ PasswordHasher: {e}")
        
        # 4.2 JWTSessionService
        try:
            token = jwt_service.generate_token(tg_id=123456, role=0)
            
            if token and len(token) > 0:
                print("      ✓ JWTSessionService: генерация токена работает")
            else:
                errors.append("JWTSessionService: токен не сгенерирован")
                print("      ✗ JWTSessionService: токен не сгенерирован")
            
            claims = jwt_service.validate_token(token)
            if claims and claims.tg_id == 123456 and claims.role == 0:
                print("      ✓ JWTSessionService: валидация токена работает")
            else:
                errors.append("JWTSessionService: валидация не работает")
                print("      ✗ JWTSessionService: валидация не работает")
                
        except Exception as e:
            errors.append(f"JWTSessionService: {e}")
            print(f"      ✗ JWTSessionService: {e}")
        
        # 4.3 RoleService
        try:
            role_name = RoleService.get_role_name(0)
            if role_name == "Разработчик":
                print("      ✓ RoleService: получение названий ролей работает")
            else:
                errors.append(f"RoleService: неправильное название роли: {role_name}")
                print(f"      ✗ RoleService: неправильное название роли: {role_name}")
            
            if RoleService.can_assign_operators(2) and not RoleService.can_assign_operators(3):
                print("      ✓ RoleService: проверка прав работает")
            else:
                errors.append("RoleService: проверка прав не работает")
                print("      ✗ RoleService: проверка прав не работает")
                
        except Exception as e:
            errors.append(f"RoleService: {e}")
            print(f"      ✗ RoleService: {e}")
        
        # 4.4 AdminRole enum
        try:
            if AdminRole.DEVELOPER.get_display_name() == "Разработчик":
                print("      ✓ AdminRole: enum работает корректно")
            else:
                errors.append("AdminRole: неправильное название роли")
                print("      ✗ AdminRole: неправильное название роли")
        except Exception as e:
            errors.append(f"AdminRole: {e}")
            print(f"      ✗ AdminRole: {e}")
        
        # 4.5 ConfigService
        try:
            session_lifetime = await config_service.get_session_lifetime()
            if session_lifetime == 24:
                print("      ✓ ConfigService: чтение конфигурации работает")
            else:
                errors.append(f"ConfigService: неправильное значение: {session_lifetime}")
                print(f"      ✗ ConfigService: неправильное значение: {session_lifetime}")
        except Exception as e:
            errors.append(f"ConfigService: {e}")
            print(f"      ✗ ConfigService: {e}")
        
        # ========================================================================
        # 5. Итоговый результат
        # ========================================================================
        print("\n[5/5] Итоговый результат...")
        print("=" * 80)
        
        if not errors:
            print("✓✓✓ CHECKPOINT 5 ПРОЙДЕН УСПЕШНО ✓✓✓")
            print()
            print("Все проверки пройдены:")
            print("  ✓ Миграции базы данных применены")
            print("  ✓ Все сервисы инициализируются корректно")
            print("  ✓ Dependency Injection работает правильно")
            print("  ✓ Базовая функциональность работает")
            print()
            print("Система готова к следующему этапу (Task 6: Telegram Bot Handlers)")
            print("=" * 80)
            return True
        else:
            print(f"✗✗✗ CHECKPOINT 5 НЕ ПРОЙДЕН ✗✗✗")
            print()
            print(f"Обнаружено ошибок: {len(errors)}")
            for i, error in enumerate(errors, 1):
                print(f"  {i}. {error}")
            print()
            print("Требуется исправление перед продолжением")
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


if __name__ == "__main__":
    result = asyncio.run(checkpoint_5_full_check())
    sys.exit(0 if result else 1)
