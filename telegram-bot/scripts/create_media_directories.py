"""
Скрипт для создания структуры директорий медиафайлов

Создаёт директории для хранения медиа-контента с правильными правами доступа.

Validates: Requirements 9.1, 9.2
"""

import os
import sys
from pathlib import Path


def create_media_directories():
    """
    Создаёт структуру директорий для медиафайлов
    
    Структура:
    telegram-bot/media/
        ├── photo/
        ├── video/
        ├── animation/
        ├── sticker/
        ├── voice/
        └── document/
    """
    # Определяем базовый путь (telegram-bot/)
    base_path = Path(__file__).parent.parent
    media_path = base_path / 'media'
    
    # Список типов медиа
    media_types = ['photo', 'video', 'animation', 'sticker', 'voice', 'document']
    
    print(f"Создание структуры директорий медиафайлов в: {media_path}")
    
    # Создаём базовую директорию media
    if not media_path.exists():
        media_path.mkdir(mode=0o755, exist_ok=True)
        print(f"✓ Создана директория: {media_path}")
    else:
        print(f"✓ Директория уже существует: {media_path}")
    
    # Создаём поддиректории для каждого типа медиа
    for media_type in media_types:
        type_path = media_path / media_type
        
        if not type_path.exists():
            type_path.mkdir(mode=0o755, exist_ok=True)
            print(f"✓ Создана директория: {type_path}")
        else:
            print(f"✓ Директория уже существует: {type_path}")
    
    # Создаём .gitkeep файлы для сохранения структуры в git
    for media_type in media_types:
        gitkeep_path = media_path / media_type / '.gitkeep'
        
        if not gitkeep_path.exists():
            gitkeep_path.touch()
            print(f"✓ Создан .gitkeep: {gitkeep_path}")
    
    # Создаём .gitignore для игнорирования медиафайлов
    gitignore_path = media_path / '.gitignore'
    gitignore_content = """# Игнорировать все медиафайлы, но сохранять структуру директорий
*
!.gitignore
!.gitkeep
!*/
"""
    
    if not gitignore_path.exists():
        gitignore_path.write_text(gitignore_content, encoding='utf-8')
        print(f"✓ Создан .gitignore: {gitignore_path}")
    else:
        print(f"✓ .gitignore уже существует: {gitignore_path}")
    
    print("\n✅ Структура директорий медиафайлов успешно создана!")
    print(f"\nПуть к медиафайлам: {media_path.absolute()}")
    print("\nСтруктура:")
    print("media/")
    for media_type in media_types:
        print(f"  ├── {media_type}/")
    
    return True


def verify_permissions():
    """
    Проверяет права доступа к директориям
    """
    base_path = Path(__file__).parent.parent
    media_path = base_path / 'media'
    
    if not media_path.exists():
        print("❌ Директория media не существует")
        return False
    
    # Проверяем права доступа (должны быть 755 или более открытые)
    stat_info = media_path.stat()
    mode = stat_info.st_mode & 0o777
    
    print(f"\nПрава доступа к {media_path}: {oct(mode)}")
    
    if mode >= 0o755:
        print("✓ Права доступа корректны (755 или более открытые)")
        return True
    else:
        print("⚠ Права доступа могут быть недостаточными")
        return False


if __name__ == '__main__':
    try:
        # Создаём структуру директорий
        success = create_media_directories()
        
        if success:
            # Проверяем права доступа
            verify_permissions()
            sys.exit(0)
        else:
            sys.exit(1)
            
    except Exception as e:
        print(f"\n❌ Ошибка при создании директорий: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
