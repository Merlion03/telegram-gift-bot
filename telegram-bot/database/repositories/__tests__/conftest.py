"""
Конфигурация pytest для тестов Prize_Repository
"""
import sys
import os

# Добавляем путь к корню проекта для импорта фикстур
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))

# Импортируем все фикстуры из основного conftest
from tests.conftest import *
