"""
Модель GdprConsent для хранения согласий пользователей на обработку персональных данных

Отдельная таблица для независимого хранения GDPR согласий, не зависящая от наличия призов
"""
from datetime import datetime, timezone
from sqlalchemy import BigInteger, DateTime, Index, Integer
from sqlalchemy.orm import Mapped, mapped_column

from database.models.base import Base


class GdprConsent(Base):
    """
    Модель согласия на обработку персональных данных (GDPR)
    
    Хранит информацию о согласии пользователя независимо от таблицы prizes.
    Это обеспечивает сохранение согласия даже для пользователей без призов.
    
    Поля:
        id: Первичный ключ
        telegram_id: Telegram ID пользователя (уникальный)
        consent_date: Дата и время согласия
        created_at: Дата создания записи
        updated_at: Дата последнего обновления записи
    """
    __tablename__ = 'gdpr_consents'
    
    # Первичный ключ
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # Telegram ID пользователя (уникальный)
    telegram_id: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        unique=True,
        comment="Telegram ID пользователя"
    )
    
    # Дата и время согласия на обработку персональных данных
    consent_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        comment="Дата и время согласия на обработку персональных данных"
    )
    
    # Временные метки
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        comment="Дата создания записи"
    )
    
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        comment="Дата последнего обновления записи"
    )
    
    # Индексы для производительности
    __table_args__ = (
        # Уникальный индекс на telegram_id для быстрого поиска и предотвращения дублирования
        Index('idx_gdpr_consents_telegram_id', 'telegram_id', unique=True),
    )
    
    def __repr__(self) -> str:
        """Строковое представление модели для отладки"""
        return (
            f"<GdprConsent(id={self.id}, "
            f"telegram_id={self.telegram_id}, "
            f"consent_date='{self.consent_date.isoformat()}')>"
        )
