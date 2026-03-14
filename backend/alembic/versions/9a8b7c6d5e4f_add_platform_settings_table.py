"""add platform_settings table

Revision ID: 9a8b7c6d5e4f
Revises: e7f8a9b0c1d2
Create Date: 2026-03-14 12:00:00.000000

Creates the `platform_settings` table — a typed key-value store for tunable
runtime parameters (AI threshold, scraper limits, trends config, etc.).

This replaces hardcoded constants scattered across scraper.py, ai_review.py,
and trends_service.py with admin-editable DB-backed settings.

Columns
-------
key           : TEXT PRIMARY KEY  — snake_case identifier
value         : TEXT NOT NULL     — string-encoded current value
value_type    : TEXT NOT NULL     — declared type: string / float / int / bool
description   : TEXT NOT NULL     — human-readable explanation
updated_by_id : INTEGER NULL FK   — user who last changed this setting
updated_at    : DATETIME NULL     — timestamp of last change

The upgrade seeds all 8 default settings.  Downgrade drops the table entirely.
"""

import sqlalchemy as sa
from alembic import op

revision = "9a8b7c6d5e4f"
down_revision = "e7f8a9b0c1d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_settings",
        sa.Column("key",           sa.String(),  nullable=False),
        sa.Column("value",         sa.String(),  nullable=False),
        sa.Column("value_type",    sa.String(),  nullable=False),
        sa.Column("description",   sa.String(),  nullable=False, server_default=""),
        sa.Column("updated_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_at",    sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("key"),
    )

    # Seed all defaults — must match DEFAULTS in settings_service.py
    defaults = [
        (
            "ai_review_threshold", "0.5", "float",
            "Minimum AI quality score (0-1) for an article to be auto-published. "
            "Articles scoring below this threshold stay pending for human review.",
        ),
        (
            "auto_publish_enabled", "true", "bool",
            "When true, articles that meet the AI score threshold are published "
            "automatically by the review worker. When false, all articles require "
            "manual approval regardless of score.",
        ),
        (
            "trends_auto_site_threshold", "0.55", "float",
            "Minimum trend score (0-1) before a trending keyword can be used "
            "to automatically create a new site.",
        ),
        (
            "trends_auto_site_limit", "3", "int",
            "Maximum number of sites that can be created from Google Trends. "
            "Prevents uncontrolled site sprawl.",
        ),
        (
            "max_searches_per_job", "10", "int",
            "Maximum number of article URLs fetched and processed per scrape job run.",
        ),
        (
            "min_paragraph_blocks", "3", "int",
            "Minimum number of paragraph blocks required to pass the scraper quality gate.",
        ),
        (
            "min_word_count", "100", "int",
            "Minimum total word count required to pass the scraper quality gate.",
        ),
        (
            "trends_fetch_interval_hours", "5", "int",
            "Hours between automatic Google Trends fetches.",
        ),
    ]

    for key, value, vtype, desc in defaults:
        op.execute(
            f"INSERT INTO platform_settings (key, value, value_type, description) "
            f"VALUES ('{key}', '{value}', '{vtype}', '{desc}')"
        )


def downgrade() -> None:
    op.drop_table("platform_settings")
