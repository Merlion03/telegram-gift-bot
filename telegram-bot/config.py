"""
Модуль конфигурации для Telegram бота.
Загружает все настройки из переменных окружения.
"""

import os
from dataclasses import dataclass
from typing import Optional
from dotenv import load_dotenv

# Загрузка переменных окружения из .env файла
load_dotenv()


@dataclass
class BotConfig:
    """Конфигурация Telegram бота"""
    token: str
    
    @classmethod
    def from_env(cls) -> 'BotConfig':
        """Создаёт конфигурацию из переменных окружения"""
        token = os.getenv('BOT_TOKEN')
        if not token:
            raise ValueError('BOT_TOKEN не установлен в переменных окружения')
        return cls(token=token)


@dataclass
class GoogleSheetsConfig:
    """Конфигурация Google Sheets API"""
    credentials_path: str
    spreadsheet_id: str
    
    @classmethod
    def from_env(cls) -> 'GoogleSheetsConfig':
        """Создаёт конфигурацию из переменных окружения"""
        credentials_path = os.getenv('GOOGLE_CREDENTIALS_PATH')
        spreadsheet_id = os.getenv('SPREADSHEET_ID')
        
        if not credentials_path:
            raise ValueError('GOOGLE_CREDENTIALS_PATH не установлен в переменных окружения')
        if not spreadsheet_id:
            raise ValueError('SPREADSHEET_ID не установлен в переменных окружения')
            
        return cls(
            credentials_path=credentials_path,
            spreadsheet_id=spreadsheet_id
        )


@dataclass
class DatabaseConfig:
    """Конфигурация PostgreSQL базы данных"""
    host: str
    port: int
    name: str
    user: str
    password: str
    
    @property
    def connection_url(self) -> str:
        """Возвращает URL для подключения к базе данных"""
        return f"postgresql+psycopg://{self.user}:{self.password}@{self.host}:{self.port}/{self.name}"
    
    @classmethod
    def from_env(cls) -> 'DatabaseConfig':
        """Создаёт конфигурацию из переменных окружения"""
        host = os.getenv('DB_HOST', 'localhost')
        port = int(os.getenv('DB_PORT', '5432'))
        name = os.getenv('DB_NAME')
        user = os.getenv('DB_USER')
        password = os.getenv('DB_PASSWORD')
        
        if not name:
            raise ValueError('DB_NAME не установлен в переменных окружения')
        if not user:
            raise ValueError('DB_USER не установлен в переменных окружения')
        if not password:
            raise ValueError('DB_PASSWORD не установлен в переменных окружения')
            
        return cls(
            host=host,
            port=port,
            name=name,
            user=user,
            password=password
        )


@dataclass
class FSMConfig:
    """Конфигурация FSM storage"""
    storage_type: str  # 'memory' или 'redis'
    redis_url: Optional[str] = None
    
    @classmethod
    def from_env(cls) -> 'FSMConfig':
        """Создаёт конфигурацию из переменных окружения"""
        storage_type = os.getenv('FSM_STORAGE_TYPE', 'memory')
        redis_url = os.getenv('REDIS_URL')
        
        if storage_type == 'redis' and not redis_url:
            raise ValueError('REDIS_URL должен быть установлен при использовании Redis storage')
            
        return cls(
            storage_type=storage_type,
            redis_url=redis_url
        )


@dataclass
class AppConfig:
    """Общая конфигурация приложения"""
    webapp_url: str
    log_level: str
    
    @classmethod
    def from_env(cls) -> 'AppConfig':
        """Создаёт конфигурацию из переменных окружения"""
        webapp_url = os.getenv('WEBAPP_URL')
        log_level = os.getenv('LOG_LEVEL', 'INFO')
        
        if not webapp_url:
            raise ValueError('WEBAPP_URL не установлен в переменных окружения')
            
        return cls(
            webapp_url=webapp_url,
            log_level=log_level
        )


@dataclass
class Config:
    """Главная конфигурация системы"""
    bot: BotConfig
    google_sheets: GoogleSheetsConfig
    database: DatabaseConfig
    app: AppConfig
    fsm: FSMConfig
    
    @classmethod
    def load(cls) -> 'Config':
        """Загружает всю конфигурацию из переменных окружения"""
        return cls(
            bot=BotConfig.from_env(),
            google_sheets=GoogleSheetsConfig.from_env(),
            database=DatabaseConfig.from_env(),
            app=AppConfig.from_env(),
            fsm=FSMConfig.from_env()
        )


# Глобальный экземпляр конфигурации
config: Optional[Config] = None


def get_config() -> Config:
    """
    Возвращает глобальный экземпляр конфигурации.
    Создаёт его при первом вызове.
    """
    global config
    if config is None:
        config = Config.load()
    return config
