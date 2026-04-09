"""
Модели для системы поддержки

Содержит модели для сессий поддержки и сообщений
"""
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import BigInteger, Boolean, String, Text, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.models.base import Base


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
    
    # Время последней активности (для автоматического закрытия неактивных сессий)
    last_activity: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        index=True
    )
    
    # Флаг запроса помощи пользователем через кнопку "Нужна помощь"
    help_needed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    
    # Информация о пользователе из Telegram
    first_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
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
        last_activity: Optional[datetime] = None,
        help_needed: bool = False,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
        username: Optional[str] = None,
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
            last_activity: Время последней активности (по умолчанию текущее время UTC)
            help_needed: Флаг запроса помощи пользователем (по умолчанию False)
            first_name: Имя пользователя из Telegram (опционально)
            last_name: Фамилия пользователя из Telegram (опционально)
            username: Username пользователя из Telegram (опционально)
        """
        super().__init__(**kwargs)
        self.telegram_id = telegram_id
        self.status = status
        self.session_type = session_type
        self.created_at = created_at if created_at is not None else datetime.now(timezone.utc)
        self.closed_at = closed_at
        self.last_activity = last_activity if last_activity is not None else datetime.now(timezone.utc)
        self.help_needed = help_needed
        self.first_name = first_name
        self.last_name = last_name
        self.username = username
    
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
    
    def set_help_needed(self, value: bool) -> None:
        """
        Устанавливает флаг запроса помощи пользователем
        
        Args:
            value: Значение флага (True - помощь нужна, False - помощь не нужна)
        """
        import logging
        logger = logging.getLogger(__name__)
        
        self.help_needed = value
        logger.info(
            f"Установлен флаг help_needed={value} для сессии {self.id} "
            f"(telegram_id={self.telegram_id})"
        )
    
    def reset_help_needed(self) -> None:
        """
        Сбрасывает флаг запроса помощи пользователем в False
        
        Используется когда оператор открывает диалог и читает сообщения
        """
        import logging
        logger = logging.getLogger(__name__)
        
        self.help_needed = False
        logger.info(
            f"Сброшен флаг help_needed для сессии {self.id} "
            f"(telegram_id={self.telegram_id})"
        )
    
    def get_user_display_name(self) -> str:
        """
        Возвращает отображаемое имя пользователя
        
        Приоритет:
        1. Имя + Фамилия (если есть оба)
        2. Только имя (если есть)
        3. Username (если есть)
        4. "Пользователь {telegram_id}" (fallback)
        """
        if self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        elif self.first_name:
            return self.first_name
        elif self.username:
            return f"@{self.username}"
        else:
            return f"Пользователь {self.telegram_id}"


class SupportMessage(Base):
    """
    Модель сообщения в рамках сессии поддержки
    
    Хранит сообщения от пользователя и от службы поддержки
    Поддерживает медиа-контент: фото, видео, анимации, стикеры, голосовые, документы
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
    
    # НОВЫЕ ПОЛЯ для медиа-контента
    # Тип медиа: text, photo, video, animation, sticker, voice, document
    media_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default='text',
        index=True
    )
    
    # Путь к файлу на сервере (относительно telegram-bot/media)
    file_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Текстовое описание медиафайла (caption)
    caption: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Размер файла в байтах
    file_size: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    
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
        media_type: str = 'text',  # NEW
        file_path: Optional[str] = None,  # NEW
        caption: Optional[str] = None,  # NEW
        file_size: Optional[int] = None,  # NEW
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
            media_type: Тип медиа-контента (по умолчанию 'text')
            file_path: Путь к файлу на сервере (опционально)
            caption: Текстовое описание медиа (опционально)
            file_size: Размер файла в байтах (опционально)
        """
        super().__init__(**kwargs)
        self.session_id = session_id
        self.telegram_id = telegram_id
        self.message_type = message_type
        self.message_text = message_text
        self.file_id = file_id
        self.created_at = created_at if created_at is not None else datetime.now(timezone.utc)
        self.delivered = delivered
        self.media_type = media_type
        self.file_path = file_path
        self.caption = caption
        self.file_size = file_size
    
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
    
    def is_media_message(self) -> bool:
        """Проверяет, является ли сообщение медиа-контентом"""
        return self.media_type != 'text'
    
    def has_caption(self) -> bool:
        """Проверяет, есть ли у медиа caption"""
        return self.caption is not None and len(self.caption) > 0
