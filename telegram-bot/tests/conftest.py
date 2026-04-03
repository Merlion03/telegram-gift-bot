"""
Конфигурация pytest и фикстуры для тестов
"""
import asyncio
import os
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool

from database.models import Base
from database.models.prize import Prize


@pytest_asyncio.fixture(scope="function")
async def test_db_engine():
    """
    Создаёт тестовый движок БД для каждого теста
    Использует настройки из .env.test
    """
    # Получаем настройки из переменных окружения
    db_host = os.getenv("DB_HOST", "localhost")
    db_port = os.getenv("DB_PORT", "5433")
    db_name = os.getenv("DB_NAME", "telegram_bot")
    db_user = os.getenv("DB_USER", "postgres")
    db_password = os.getenv("DB_PASSWORD", "postgres")
    
    # Создаём URL подключения
    database_url = f"postgresql+asyncpg://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    
    # Создаём движок с NullPool для тестов
    engine = create_async_engine(
        database_url,
        poolclass=NullPool,
        echo=False
    )
    
    # Создаём все таблицы
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    # Очищаем все таблицы после теста
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def test_db_session(test_db_engine):
    """
    Создаёт тестовую сессию БД для каждого теста
    """
    async_session_maker = async_sessionmaker(
        test_db_engine,
        class_=AsyncSession,
        expire_on_commit=False
    )
    
    async with async_session_maker() as session:
        yield session


@pytest_asyncio.fixture
async def prize_repository(test_db_session):
    """
    Создаёт экземпляр PrizeRepository для тестов
    Передаёт существующую сессию в репозиторий
    """
    from database.repositories.prize_repository import PrizeRepository
    return PrizeRepository(session=test_db_session)


@pytest_asyncio.fixture
async def create_prize_in_db(test_db_session):
    """
    Фикстура-фабрика для создания призов в тестовой БД
    
    Использование:
        prize = await create_prize_in_db(
            telegram_id=123456,
            prize_type="digital",
            promo_code="PROMO2024",
            claimed_at=datetime.now(timezone.utc)
        )
    """
    async def _create_prize(
        telegram_id: int,
        prize_type: str,
        code_word: str = "тестовое_слово",
        sheet_name: str = "Лист1",
        row_id: int = 1,
        promo_code: str = None,
        instructions: str = None,
        claimed_at: datetime = None,
        gdpr_consent_date: datetime = None,
        # Поля для физического приза
        last_name: str = None,
        first_name: str = None,
        patronymic: str = None,
        country: str = None,
        postal_code: str = None,
        city: str = None,
        street: str = None,
        house: str = None,
        apartment: str = None,
        phone: str = None,
        comment: str = None,
        username: str = None
    ) -> Prize:
        """Создаёт приз в БД и возвращает его"""
        prize = Prize(
            telegram_id=telegram_id,
            username=username,
            prize_type=prize_type,
            promo_code=promo_code,
            instructions=instructions,
            last_name=last_name,
            first_name=first_name,
            patronymic=patronymic,
            country=country,
            postal_code=postal_code,
            city=city,
            street=street,
            house=house,
            apartment=apartment,
            phone=phone,
            comment=comment,
            sheet_name=sheet_name,
            code_word=code_word,
            row_id=row_id,
            claimed_at=claimed_at,
            gdpr_consent_date=gdpr_consent_date or datetime.now(timezone.utc)
        )
        
        test_db_session.add(prize)
        await test_db_session.commit()
        await test_db_session.refresh(prize)
        
        return prize
    
    return _create_prize



@pytest_asyncio.fixture
async def prize_service(prize_repository, test_db_session):
    """
    Создаёт экземпляр PrizeService для тестов
    """
    from services.prize_service import PrizeService
    from database.repositories.gdpr_consent_repository import GdprConsentRepository
    from unittest.mock import Mock
    
    # Создаём mock для GoogleSheetsService
    mock_sheets_service = Mock()
    
    # Создаём GdprConsentRepository с тестовой сессией
    gdpr_consent_repository = GdprConsentRepository(session=test_db_session)
    
    return PrizeService(
        sheets_service=mock_sheets_service,
        prize_repository=prize_repository,
        gdpr_consent_repository=gdpr_consent_repository
    )
