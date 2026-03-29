"""
Сервис управления конфигурацией системы
"""


class ConfigService:
    """
    Сервис управления конфигурацией времени жизни сессий
    
    Обеспечивает:
    - Получение текущего времени жизни сессий
    - Установку времени жизни сессий с проверкой прав
    - Валидацию значений конфигурации
    
    Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5
    """
    
    def __init__(self, config_repository):
        """
        Инициализирует сервис конфигурации
        
        Args:
            config_repository: Репозиторий для работы с конфигурацией
        """
        self._config_repo = config_repository
    
    async def get_session_lifetime(self) -> int:
        """
        Получает текущее время жизни сессий в часах
        
        Returns:
            Время жизни сессий в часах (по умолчанию 24)
        
        Examples:
            >>> lifetime = await service.get_session_lifetime()
            >>> lifetime
            24
        
        Validates: Requirements 11.1, 11.2
        """
        return await self._config_repo.get_session_lifetime_hours()
    
    async def set_session_lifetime(self, hours: int, admin_role: int) -> bool:
        """
        Устанавливает время жизни сессий
        
        Проверяет права доступа - только Developer (0) и Assistant (1)
        могут изменять конфигурацию.
        
        Args:
            hours: Время жизни сессий в часах (должно быть > 0)
            admin_role: Роль администратора, выполняющего операцию
        
        Returns:
            True если конфигурация успешно обновлена
            False если недостаточно прав или невалидное значение
        
        Examples:
            >>> # Developer может изменять
            >>> success = await service.set_session_lifetime(48, admin_role=0)
            >>> success
            True
            
            >>> # Assistant может изменять
            >>> success = await service.set_session_lifetime(24, admin_role=1)
            >>> success
            True
            
            >>> # Administrator не может изменять
            >>> success = await service.set_session_lifetime(12, admin_role=2)
            >>> success
            False
            
            >>> # Operator не может изменять
            >>> success = await service.set_session_lifetime(12, admin_role=3)
            >>> success
            False
            
            >>> # Невалидное значение
            >>> success = await service.set_session_lifetime(0, admin_role=0)
            >>> success
            False
        
        Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5
        """
        # Проверяем права доступа (только Developer и Assistant)
        if admin_role > 1:
            return False
        
        # Валидация: hours должен быть положительным числом
        if hours <= 0:
            return False
        
        try:
            # Устанавливаем новое значение
            await self._config_repo.set_session_lifetime_hours(hours)
            return True
        except Exception:
            # Ошибка при обновлении конфигурации
            return False
