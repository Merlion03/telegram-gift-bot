"""add_claimed_at_to_prizes

Revision ID: a03fb432e2e1
Revises: 695ccd9391c7
Create Date: 2026-04-01 18:24:48.088604

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a03fb432e2e1'
down_revision: Union[str, Sequence[str], None] = '695ccd9391c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Добавляем поле claimed_at в таблицу prizes
    op.add_column('prizes', sa.Column('claimed_at', sa.DateTime(timezone=True), nullable=True, comment='Дата и время получения приза пользователем'))
    
    # Создаем индекс для быстрого поиска неполученных призов
    op.create_index('idx_prizes_unclaimed', 'prizes', ['telegram_id', 'claimed_at'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    # Удаляем индекс
    op.drop_index('idx_prizes_unclaimed', table_name='prizes')
    
    # Удаляем поле claimed_at
    op.drop_column('prizes', 'claimed_at')
