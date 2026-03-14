"""replace article_blocks with content_html

Revision ID: afffec4f1fa1
Revises: 85e8a19cd11a
Create Date: 2026-03-11 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'afffec4f1fa1'
down_revision: Union[str, Sequence[str], None] = '85e8a19cd11a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add content_html column to articles
    with op.batch_alter_table('articles', schema=None) as batch_op:
        batch_op.add_column(sa.Column('content_html', sa.Text(), nullable=True))

    # Drop the article_blocks table (data is no longer needed)
    op.drop_table('article_blocks')


def downgrade() -> None:
    # Recreate article_blocks table
    op.create_table(
        'article_blocks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('article_id', sa.Integer(), nullable=False),
        sa.Column('order', sa.Integer(), nullable=False),
        sa.Column('block_type', sa.Enum(
            'heading', 'subheading', 'paragraph', 'image', 'quote', 'bold',
            name='blocktype'
        ), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('level', sa.Integer(), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(['article_id'], ['articles.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    # Remove content_html column
    with op.batch_alter_table('articles', schema=None) as batch_op:
        batch_op.drop_column('content_html')
