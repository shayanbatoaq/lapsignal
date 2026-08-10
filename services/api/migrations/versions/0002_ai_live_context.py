"""AI runs and durable live context.

Revision ID: 0002_ai_live_context
Revises: 0001_initial
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_ai_live_context"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("driver_profiles") as batch:
        batch.add_column(
            sa.Column(
                "post_session_ai_enabled", sa.Boolean(), nullable=False, server_default=sa.false()
            )
        )
        batch.add_column(
            sa.Column(
                "ai_live_lap_coaching", sa.Boolean(), nullable=False, server_default=sa.false()
            )
        )
    with op.batch_alter_table("sessions") as batch:
        batch.add_column(sa.Column("context_json", sa.JSON(), nullable=False, server_default="{}"))
        batch.add_column(
            sa.Column("performance_mode", sa.String(), nullable=False, server_default="unknown")
        )
        batch.add_column(
            sa.Column(
                "performance_mode_source", sa.String(), nullable=False, server_default="unknown"
            )
        )
        batch.add_column(sa.Column("last_packet_at", sa.DateTime(), nullable=True))
        batch.add_column(
            sa.Column("interrupted", sa.Boolean(), nullable=False, server_default=sa.false())
        )
    op.create_table(
        "ai_runs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("session_id", sa.String(), sa.ForeignKey("sessions.id"), nullable=True),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("requested_model", sa.String(), nullable=False),
        sa.Column("resolved_model", sa.String(), nullable=True),
        sa.Column("prompt_version", sa.String(), nullable=False),
        sa.Column("output_schema_version", sa.String(), nullable=False),
        sa.Column("evidence_hash", sa.String(), nullable=False),
        sa.Column("cache_key", sa.String(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("cost_usd", sa.Float(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("error_category", sa.String(), nullable=True),
        sa.Column("cache_hit", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("validation_result", sa.String(), nullable=False, server_default="not_run"),
        sa.Column("response_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_ai_runs_session_id", "ai_runs", ["session_id"])
    op.create_index("ix_ai_runs_evidence_hash", "ai_runs", ["evidence_hash"])
    op.create_index("ix_ai_runs_cache_key", "ai_runs", ["cache_key"])


def downgrade():
    op.drop_table("ai_runs")
    with op.batch_alter_table("sessions") as batch:
        for name in (
            "interrupted",
            "last_packet_at",
            "performance_mode_source",
            "performance_mode",
            "context_json",
        ):
            batch.drop_column(name)
    with op.batch_alter_table("driver_profiles") as batch:
        batch.drop_column("ai_live_lap_coaching")
        batch.drop_column("post_session_ai_enabled")
