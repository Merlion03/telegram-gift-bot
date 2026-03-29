#!/usr/bin/env python3
"""Простой тест для диагностики"""

print("=== НАЧАЛО ПРОВЕРКИ ===")

import sys
import os
from pathlib import Path

print(f"Python version: {sys.version}")
print(f"Current dir: {os.getcwd()}")
print(f"Script path: {__file__}")

# Добавляем корневую директорию в PYTHONPATH
sys.path.insert(0, str(Path(__file__).parent.parent))
print(f"PYTHONPATH: {sys.path[0]}")

try:
    import asyncio
    print("✓ asyncio импортирован")
except Exception as e:
    print(f"✗ Ошибка импорта asyncio: {e}")

try:
    import asyncpg
    print("✓ asyncpg импортирован")
except Exception as e:
    print(f"✗ Ошибка импорта asyncpg: {e}")

try:
    from dotenv import load_dotenv
    print("✓ dotenv импортирован")
    load_dotenv()
    print("✓ .env загружен")
except Exception as e:
    print(f"✗ Ошибка с dotenv: {e}")

print("\n=== КОНЕЦ ПРОВЕРКИ ===")
