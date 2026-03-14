"""add trends table

Revision ID: d4e5f6a7b8c9
Revises: afffec4f1fa1
Create Date: 2026-03-14 00:00:00.000000

Creates the `trends` table used by the Google Trends feature.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "d4e5f6a7b8c9"
down_revision = "afffec4f1fa1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trends",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("keyword", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=True),
        sa.Column("region", sa.String(length=10), nullable=False),
        sa.Column("language", sa.String(length=8), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("trend_date", sa.String(length=10), nullable=False),
        sa.Column(
            "status",
            sa.Enum("new", "used", "dismissed", name="trendstatus"),
            nullable=False,
            server_default="new",
        ),
        sa.Column("site_id", sa.Integer(), sa.ForeignKey("sites.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_trends_id",         "trends", ["id"])
    op.create_index("ix_trends_keyword",    "trends", ["keyword"])
    op.create_index("ix_trends_status",     "trends", ["status"])
    op.create_index("ix_trends_trend_date", "trends", ["trend_date"])


def downgrade() -> None:
    op.drop_index("ix_trends_trend_date", table_name="trends")
    op.drop_index("ix_trends_status",     table_name="trends")
    op.drop_index("ix_trends_keyword",    table_name="trends")
    op.drop_index("ix_trends_id",         table_name="trends")
    op.drop_table("trends")
