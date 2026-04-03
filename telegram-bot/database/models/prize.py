"""
Модель Prize для хранения данных о призах из Google Sheets

Используется для быстрого доступа к данным призов без обращения к Google Sheets API
"""
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import BigInteger, String, Text, Integer, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column

from database.models import Base


class Prize(Base):
    """
    Модель приза из Google Sheets
    
    Хранит информацию о призах для быстрого доступа без обращения к Google Sheets API.
    Синхронизируется с Google Sheets через Sync Service каждые 60 секунд.
    
    Поля:
        gdpr_consent_date: Дата и время согласия пользователя на обработку персональных данных (GDPR)
        country: Страна доставки физического приза (добавлено для полноты адреса)
        postal_code: Почтовый индекс для доставки физического приза (добавлено для полноты адреса)
    """
    __tablename__ = 'prizes'
    
    # Первичный ключ
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # Telegram ID пользователя
    telegram_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    
    # Username пользователя в Telegram (например @username)
    username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Тип приза: 'digital' или 'physical'
    prize_type: Mapped[str] = mapped_column(String(20), nullable=False)
    
    # Данные для цифрового приза
    promo_code: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Данные для физического приза (адрес доставки)
    last_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    first_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    patronymic: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, comment="Страна доставки физического приза")
    postal_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, comment="Почтовый индекс для доставки физического приза")
    city: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    street: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    house: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    apartment: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Метаданные синхронизации
    sheet_name: Mapped[str] = mapped_column(String(255), nullable=False)
    code_word: Mapped[str] = mapped_column(String(255), nullable=False)
    row_id: Mapped[int] = mapped_column(Integer, nullable=False)
    
    # Временные метки
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )
    
    # Дата согласия на обработку персональных данных (GDPR)
    gdpr_consent_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Дата и время согласия на обработку персональных данных"
    )
    
    # Дата получения приза (когда пользователь ввел правильное кодовое слово)
    claimed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Дата и время получения приза пользователем"
    )
    
    # Индексы для производительности
    __table_args__ = (
        # Уникальный составной индекс для предотвращения дублирования
        # Один пользователь может иметь только один приз с конкретным кодовым словом
        Index('idx_prizes_telegram_code', 'telegram_id', 'code_word', unique=True),
        
        # Индекс для быстрого поиска по кодовому слову
        Index('idx_prizes_code_word', 'code_word'),
        
        # Индекс для быстрого поиска по листу (для синхронизации)
        Index('idx_prizes_sheet_name', 'sheet_name'),
        
        # Индекс для быстрого поиска по GDPR согласию
        Index('idx_prizes_gdpr_consent', 'telegram_id', 'gdpr_consent_date'),
        
        # Индекс для быстрого поиска неполученных призов
        Index('idx_prizes_unclaimed', 'telegram_id', 'claimed_at'),
    )
    
    def __repr__(self) -> str:
        """Строковое представление модели для отладки"""
        return (
            f"<Prize(id={self.id}, "
            f"telegram_id={self.telegram_id}, "
            f"code_word='{self.code_word}', "
            f"prize_type='{self.prize_type}')>"
        )
    
    def is_digital(self) -> bool:
        """Проверяет, является ли приз цифровым"""
        return self.prize_type == 'digital'
    
    def is_physical(self) -> bool:
        """Проверяет, является ли приз физическим"""
        return self.prize_type == 'physical'
    
    def has_delivery_data(self) -> bool:
        """
        Проверяет, заполнены ли данные доставки для физического приза
        
        Returns:
            bool: True если все обязательные поля доставки заполнены
        """
        if not self.is_physical():
            return False
        
        return all([
            self.last_name,
            self.first_name,
            self.city,
            self.street,
            self.house,
            self.phone
        ])
    
    def has_gdpr_consent(self) -> bool:
        """
        Проверяет наличие согласия на обработку персональных данных
        
        Returns:
            bool: True если согласие дано (gdpr_consent_date не None), False иначе
        """
        return self.gdpr_consent_date is not None
