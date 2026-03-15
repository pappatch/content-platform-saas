"""add api_usage_log table

Revision ID: c3d4e5f6a7b8
Revises: f6a7b8c9d0e1
Create Date: 2026-03-15 10:00:00.000000

Adds the api_usage_log table which tracks every outbound call made to
external APIs (Anthropic, Unsplash, Tavily, Google CSE, Google Trends,
Stability AI).  The table powers GET /admin/api-usage — the cost and
usage dashboard for the platform admin panel.

Indexes on (service) and (timestamp) support the per-service daily /
monthly count queries issued by the dashboard.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = 'c3d4e5f6a7b8'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'api_usage_log',
        sa.Column('id',        sa.Integer(),     autoincrement=True, nullable=False),
        sa.Column('service',   sa.String(50),    nullable=False),
        sa.Column('endpoint',  sa.String(100),   nullable=False),
        sa.Column('timestamp', sa.DateTime(),    nullable=False),
        sa.Column('success',   sa.Boolean(),     nullable=False),
        sa.Column('meta',      sa.Text(),        nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_api_usage_log_service'),
        'api_usage_log', ['service'], unique=False,
    )
    op.create_index(
        op.f('ix_api_usage_log_timestamp'),
        'api_usage_log', ['timestamp'], unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_api_usage_log_timestamp'), table_name='api_usage_log')
    op.drop_index(op.f('ix_api_usage_log_service'),   table_name='api_usage_log')
    op.drop_table('api_usage_log')
