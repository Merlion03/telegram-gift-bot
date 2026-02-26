"""
Обработчик режима поддержки.
Управляет сессиями поддержки и перехватывает сообщения пользователей.
"""

from aiogram import Router
from aiogram.types import Message, ReplyKeyboardMarkup, KeyboardButton, ReplyKeyboardRemove
from aiogram.fsm.context import FSMContext
from aiogram.filters import StateFilter
import structlog

from services.support_service import SupportService
from fsm.states import SupportStates

logger = structlog.get_logger(__name__)

# Создаём router для обработчиков поддержки
router = Router()


class SupportHandler:
    """Обработчик режима поддержки"""
    
    def __init__(self, support_service: SupportService):
        """
        Инициализирует обработчик поддержки
        
        Args:
            support_service: Сервис для работы с поддержкой
        """
        self.support_service = support_service
        logger.info("support_handler_initialized")
    
    async def start_support(self, message: Message, state: FSMContext) -> None:
        """
        Начинает сессию поддержки
        
        Args:
            message: Сообщение от пользователя
            state: FSM контекст
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
            
            # Отправка подтверждения с кнопкой завершения
            keyboard = ReplyKeyboardMarkup(
                keyboard=[[KeyboardButton(text="Завершить диалог")]],
                resize_keyboard=True
            )
            
            await message.answer(
                "Вы соединены с поддержкой. Опишите ваш вопрос",
                reply_markup=keyboard
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
            await message.answer(
                "Произошла ошибка при подключении к поддержке. Пожалуйста, попробуйте позже."
            )
    
    async def handle_support_message(self, message: Message, state: FSMContext) -> None:
        """
        Обрабатывает сообщение в режиме поддержки
        
        Args:
            message: Сообщение от пользователя
            state: FSM контекст
        """
        telegram_id = message.from_user.id
        
        # Проверка на команду завершения
        if message.text and message.text == "Завершить диалог":
            await self.end_support(message, state)
            return
        
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
                await message.answer(
                    "Произошла ошибка. Пожалуйста, начните диалог заново."
                )
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
            await message.answer(
                "Произошла ошибка при сохранении сообщения. Пожалуйста, попробуйте ещё раз."
            )
    
    async def end_support(self, message: Message, state: FSMContext) -> None:
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
            
            # Удаление клавиатуры и отправка подтверждения
            await message.answer(
                "Диалог завершён. Спасибо за обращение!",
                reply_markup=ReplyKeyboardRemove()
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
            await message.answer(
                "Диалог завершён.",
                reply_markup=ReplyKeyboardRemove()
            )
