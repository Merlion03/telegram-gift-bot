"""
Модели SQLAlchemy для базы данных поддержки
"""
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import BigInteger, Boolean, String, Text, Integer, DateTime, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Базовый класс для всех моделей"""
    pass


class SupportSession(Base):
    """
    Модель сессии поддержки
    
    Представляет диалог пользователя со службой поддержки или обычный диалог с ботом
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
    
    # Тип сессии: 'chat' (обычный диалог с ботом) или 'support' (сессия поддержки)
    session_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default='chat',
        server_default='chat',
        index=True
    )
    
    # Временные метки
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=lambda: datetime.now(timezone.utc),
        index=True
    )
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Связь с сообщениями (один ко многим)
    messages: Mapped[List["SupportMessage"]] = relationship(
        "SupportMessage",
        back_populates="session",
        cascade="all, delete-orphan",
        lazy="selectin"
    )
    
    def __init__(
        self,
        telegram_id: int,
        status: str = 'active',
        session_type: str = 'chat',
        created_at: Optional[datetime] = None,
        closed_at: Optional[datetime] = None,
        **kwargs
    ):
        """
        Инициализация сессии с default значениями
        
        Args:
            telegram_id: Telegram ID пользователя
            status: Статус сессии (по умолчанию 'active')
            session_type: Тип сессии (по умолчанию 'chat')
            created_at: Время создания (по умолчанию текущее время UTC)
            closed_at: Время закрытия (опционально)
        """
        super().__init__(**kwargs)
        self.telegram_id = telegram_id
        self.status = status
        self.session_type = session_type
        self.created_at = created_at if created_at is not None else datetime.now(timezone.utc)
        self.closed_at = closed_at
    
    def __repr__(self) -> str:
        return (
            f"<SupportSession(id={self.id}, "
            f"telegram_id={self.telegram_id}, "
            f"status='{self.status}', "
            f"session_type='{self.session_type}', "
            f"created_at={self.created_at})>"
        )
    
    def is_active(self) -> bool:
        """Проверяет, активна ли сессия"""
        return self.status == 'active'
    
    def is_chat_session(self) -> bool:
        """Проверяет, является ли сессия обычным диалогом с ботом"""
        return self.session_type == 'chat'
    
    def is_support_session(self) -> bool:
        """Проверяет, является ли сессия сессией поддержки с администратором"""
        return self.session_type == 'support'
    
    def convert_to_support(self) -> None:
        """
        Преобразует обычный диалог (chat) в сессию поддержки (support)
        
        Используется когда:
        - Пользователь нажимает кнопку "Позвать человека"
        - Администратор отправляет первое сообщение в обычный диалог
        """
        self.session_type = 'support'
    
    def close(self) -> None:
        """Закрывает сессию"""
        self.status = 'closed'
        self.closed_at = datetime.now(timezone.utc)


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
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True
    )
    
    # Флаг доставки сообщения
    delivered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    
    # Связь с сессией (многие к одному)
    session: Mapped["SupportSession"] = relationship(
        "SupportSession",
        back_populates="messages"
    )
    
    def __init__(
        self,
        session_id: int,
        telegram_id: int,
        message_type: str,
        message_text: str,
        file_id: Optional[str] = None,
        created_at: Optional[datetime] = None,
        delivered: bool = False,
        **kwargs
    ):
        """
        Инициализация сообщения с default значениями
        
        Args:
            session_id: ID сессии
            telegram_id: Telegram ID отправителя
            message_type: Тип сообщения ('from_user', 'from_support', 'from_bot')
            message_text: Текст сообщения
            file_id: ID файла для медиа (опционально)
            created_at: Время создания (по умолчанию текущее время UTC)
            delivered: Флаг доставки (по умолчанию False)
        """
        super().__init__(**kwargs)
        self.session_id = session_id
        self.telegram_id = telegram_id
        self.message_type = message_type
        self.message_text = message_text
        self.file_id = file_id
        self.created_at = created_at if created_at is not None else datetime.now(timezone.utc)
        self.delivered = delivered
    
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
    
    def is_from_bot(self) -> bool:
        """Проверяет, от бота ли сообщение"""
        return self.message_type == 'from_bot'
    
    def mark_delivered(self) -> None:
        """Отмечает сообщение как доставленное"""
        self.delivered = True
