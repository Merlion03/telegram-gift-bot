"""
Центральный сервис аутентификации и регистрации администраторов
"""

from typing import Optional
from models.administrator import Administrator
from utils.logger import get_logger

logger = get_logger(__name__)


class AuthService:
    """
    Сервис аутентификации администраторов
    
    Обеспечивает:
    - Регистрацию пароля для новых администраторов
    - Аутентификацию существующих администраторов
    - Проверку первого входа
    - Защиту от brute-force через rate limiting
    - Единообразные сообщения об ошибках
    
    Validates: Requirements 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5, 12.4, 12.5
    """
    
    def __init__(
        self,
        admin_repository,
        rate_limit_service,
        password_hasher
    ):
        """
        Инициализирует сервис аутентификации
        
        Args:
            admin_repository: Репозиторий для работы с администраторами
            rate_limit_service: Сервис rate limiting
            password_hasher: Сервис хеширования паролей
        """
        self._admin_repo = admin_repository
        self._rate_limiter = rate_limit_service
        self._hasher = password_hasher
    
    async def register_password(self, tg_id: int, password: str) -> Administrator:
        """
        Регистрирует пароль для нового администратора
        
        Логика:
        1. Проверяет существование администратора
        2. Проверяет, что это первый вход (password_hash IS NULL)
        3. Хеширует пароль
        4. Обновляет password_hash в БД
        5. Возвращает обновлённого администратора
        
        Args:
            tg_id: Telegram ID администратора
            password: Открытый пароль для установки
        
        Returns:
            Administrator с установленным паролем
        
        Raises:
            ValueError: Если администратор не найден или пароль уже установлен
        
        Examples:
            >>> admin = await service.register_password(123456789, "MySecurePassword123")
            >>> admin.password_hash is not None
            True
        
        Validates: Requirements 8.1, 8.2, 8.3, 8.4
        """
        # Проверяем валидность пароля
        if not password or len(password) < 8:
            raise ValueError("Пароль должен содержать минимум 8 символов")
        
        # Получаем администратора из БД
        admin = await self._admin_repo.get_by_tg_id(tg_id)
        
        if admin is None:
            # Не раскрываем существование tg_id
            raise ValueError("Ошибка регистрации пароля")
        
        # Проверяем, что это первый вход
        if not admin.is_first_login():
            raise ValueError("Пароль уже установлен")
        
        # Хешируем пароль
        password_hash = self._hasher.hash_password(password)
        
        # Обновляем password_hash в БД
        await self._admin_repo.update_password(tg_id, password_hash)
        
        # Получаем обновлённого администратора
        updated_admin = await self._admin_repo.get_by_tg_id(tg_id)
        
        if updated_admin is None:
            logger.error(
                "password_registration_failed",
                extra={"tg_id": tg_id, "reason": "admin_not_found_after_update"}
            )
            raise ValueError("Ошибка обновления пароля")
        
        logger.info(
            "password_registered_successfully",
            extra={"tg_id": tg_id, "username": updated_admin.username, "role": updated_admin.role}
        )
        
        return updated_admin
    
    async def authenticate(self, tg_id: int, password: str) -> Optional[Administrator]:
        """
        Аутентифицирует администратора
        
        Логика:
        1. Проверяет rate limit
        2. Получает администратора из БД
        3. Верифицирует пароль
        4. Если успех - очищает попытки, возвращает администратора
        5. Если неудача - записывает попытку, возвращает None
        
        Args:
            tg_id: Telegram ID администратора
            password: Открытый пароль для проверки
        
        Returns:
            Administrator если аутентификация успешна
            None если аутентификация неудачна или превышен rate limit
        
        Examples:
            >>> # Успешная аутентификация
            >>> admin = await service.authenticate(123456789, "CorrectPassword")
            >>> admin is not None
            True
            
            >>> # Неудачная аутентификация
            >>> admin = await service.authenticate(123456789, "WrongPassword")
            >>> admin is None
            True
        
        Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 12.4, 12.5
        """
        # Проверяем rate limit
        rate_limit_result = await self._rate_limiter.check_rate_limit(tg_id)
        
        if not rate_limit_result.allowed:
            # Превышен лимит попыток - блокируем
            logger.warning(
                "authentication_blocked_rate_limit",
                extra={
                    "tg_id": tg_id,
                    "attempts_count": rate_limit_result.attempts_count,
                    "blocked_until": rate_limit_result.blocked_until.isoformat() if rate_limit_result.blocked_until else None
                }
            )
            return None
        
        # Получаем администратора из БД
        admin = await self._admin_repo.get_by_tg_id(tg_id)
        
        if admin is None:
            # Администратор не найден
            # Записываем попытку для защиты от перебора tg_id
            await self._rate_limiter.record_failed_attempt(tg_id)
            logger.warning(
                "authentication_failed",
                extra={"tg_id": tg_id, "reason": "admin_not_found"}
            )
            # Не раскрываем существование tg_id - единообразное сообщение
            return None
        
        # Проверяем, что пароль установлен
        if admin.is_first_login():
            # Пароль не установлен - это первый вход
            await self._rate_limiter.record_failed_attempt(tg_id)
            logger.warning(
                "authentication_failed",
                extra={"tg_id": tg_id, "reason": "password_not_set"}
            )
            return None
        
        # Верифицируем пароль
        password_valid = self._hasher.verify_password(admin.password_hash, password)
        
        if not password_valid:
            # Пароль неверный - записываем попытку
            await self._rate_limiter.record_failed_attempt(tg_id)
            logger.warning(
                "authentication_failed",
                extra={"tg_id": tg_id, "reason": "invalid_password"}
            )
            return None
        
        # Аутентификация успешна - очищаем попытки
        await self._rate_limiter.clear_attempts(tg_id)
        
        logger.info(
            "authentication_successful",
            extra={"tg_id": tg_id, "username": admin.username, "role": admin.role}
        )
        
        return admin
    
    async def is_first_login(self, tg_id: int) -> bool:
        """
        Проверяет, первый ли это вход администратора
        
        Args:
            tg_id: Telegram ID администратора
        
        Returns:
            True если password_hash IS NULL (первый вход)
            False если пароль уже установлен или администратор не найден
        
        Examples:
            >>> # Новый администратор
            >>> is_first = await service.is_first_login(123456789)
            >>> is_first
            True
            
            >>> # После установки пароля
            >>> await service.register_password(123456789, "Password123")
            >>> is_first = await service.is_first_login(123456789)
            >>> is_first
            False
        
        Validates: Requirements 8.1
        """
        admin = await self._admin_repo.get_by_tg_id(tg_id)
        
        if admin is None:
            return False
        
        return admin.is_first_login()
