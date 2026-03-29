"""
Сервис управления JWT сессиями для администраторов
"""

import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional
from dataclasses import dataclass
from utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class SessionClaims:
    """
    JWT claims для сессии администратора
    
    Attributes:
        tg_id: Telegram ID администратора
        role: Уровень роли администратора
        exp: Expiration Time (Unix timestamp)
        iat: Issued At (Unix timestamp)
    """
    tg_id: int
    role: int
    exp: int
    iat: int


class JWTSessionService:
    """
    Сервис управления сессиями через JWT токены
    
    Использует алгоритм HS256 для подписи токенов.
    Токены содержат tg_id, role и временные метки (iat, exp).
    
    Примечание: Используем название JWTSessionService, чтобы избежать 
    конфликта с существующим services/session_manager.py (для support сессий)
    
    Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 12.1, 12.2, 12.3
    """
    
    def __init__(self, secret_key: str, session_lifetime_hours: int = 24):
        """
        Инициализирует сервис JWT сессий
        
        Args:
            secret_key: Секретный ключ для подписи JWT (минимум 32 символа)
            session_lifetime_hours: Время жизни сессии в часах (по умолчанию 24)
        
        Raises:
            ValueError: Если secret_key пустой или слишком короткий
        """
        if not secret_key or len(secret_key) < 32:
            raise ValueError("Secret key должен быть минимум 32 символа")
        
        if session_lifetime_hours <= 0:
            raise ValueError("Session lifetime должен быть положительным числом")
        
        self._secret_key = secret_key
        self._session_lifetime_hours = session_lifetime_hours
        self._algorithm = "HS256"
    
    def generate_token(self, tg_id: int, role: int) -> str:
        """
        Генерирует JWT токен для администратора
        
        Args:
            tg_id: Telegram ID администратора
            role: Уровень роли администратора (0-3)
        
        Returns:
            JWT токен в виде строки
        
        Raises:
            ValueError: Если tg_id или role невалидны
        
        Examples:
            >>> service = JWTSessionService("my_secret_key_32_characters_long", 24)
            >>> token = service.generate_token(123456789, 0)
            >>> isinstance(token, str)
            True
            >>> len(token) > 0
            True
        
        Validates: Requirements 10.1, 10.2, 10.5
        """
        if tg_id <= 0:
            raise ValueError("tg_id должен быть положительным числом")
        
        if role < 0 or role > 3:
            raise ValueError("role должен быть в диапазоне 0-3")
        
        # Вычисляем временные метки
        # ИСПРАВЛЕНИЕ: Используем datetime.now(timezone.utc) вместо utcnow()
        # для корректной работы с timestamp()
        now = datetime.now(timezone.utc)
        iat = int(now.timestamp())
        exp = int((now + timedelta(hours=self._session_lifetime_hours)).timestamp())
        
        # Формируем payload
        payload = {
            'tg_id': tg_id,
            'role': role,
            'iat': iat,
            'exp': exp
        }
        
        try:
            # Генерируем JWT токен
            token = jwt.encode(payload, self._secret_key, algorithm=self._algorithm)
            
            logger.debug(
                "jwt_token_generated",
                extra={"tg_id": tg_id, "role": role, "exp": exp, "iat": iat}
            )
            
            return token
        except Exception as e:
            logger.error(
                "jwt_generation_failed",
                extra={"tg_id": tg_id, "role": role, "error": str(e)}
            )
            raise ValueError(f"Ошибка генерации JWT токена: {str(e)}")
    
    def validate_token(self, token: str) -> Optional[SessionClaims]:
        """
        Валидирует JWT токен и возвращает claims
        
        Проверяет:
        - Корректность подписи
        - Срок действия токена (exp claim)
        - Наличие обязательных полей
        
        Args:
            token: JWT токен для валидации
        
        Returns:
            SessionClaims если токен валиден
            None если токен невалиден или истёк
        
        Examples:
            >>> service = JWTSessionService("my_secret_key_32_characters_long", 24)
            >>> token = service.generate_token(123456789, 0)
            >>> claims = service.validate_token(token)
            >>> claims.tg_id
            123456789
            >>> claims.role
            0
        
        Validates: Requirements 10.3, 10.4, 12.1, 12.2, 12.3
        """
        if not token:
            return None
        
        try:
            # Декодируем и валидируем токен
            # verify_exp=True автоматически проверяет срок действия
            payload = jwt.decode(
                token,
                self._secret_key,
                algorithms=[self._algorithm],
                options={'verify_exp': True}
            )
            
            # Проверяем наличие обязательных полей
            required_fields = ['tg_id', 'role', 'iat', 'exp']
            if not all(field in payload for field in required_fields):
                logger.debug(
                    "jwt_validation_failed",
                    extra={"reason": "missing_required_fields"}
                )
                return None
            
            # Создаём и возвращаем SessionClaims
            claims = SessionClaims(
                tg_id=payload['tg_id'],
                role=payload['role'],
                exp=payload['exp'],
                iat=payload['iat']
            )
            
            logger.debug(
                "jwt_token_validated",
                extra={"tg_id": claims.tg_id, "role": claims.role}
            )
            
            return claims
        
        except jwt.ExpiredSignatureError:
            # Токен истёк - это нормальная ситуация
            logger.debug("jwt_validation_failed", extra={"reason": "token_expired"})
            return None
        except jwt.InvalidSignatureError:
            # Неправильная подпись - возможная атака
            logger.warning("jwt_validation_failed", extra={"reason": "invalid_signature"})
            return None
        except jwt.DecodeError:
            # Невалидный формат токена
            logger.debug("jwt_validation_failed", extra={"reason": "decode_error"})
            return None
        except jwt.InvalidTokenError:
            # Любая другая ошибка валидации токена
            logger.debug("jwt_validation_failed", extra={"reason": "invalid_token"})
            return None
        except Exception as e:
            # Непредвиденная ошибка
            logger.error("jwt_validation_error", extra={"error": str(e)})
            return None
    
    def is_token_expired(self, token: str) -> bool:
        """
        Проверяет истечение срока токена
        
        Args:
            token: JWT токен для проверки
        
        Returns:
            True если токен истёк или невалиден
            False если токен ещё действителен
        
        Examples:
            >>> service = JWTSessionService("my_secret_key_32_characters_long", 24)
            >>> token = service.generate_token(123456789, 0)
            >>> service.is_token_expired(token)
            False
        
        Validates: Requirements 10.4
        """
        claims = self.validate_token(token)
        
        if claims is None:
            # Токен невалиден или истёк
            return True
        
        # Проверяем exp claim
        # ИСПРАВЛЕНИЕ: Используем datetime.now(timezone.utc) вместо utcnow()
        current_timestamp = int(datetime.now(timezone.utc).timestamp())
        return current_timestamp > claims.exp
