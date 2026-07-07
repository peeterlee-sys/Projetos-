"""City routing, full audio clips, cost tracking and capture health events

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Análises: classificação por cidade + custos
    with op.batch_alter_table("analyses") as batch_op:
        batch_op.add_column(sa.Column("primary_city", sa.String(100), nullable=True))
        batch_op.add_column(sa.Column("mentioned_cities", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("affected_cities", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("related_department", sa.String(200), nullable=True))
        batch_op.add_column(sa.Column("city_confidence", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("city_reasoning", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("input_tokens", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("output_tokens", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("estimated_cost_usd", sa.Float(), nullable=True))

    # Alertas: rastreabilidade de roteamento + áudio + custo
    with op.batch_alter_table("alerts") as batch_op:
        batch_op.add_column(sa.Column("contracted_city", sa.String(100), nullable=True))
        batch_op.add_column(sa.Column("detected_city", sa.String(100), nullable=True))
        batch_op.add_column(sa.Column("routing_decision", sa.String(20), nullable=True))
        batch_op.add_column(sa.Column("routing_reason", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("clip_file_path", sa.String(500), nullable=True))
        batch_op.add_column(sa.Column("audio_status", sa.String(50), nullable=True))
        batch_op.add_column(sa.Column("audio_url", sa.String(1000), nullable=True))
        batch_op.add_column(sa.Column("estimated_cost_usd", sa.Float(), nullable=True))

    # Eventos de captura (saúde das rádios)
    op.create_table(
        "capture_events",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("station_id", sa.String(), sa.ForeignKey("radio_stations.id"), nullable=False),
        sa.Column("program_id", sa.String(), sa.ForeignKey("programs.id"), nullable=True),
        sa.Column("session_id", sa.String(), sa.ForeignKey("monitoring_sessions.id"), nullable=True),
        sa.Column("event_type", sa.String(30), nullable=False),
        sa.Column("error_class", sa.String(50), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("attempt", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_capture_events_station", "capture_events", ["station_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_capture_events_station", table_name="capture_events")
    op.drop_table("capture_events")

    with op.batch_alter_table("alerts") as batch_op:
        for col in [
            "contracted_city", "detected_city", "routing_decision", "routing_reason",
            "clip_file_path", "audio_status", "audio_url", "estimated_cost_usd",
        ]:
            batch_op.drop_column(col)

    with op.batch_alter_table("analyses") as batch_op:
        for col in [
            "primary_city", "mentioned_cities", "affected_cities", "related_department",
            "city_confidence", "city_reasoning", "input_tokens", "output_tokens",
            "estimated_cost_usd",
        ]:
            batch_op.drop_column(col)
