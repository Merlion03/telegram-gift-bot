"""create_prizes_table

Revision ID: 55daf1165201
Revises: 
Create Date: 2026-03-10 15:19:09.119461

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '55daf1165201'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Создание таблицы prizes для хранения данных о призах
    
    Миграция идемпотентна - можно запускать многократно без ошибок
    """
    # Проверяем существование таблицы для идемпотентности
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    if 'prizes' not in inspector.get_table_names():
        # Создаём таблицу prizes
        op.create_table(
            'prizes',
            # Первичный ключ
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            
            # Telegram ID пользователя
            sa.Column('telegram_id', sa.BigInteger(), nullable=False),
            
            # Тип приза: 'digital' или 'physical'
            sa.Column('prize_type', sa.String(length=20), nullable=False),
            
            # Данные для цифрового приза
            sa.Column('promo_code', sa.String(length=255), nullable=True),
            sa.Column('instructions', sa.Text(), nullable=True),
            
            # Данные для физического приза (адрес доставки)
            sa.Column('last_name', sa.String(length=255), nullable=True),
            sa.Column('first_name', sa.String(length=255), nullable=True),
            sa.Column('patronymic', sa.String(length=255), nullable=True),
            sa.Column('city', sa.String(length=255), nullable=True),
            sa.Column('street', sa.String(length=255), nullable=True),
            sa.Column('house', sa.String(length=50), nullable=True),
            sa.Column('apartment', sa.String(length=50), nullable=True),
            sa.Column('phone', sa.String(length=50), nullable=True),
            sa.Column('comment', sa.Text(), nullable=True),
            
            # Метаданные синхронизации
            sa.Column('sheet_name', sa.String(length=255), nullable=False),
            sa.Column('code_word', sa.String(length=255), nullable=False),
            sa.Column('row_id', sa.Integer(), nullable=False),
            
            # Временные метки
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            
            # Первичный ключ
            sa.PrimaryKeyConstraint('id')
        )
        
        # Создаём индексы для производительности
        # Уникальный составной индекс для предотвращения дублирования
        op.create_index(
            'idx_prizes_telegram_code',
            'prizes',
            ['telegram_id', 'code_word'],
            unique=True
        )
        
        # Индекс для быстрого поиска по кодовому слову
        op.create_index(
            'idx_prizes_code_word',
            'prizes',
            ['code_word'],
            unique=False
        )
        
        # Индекс для быстрого поиска по листу (для синхронизации)
        op.create_index(
            'idx_prizes_sheet_name',
            'prizes',
            ['sheet_name'],
            unique=False
        )


def downgrade() -> None:
    """
    Откат миграции - удаление таблицы prizes
    
    Также идемпотентен - можно запускать многократно
    """
    # Проверяем существование таблицы для идемпотентности
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    if 'prizes' in inspector.get_table_names():
        # Удаляем индексы (если они существуют)
        op.drop_index('idx_prizes_sheet_name', table_name='prizes')
        op.drop_index('idx_prizes_code_word', table_name='prizes')
        op.drop_index('idx_prizes_telegram_code', table_name='prizes')
        
        # Удаляем таблицу
        op.drop_table('prizes')
