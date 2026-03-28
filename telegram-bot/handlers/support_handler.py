"""
Обработчик режима поддержки.
Управляет сессиями поддержки и перехватывает сообщения пользователей.
"""

from typing import Optional
from aiogram import Router
from aiogram.types import Message, CallbackQuery
from aiogram.fsm.context import FSMContext
from aiogram.filters import StateFilter
import structlog

from services.support_service import SupportService
from fsm.states import SupportStates
from keyboards.reply_keyboards import get_support_end_keyboard
from constants import (
    SUPPORT_SESSION_STARTED,
    SUPPORT_START_ERROR,
    SUPPORT_NO_SESSION_ERROR,
    SUPPORT_MESSAGE_SAVE_ERROR,
    SUPPORT_SESSION_ENDED,
    SUPPORT_END_ERROR
)

logger = structlog.get_logger(__name__)

# Создаём router для обработчиков поддержки
router = Router()


class SupportHandler:
    """Обработчик режима поддержки"""
    
    def __init__(self, support_service: SupportService, session_manager=None):
        """
        Инициализирует обработчик поддержки
        
        Args:
            support_service: Сервис для работы с поддержкой
            session_manager: Менеджер сессий для сохранения ответов бота (опционально)
        """
        self.support_service = support_service
        self.session_manager = session_manager
        logger.info("support_handler_initialized")
    
    async def start_support(self, message: Message, state: FSMContext, session_id: Optional[int] = None) -> None:
        """
        Начинает сессию поддержки
        
        Args:
            message: Сообщение от пользователя
            state: FSM контекст
            session_id: ID сессии из middleware (опционально)
        """
        telegram_id = message.from_user.id
        
        logger.info(
            "starting_support_session",
            telegram_id=telegram_id
        )
        
        try:
            # Проверяем, нет ли уже активной сессии
            existing_session = await self.support_service.get_user_active_session(telegram_id)
            
            if existing_session:
                # Если сессия уже есть, просто переводим в состояние поддержки
                session_id = existing_session.id
                logger.info(
                    "reusing_existing_support_session",
                    telegram_id=telegram_id,
                    session_id=session_id
                )
            else:
                # Создание новой сессии
                session_id = await self.support_service.create_session(telegram_id)
                logger.info(
                    "support_session_created",
                    telegram_id=telegram_id,
                    session_id=session_id
                )
            
            # Сохранение session_id в FSM
            await state.update_data(support_session_id=session_id)
            await state.set_state(SupportStates.in_support)
            
            # Отправка подтверждения с inline кнопкой завершения
            keyboard = get_support_end_keyboard()
            
            await message.answer(
                SUPPORT_SESSION_STARTED,
                reply_markup=keyboard
            )
            
            # Сохраняем ответ бота
            if self.session_manager and session_id:
                try:
                    await self.session_manager.save_bot_message(
                        session_id=session_id,
                        message_text=SUPPORT_SESSION_STARTED
                    )
                except Exception as e:
                    logger.error(
                        "failed_to_save_bot_response",
                        session_id=session_id,
                        error=str(e)
                    )
            
            logger.info(
                "support_session_started",
                telegram_id=telegram_id,
                session_id=session_id
            )
        
        except Exception as e:
            logger.error(
                "failed_to_start_support_session",
                telegram_id=telegram_id,
                error=str(e),
                exc_info=True
            )
            await message.answer(SUPPORT_START_ERROR)
            
            # Сохраняем ответ бота об ошибке
            if self.session_manager and session_id:
                try:
                    await self.session_manager.save_bot_message(
                        session_id=session_id,
                        message_text=SUPPORT_START_ERROR
                    )
                except Exception as save_error:
                    logger.error(
                        "failed_to_save_bot_response",
                        session_id=session_id,
                        error=str(save_error)
                    )
    
    async def handle_support_message(self, message: Message, state: FSMContext, session_id: Optional[int] = None) -> None:
        """
        Обрабатывает сообщение в режиме поддержки
        
        Args:
            message: Сообщение от пользователя
            state: FSM контекст
        """
        telegram_id = message.from_user.id
        
        logger.info(
            "handling_support_message",
            telegram_id=telegram_id,
            has_text=bool(message.text),
            has_photo=bool(message.photo),
            has_document=bool(message.document)
        )
        
        try:
            # Получение session_id из FSM
            data = await state.get_data()
            session_id = data.get('support_session_id')
            
            if not session_id:
                logger.error(
                    "no_session_id_in_fsm",
                    telegram_id=telegram_id
                )
                await message.answer(SUPPORT_NO_SESSION_ERROR)
                await state.clear()
                return
            
            # Определение текста сообщения
            message_text = message.text or message.caption or ""
            
            # Определение file_id для медиа-контента
            file_id = None
            if message.photo:
                # Берём фото с наибольшим разрешением
                file_id = message.photo[-1].file_id
            elif message.document:
                file_id = message.document.file_id
            elif message.video:
                file_id = message.video.file_id
            elif message.audio:
                file_id = message.audio.file_id
            elif message.voice:
                file_id = message.voice.file_id
            
            # Если нет ни текста, ни медиа, игнорируем
            if not message_text and not file_id:
                logger.warning(
                    "empty_support_message",
                    telegram_id=telegram_id,
                    session_id=session_id
                )
                return
            
            # Сохранение сообщения
            await self.support_service.save_message(
                session_id=session_id,
                telegram_id=telegram_id,
                message_type='from_user',
                message_text=message_text,
                file_id=file_id
            )
            
            logger.info(
                "support_message_saved",
                telegram_id=telegram_id,
                session_id=session_id,
                has_file=bool(file_id)
            )
        
        except Exception as e:
            logger.error(
                "failed_to_handle_support_message",
                telegram_id=telegram_id,
                error=str(e),
                exc_info=True
            )
            await message.answer(SUPPORT_MESSAGE_SAVE_ERROR)
    
    async def handle_support_end_callback(self, callback: CallbackQuery, state: FSMContext) -> None:
        """
        Обрабатывает нажатие на inline кнопку "Завершить диалог"
        
        Args:
            callback: Callback от inline кнопки
            state: FSM контекст
        """
        telegram_id = callback.from_user.id
        
        logger.info(
            "ending_support_session",
            telegram_id=telegram_id
        )
        
        try:
            # Получение session_id из FSM
            data = await state.get_data()
            session_id = data.get('support_session_id')
            
            if session_id:
                # Закрытие сессии
                await self.support_service.close_session(session_id)
                
                logger.info(
                    "support_session_ended",
                    telegram_id=telegram_id,
                    session_id=session_id
                )
            else:
                logger.warning(
                    "no_session_to_end",
                    telegram_id=telegram_id
                )
            
            # Выход из FSM
            await state.clear()
            
            # Отправка подтверждения
            await callback.message.answer(SUPPORT_SESSION_ENDED)
            
            # Сохраняем ответ бота
            if self.session_manager and session_id:
                try:
                    await self.session_manager.save_bot_message(
                        session_id=session_id,
                        message_text=SUPPORT_SESSION_ENDED
                    )
                except Exception as e:
                    logger.error(
                        "failed_to_save_bot_response",
                        session_id=session_id,
                        error=str(e)
                    )
            
            logger.info(
                "support_session_cleanup_complete",
                telegram_id=telegram_id
            )
        
        except Exception as e:
            logger.error(
                "failed_to_end_support_session",
                telegram_id=telegram_id,
                error=str(e),
                exc_info=True
            )
            # Всё равно очищаем состояние
            await state.clear()
            
            await callback.message.answer(SUPPORT_END_ERROR)
            
            # Сохраняем ответ бота
            if self.session_manager and session_id:
                try:
                    await self.session_manager.save_bot_message(
                        session_id=session_id,
                        message_text=SUPPORT_END_ERROR
                    )
                except Exception as save_error:
                    logger.error(
                        "failed_to_save_bot_response",
                        session_id=session_id,
                        error=str(save_error)
                    )
        
        # Подтверждаем callback
        await callback.answer()
    
    async def end_support(self, message: Message, state: FSMContext, session_id: Optional[int] = None) -> None:
        """
        Завершает сессию поддержки
        
        Args:
            message: Сообщение от пользователя
            state: FSM контекст
        """
        telegram_id = message.from_user.id
        
        logger.info(
            "ending_support_session",
            telegram_id=telegram_id
        )
        
        try:
            # Получение session_id из FSM
            data = await state.get_data()
            session_id = data.get('support_session_id')
            
            if session_id:
                # Закрытие сессии
                await self.support_service.close_session(session_id)
                
                logger.info(
                    "support_session_ended",
                    telegram_id=telegram_id,
                    session_id=session_id
                )
            else:
                logger.warning(
                    "no_session_to_end",
                    telegram_id=telegram_id
                )
            
            # Выход из FSM
            await state.clear()
            
            # Отправка подтверждения
            await message.answer(SUPPORT_SESSION_ENDED)
            
            # Сохраняем ответ бота
            if self.session_manager and session_id:
                try:
                    await self.session_manager.save_bot_message(
                        session_id=session_id,
                        message_text=SUPPORT_SESSION_ENDED
                    )
                except Exception as e:
                    logger.error(
                        "failed_to_save_bot_response",
                        session_id=session_id,
                        error=str(e)
                    )
            
            logger.info(
                "support_session_cleanup_complete",
                telegram_id=telegram_id
            )
        
        except Exception as e:
            logger.error(
                "failed_to_end_support_session",
                telegram_id=telegram_id,
                error=str(e),
                exc_info=True
            )
            # Всё равно очищаем состояние
            await state.clear()
            
            await message.answer(SUPPORT_END_ERROR)
            
            # Сохраняем ответ бота
            if self.session_manager and session_id:
                try:
                    await self.session_manager.save_bot_message(
                        session_id=session_id,
                        message_text=SUPPORT_END_ERROR
                    )
                except Exception as save_error:
                    logger.error(
                        "failed_to_save_bot_response",
                        session_id=session_id,
                        error=str(save_error)
                    )
