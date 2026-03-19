"""add_username_column_to_prizes

Revision ID: 695ccd9391c7
Revises: 55daf1165201
Create Date: 2026-03-18 11:48:54.611795

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '695ccd9391c7'
down_revision: Union[str, Sequence[str], None] = '55daf1165201'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Добавление столбца username в таблицу prizes
    
    Миграция идемпотентна - можно запускать многократно без ошибок.
    Столбец username добавляется после telegram_id для логической последовательности.
    """
    # Проверяем существование столбца для идемпотентности
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # Получаем список столбцов таблицы prizes
    columns = [col['name'] for col in inspector.get_columns('prizes')]
    
    # Добавляем столбец только если его ещё нет
    if 'username' not in columns:
        # Добавляем столбец username типа VARCHAR(255), nullable=True
        op.add_column(
            'prizes',
            sa.Column('username', sa.String(length=255), nullable=True)
        )


def downgrade() -> None:
    """
    Откат миграции - удаление столбца username из таблицы prizes
    
    Также идемпотентен - можно запускать многократно
    """
    # Проверяем существование столбца для идемпотентности
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # Получаем список столбцов таблицы prizes
    columns = [col['name'] for col in inspector.get_columns('prizes')]
    
    # Удаляем столбец только если он существует
    if 'username' in columns:
        op.drop_column('prizes', 'username')
