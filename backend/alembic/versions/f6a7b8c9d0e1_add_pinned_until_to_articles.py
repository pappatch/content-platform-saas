"""add pinned_until to articles

Revision ID: f6a7b8c9d0e1
Revises: b1c2d3e4f5a6
Create Date: 2026-03-14 15:00:00.000000

Adds a nullable DateTime column `pinned_until` to the `articles` table.

When set to a future datetime, the article sorts above all other articles
in the public feed and shows a live countdown badge on Template B.

Duration is set by editors in the CMS (1 day / 1 week / 1 month options).
The public API in /public/sites/{id}/articles handles the sort; expired
pinned_until values are ignored automatically (no cleanup job needed).
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = 'f6a7b8c9d0e1'
down_revision = 'b1c2d3e4f5a6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite supports adding a nullable column directly without batch mode.
    op.add_column(
        'articles',
        sa.Column('pinned_until', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    # Dropping a column requires batch mode on SQLite.
    with op.batch_alter_table('articles') as batch_op:
        batch_op.drop_column('pinned_until')
