"""create_gdpr_consents_table

Revision ID: b1c2d3e4f5a6
Revises: a03fb432e2e1
Create Date: 2026-04-15 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, Sequence[str], None] = 'a03fb432e2e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Создание таблицы gdpr_consents для независимого хранения GDPR согласий
    
    Миграция идемпотентна - можно запускать многократно без ошибок
    """
    # Проверяем существование таблицы для идемпотентности
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # Сначала добавляем колонку gdpr_consent_date в таблицу prizes, если её нет
    if 'prizes' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('prizes')]
        if 'gdpr_consent_date' not in columns:
            op.add_column(
                'prizes',
                sa.Column(
                    'gdpr_consent_date',
                    sa.DateTime(timezone=True),
                    nullable=True,
                    comment='Дата и время согласия на обработку персональных данных'
                )
            )
            
            # Создаём индекс для быстрого поиска по GDPR согласию
            op.create_index(
                'idx_prizes_gdpr_consent',
                'prizes',
                ['telegram_id', 'gdpr_consent_date'],
                unique=False
            )
    
    if 'gdpr_consents' not in inspector.get_table_names():
        # Создаём таблицу gdpr_consents
        op.create_table(
            'gdpr_consents',
            # Первичный ключ
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            
            # Telegram ID пользователя (уникальный)
            sa.Column(
                'telegram_id',
                sa.BigInteger(),
                nullable=False,
                comment='Telegram ID пользователя'
            ),
            
            # Дата и время согласия на обработку персональных данных
            sa.Column(
                'consent_date',
                sa.DateTime(timezone=True),
                nullable=False,
                comment='Дата и время согласия на обработку персональных данных'
            ),
            
            # Временные метки
            sa.Column(
                'created_at',
                sa.DateTime(timezone=True),
                nullable=False,
                comment='Дата создания записи'
            ),
            sa.Column(
                'updated_at',
                sa.DateTime(timezone=True),
                nullable=False,
                comment='Дата последнего обновления записи'
            ),
            
            # Первичный ключ
            sa.PrimaryKeyConstraint('id')
        )
        
        # Создаём уникальный индекс на telegram_id
        op.create_index(
            'idx_gdpr_consents_telegram_id',
            'gdpr_consents',
            ['telegram_id'],
            unique=True
        )
        
        # Переносим существующие данные из prizes.gdpr_consent_date в gdpr_consents
        # Используем INSERT INTO ... SELECT для эффективного переноса
        conn.execute(sa.text("""
            INSERT INTO gdpr_consents (telegram_id, consent_date, created_at, updated_at)
            SELECT DISTINCT ON (telegram_id)
                telegram_id,
                gdpr_consent_date,
                COALESCE(created_at, NOW()),
                COALESCE(updated_at, NOW())
            FROM prizes
            WHERE gdpr_consent_date IS NOT NULL
            ON CONFLICT (telegram_id) DO NOTHING
        """))


def downgrade() -> None:
    """
    Откат миграции - удаление таблицы gdpr_consents
    
    Также идемпотентен - можно запускать многократно
    """
    # Проверяем существование таблицы для идемпотентности
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    if 'gdpr_consents' in inspector.get_table_names():
        # Удаляем индекс
        op.drop_index('idx_gdpr_consents_telegram_id', table_name='gdpr_consents')
        
        # Удаляем таблицу
        op.drop_table('gdpr_consents')
