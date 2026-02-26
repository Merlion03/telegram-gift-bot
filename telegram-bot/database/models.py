"""
Модели SQLAlchemy для базы данных поддержки
"""
from datetime import datetime
from typing import List, Optional
from sqlalchemy import BigInteger, Boolean, String, Text, Integer, DateTime, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Базовый класс для всех моделей"""
    pass


class SupportSession(Base):
    """
    Модель сессии поддержки
    
    Представляет диалог пользователя со службой поддержки
    """
    __tablename__ = 'support_sessions'
    
    # Первичный ключ
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # Telegram ID пользователя
    telegram_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    
    # Статус сессии: 'active' или 'closed'
    status: Mapped[str] = mapped_column(
        String(20), 
        nullable=False, 
        default='active',
        index=True
    )
    
    # Временные метки
    created_at: Mapped[datetime] = mapped_column(
        DateTime, 
        nullable=False, 
        default=datetime.utcnow,
        index=True
    )
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # Связь с сообщениями (один ко многим)
    messages: Mapped[List["SupportMessage"]] = relationship(
        "SupportMessage",
        back_populates="session",
        cascade="all, delete-orphan",
        lazy="selectin"
    )
    
    def __repr__(self) -> str:
        return (
            f"<SupportSession(id={self.id}, "
            f"telegram_id={self.telegram_id}, "
            f"status='{self.status}', "
            f"created_at={self.created_at})>"
        )
    
    def is_active(self) -> bool:
        """Проверяет, активна ли сессия"""
        return self.status == 'active'
    
    def close(self) -> None:
        """Закрывает сессию"""
        self.status = 'closed'
        self.closed_at = datetime.utcnow()


class SupportMessage(Base):
    """
    Модель сообщения в рамках сессии поддержки
    
    Хранит сообщения от пользователя и от службы поддержки
    """
    __tablename__ = 'support_messages'
    
    # Первичный ключ
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # Внешний ключ на сессию
    session_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey('support_sessions.id', ondelete='CASCADE'),
        nullable=False,
        index=True
    )
    
    # Telegram ID отправителя
    telegram_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    
    # Тип сообщения: 'from_user' или 'from_support'
    message_type: Mapped[str] = mapped_column(String(20), nullable=False)
    
    # Текст сообщения
    message_text: Mapped[str] = mapped_column(Text, nullable=False)
    
    # ID файла для медиа-контента (опционально)
    file_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Временная метка создания
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        index=True
    )
    
    # Флаг доставки сообщения
    delivered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    
    # Связь с сессией (многие к одному)
    session: Mapped["SupportSession"] = relationship(
        "SupportSession",
        back_populates="messages"
    )
    
    def __repr__(self) -> str:
        return (
            f"<SupportMessage(id={self.id}, "
            f"session_id={self.session_id}, "
            f"message_type='{self.message_type}', "
            f"created_at={self.created_at})>"
        )
    
    def is_from_user(self) -> bool:
        """Проверяет, от пользователя ли сообщение"""
        return self.message_type == 'from_user'
    
    def is_from_support(self) -> bool:
        """Проверяет, от поддержки ли сообщение"""
        return self.message_type == 'from_support'
    
    def mark_delivered(self) -> None:
        """Отмечает сообщение как доставленное"""
        self.delivered = True
