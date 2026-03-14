"""add app_settings table

Revision ID: e7f8a9b0c1d2
Revises: d4e5f6a7b8c9
Create Date: 2026-03-14 01:00:00.000000

Creates the `app_settings` key-value table used to persist platform settings
(e.g. the active Google Trends fetch region) across server restarts.
"""

import sqlalchemy as sa
from alembic import op

revision = "e7f8a9b0c1d2"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("key",        sa.String(), nullable=False),
        sa.Column("value",      sa.String(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("key"),
    )
    # Seed the default trends fetch region (worldwide = empty string)
    op.execute(
        "INSERT INTO app_settings (key, value) VALUES ('trends_fetch_region', '')"
    )


def downgrade() -> None:
    op.drop_table("app_settings")
