"""add admin_theme_default platform setting

Revision ID: b1c2d3e4f5a6
Revises: 9a8b7c6d5e4f
Create Date: 2026-03-14 14:00:00.000000

Seeds the admin_theme_default key into platform_settings so the ThemeContext
can fetch the platform-wide default theme on first visit (before the user has
set a localStorage preference).

Accepted values: light (default) | dark.
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = 'b1c2d3e4f5a6'
down_revision = '9a8b7c6d5e4f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO platform_settings (key, value, value_type, description)
        SELECT
            'admin_theme_default',
            'light',
            'string',
            'Default admin panel theme for all users on first visit. Accepted values: light, dark.'
        WHERE NOT EXISTS (
            SELECT 1 FROM platform_settings WHERE key = 'admin_theme_default'
        )
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM platform_settings WHERE key = 'admin_theme_default'")
