"""
Скрипт для запуска Backend API сервера

Запускает FastAPI сервер на порту 5000 для обработки запросов от Frontend.
"""
import sys
import asyncio

# Исправление для Windows: принудительно используем SelectorEventLoop
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import uvicorn


if __name__ == "__main__":
    # Запуск сервера
    uvicorn.run(
        "api_server:app",
        host="0.0.0.0",
        port=5000,
        reload=True,
        log_level="info"
    )
