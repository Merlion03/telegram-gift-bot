"""
Конфигурация Alembic для автоматической генерации миграций
"""
import sys
import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Добавляем корневую папку проекта в sys.path для импорта модулей
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# Импортируем конфигурацию и модели
from config import get_config
from database.models.base import Base

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Импортируем все модели для автогенерации
from database.models.prize import Prize
from database.models.support import SupportSession

# Метаданные для автогенерации миграций
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """
    Запуск миграций в 'offline' режиме.
    
    Настраивает контекст только с URL без создания Engine.
    """
    # Получаем URL базы данных из нашей конфигурации
    app_config = get_config()
    url = app_config.database.connection_url
    
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Запуск миграций в 'online' режиме.
    
    Создаёт Engine и связывает соединение с контекстом.
    """
    # Получаем конфигурацию базы данных
    app_config = get_config()
    
    # Создаём конфигурацию для SQLAlchemy
    configuration = config.get_section(config.config_ini_section)
    configuration['sqlalchemy.url'] = app_config.database.connection_url
    
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, 
            target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
