"""
Тесты для модуля main.py - инициализация и запуск бота.
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
import asyncio
import sys

# КРИТИЧЕСКИ ВАЖНО: Настроить event loop policy ДО импорта pytest
# psycopg3 не работает с ProactorEventLoop на Windows
if sys.platform == 'win32':
    # В Python 3.14+ WindowsSelectorEventLoopPolicy deprecated
    # Используем прямую установку SelectorEventLoop через asyncio
    try:
        # Для Python 3.14+ используем новый API
        if sys.version_info >= (3, 14):
            # Устанавливаем selector event loop напрямую
            import selectors
            asyncio.set_event_loop(asyncio.SelectorEventLoop(selectors.DefaultSelector()))
        else:
            # Для старых версий используем policy
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except AttributeError:
        # Fallback для совместимости
        pass


class TestBotApplication:
    """Тесты для класса BotApplication"""
    
    @pytest.mark.asyncio
    async def test_bot_application_initialization(self):
        """Тест: BotApplication корректно инициализируется"""
        from main import BotApplication
        
        app = BotApplication()
        
        assert app.config is None
        assert app.bot is None
        assert app.dp is None
        assert app.db_connection is None
        assert app.shutdown_event is not None
    
    @pytest.mark.asyncio
    async def test_bot_application_setup(self):
        """Тест: setup() инициализирует все компоненты"""
        from main import BotApplication
        
        # Мокаем все внешние зависимости
        with patch('main.get_config') as mock_config, \
             patch('main.configure_logging'), \
             patch('main.Bot') as mock_bot, \
             patch('main.create_fsm_storage') as mock_storage, \
             patch('main.Dispatcher') as mock_dispatcher, \
             patch('database.connection.create_async_engine') as mock_engine, \
             patch('main.GoogleSheetsService'), \
             patch('main.PrizeService'), \
             patch('main.SupportRepository'), \
             patch('main.SupportService'), \
             patch('main.SessionManager'), \
             patch('main.CommonHandler'), \
             patch('main.PrizeHandler'), \
             patch('main.SupportHandler'), \
             patch('main.setup_error_handlers'):
            
            # Настройка моков
            mock_config_obj = Mock()
            mock_config_obj.app.log_level = 'INFO'
            mock_config_obj.bot.token = 'test_token'
            mock_config_obj.fsm.storage_type = 'memory'
            mock_config_obj.database.connection_url = 'postgresql+asyncpg://test:test@localhost:5432/test'
            mock_config_obj.google_sheets.credentials_path = '/test/path'
            mock_config_obj.google_sheets.spreadsheet_id = 'test_id'
            mock_config_obj.app.webapp_url = 'https://test.com'
            mock_config.return_value = mock_config_obj
            
            mock_storage.return_value = Mock()
            
            # Мокаем create_async_engine чтобы не создавать реальное подключение
            mock_engine_instance = AsyncMock()
            mock_engine_instance.dispose = AsyncMock()
            # Мокаем begin() для async context manager
            mock_conn = AsyncMock()
            mock_begin_context = AsyncMock()
            mock_begin_context.__aenter__ = AsyncMock(return_value=mock_conn)
            mock_begin_context.__aexit__ = AsyncMock(return_value=None)
            mock_engine_instance.begin = Mock(return_value=mock_begin_context)
            mock_engine.return_value = mock_engine_instance
            
            # Создание и настройка приложения
            app = BotApplication()
            await app.setup()
            
            # Проверки
            assert app.config is not None
            assert app.bot is not None
            assert app.dp is not None
            assert app.db_connection is not None
    
    @pytest.mark.asyncio
    async def test_register_handlers_called(self):
        """Тест: _register_handlers регистрирует все обработчики"""
        from main import BotApplication
        
        with patch('main.get_config') as mock_config, \
             patch('main.configure_logging'), \
             patch('main.Bot'), \
             patch('main.create_fsm_storage') as mock_storage, \
             patch('main.Dispatcher') as mock_dispatcher, \
             patch('database.connection.create_async_engine') as mock_engine, \
             patch('main.GoogleSheetsService'), \
             patch('main.PrizeService'), \
             patch('main.SupportRepository'), \
             patch('main.SupportService'), \
             patch('main.SessionManager'), \
             patch('main.CommonHandler') as mock_common, \
             patch('main.PrizeHandler') as mock_prize, \
             patch('main.SupportHandler') as mock_support, \
             patch('main.setup_error_handlers'):
            
            # Настройка моков
            mock_config_obj = Mock()
            mock_config_obj.app.log_level = 'INFO'
            mock_config_obj.bot.token = 'test_token'
            mock_config_obj.fsm.storage_type = 'memory'
            mock_config_obj.database.connection_url = 'postgresql+asyncpg://test:test@localhost:5432/test'
            mock_config_obj.google_sheets.credentials_path = '/test/path'
            mock_config_obj.google_sheets.spreadsheet_id = 'test_id'
            mock_config_obj.app.webapp_url = 'https://test.com'
            mock_config.return_value = mock_config_obj
            
            mock_storage.return_value = Mock()
            
            # Мокаем create_async_engine чтобы не создавать реальное подключение
            mock_engine_instance = AsyncMock()
            mock_engine_instance.dispose = AsyncMock()
            # Мокаем begin() для async context manager
            mock_conn = AsyncMock()
            mock_begin_context = AsyncMock()
            mock_begin_context.__aenter__ = AsyncMock(return_value=mock_conn)
            mock_begin_context.__aexit__ = AsyncMock(return_value=None)
            mock_engine_instance.begin = Mock(return_value=mock_begin_context)
            mock_engine.return_value = mock_engine_instance
            
            # Мокаем dispatcher
            mock_dp_instance = Mock()
            mock_dp_instance.message = Mock()
            mock_dp_instance.message.register = Mock()
            mock_dp_instance.message.middleware = Mock()
            mock_dispatcher.return_value = mock_dp_instance
            
            # Создание и настройка приложения
            app = BotApplication()
            await app.setup()
            
            # Проверяем, что register был вызван несколько раз
            # (для /start, /help, кнопки поддержки, сообщений поддержки, кодовых слов)
            assert mock_dp_instance.message.register.call_count >= 5
    
    @pytest.mark.asyncio
    async def test_shutdown_closes_resources(self):
        """Тест: shutdown() корректно закрывает все ресурсы"""
        from main import BotApplication
        
        app = BotApplication()
        
        # Создаём моки для ресурсов
        app.dp = Mock()
        app.dp.stop_polling = AsyncMock()
        app.dp.storage = Mock()
        app.dp.storage.close = AsyncMock()
        
        app.db_connection = Mock()
        app.db_connection.close = AsyncMock()
        
        app.bot = Mock()
        app.bot.session = Mock()
        app.bot.session.close = AsyncMock()
        
        # Вызываем shutdown
        await app.shutdown()
        
        # Проверяем, что все методы закрытия были вызваны
        app.dp.stop_polling.assert_called_once()
        app.dp.storage.close.assert_called_once()
        app.db_connection.close.assert_called_once()
        app.bot.session.close.assert_called_once()


class TestMainFunction:
    """Тесты для главной функции main()"""
    
    @pytest.mark.asyncio
    async def test_main_function_creates_application(self):
        """Тест: main() создаёт и настраивает BotApplication"""
        from main import main, BotApplication
        
        with patch.object(BotApplication, 'setup', new_callable=AsyncMock) as mock_setup, \
             patch.object(BotApplication, 'start', new_callable=AsyncMock) as mock_start, \
             patch.object(BotApplication, 'shutdown', new_callable=AsyncMock) as mock_shutdown:
            
            # Делаем start быстро завершающимся
            mock_start.side_effect = KeyboardInterrupt()
            
            try:
                await main()
            except KeyboardInterrupt:
                pass
            
            # Проверяем, что setup и start были вызваны
            mock_setup.assert_called_once()
            mock_start.assert_called_once()
            mock_shutdown.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_main_handles_keyboard_interrupt(self):
        """Тест: main() корректно обрабатывает KeyboardInterrupt"""
        from main import main, BotApplication
        
        with patch.object(BotApplication, 'setup', new_callable=AsyncMock), \
             patch.object(BotApplication, 'start', new_callable=AsyncMock) as mock_start, \
             patch.object(BotApplication, 'shutdown', new_callable=AsyncMock) as mock_shutdown:
            
            # Симулируем KeyboardInterrupt
            mock_start.side_effect = KeyboardInterrupt()
            
            # Не должно быть исключения
            await main()
            
            # Shutdown должен быть вызван даже при KeyboardInterrupt
            mock_shutdown.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_main_handles_exceptions(self):
        """Тест: main() логирует исключения и выполняет shutdown"""
        from main import main, BotApplication
        
        with patch.object(BotApplication, 'setup', new_callable=AsyncMock) as mock_setup, \
             patch.object(BotApplication, 'start', new_callable=AsyncMock), \
             patch.object(BotApplication, 'shutdown', new_callable=AsyncMock) as mock_shutdown:
            
            # Симулируем ошибку в setup
            mock_setup.side_effect = Exception("Test error")
            
            # Должно быть исключения
            with pytest.raises(Exception, match="Test error"):
                await main()
            
            # Shutdown должен быть вызван даже при ошибке
            mock_shutdown.assert_called_once()
