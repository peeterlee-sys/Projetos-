"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2025-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("state", sa.String(2), nullable=True),
        sa.Column("plan", sa.String(50), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("settings", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "alert_recipients",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("org_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(100), nullable=True),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("urgency_filter", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "radio_stations",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("org_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("state", sa.String(2), nullable=True),
        sa.Column("website", sa.String(500), nullable=True),
        sa.Column("stream_url", sa.String(1000), nullable=True),
        sa.Column("youtube_url", sa.String(1000), nullable=True),
        sa.Column("stream_type", sa.String(20), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "programs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("station_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("days_of_week", sa.JSON(), nullable=False),
        sa.Column("start_time", sa.String(5), nullable=False),
        sa.Column("end_time", sa.String(5), nullable=False),
        sa.Column("timezone", sa.String(50), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("alert_recipients", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["station_id"], ["radio_stations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "keywords",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("org_id", sa.String(), nullable=False),
        sa.Column("program_id", sa.String(), nullable=True),
        sa.Column("term", sa.String(200), nullable=False),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("weight", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["program_id"], ["programs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_keywords_org_active", "keywords", ["org_id", "is_active"])

    op.create_table(
        "monitoring_sessions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("program_id", sa.String(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("scheduled", "running", "completed", "failed", "interrupted", name="sessionstatus"),
            nullable=True,
        ),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("total_chunks", sa.Integer(), nullable=True),
        sa.Column("relevant_chunks", sa.Integer(), nullable=True),
        sa.Column("total_alerts_sent", sa.Integer(), nullable=True),
        sa.Column("reconnect_count", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["program_id"], ["programs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "transcriptions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("chunk_started_at", sa.DateTime(), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("raw_text", sa.Text(), nullable=True),
        sa.Column("has_keywords", sa.Boolean(), nullable=True),
        sa.Column("matched_keywords", sa.JSON(), nullable=True),
        sa.Column("audio_file_path", sa.String(500), nullable=True),
        sa.Column("clip_file_path", sa.String(500), nullable=True),
        sa.Column("whisper_duration_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["monitoring_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_transcriptions_session", "transcriptions", ["session_id", "chunk_index"])

    op.create_table(
        "analyses",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("transcription_id", sa.String(), nullable=False),
        sa.Column("is_relevant", sa.Boolean(), nullable=False),
        sa.Column("theme", sa.String(200), nullable=True),
        sa.Column(
            "sentiment",
            sa.Enum("positive", "negative", "neutral", name="sentiment"),
            nullable=True,
        ),
        sa.Column(
            "urgency",
            sa.Enum("low", "medium", "high", "critical", name="urgency"),
            nullable=True,
        ),
        sa.Column(
            "content_type",
            sa.Enum(
                "complaint", "denouncement", "praise", "interview",
                "criticism", "institutional", "political", "other",
                name="contenttype",
            ),
            nullable=True,
        ),
        sa.Column("confidence_score", sa.Float(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("excerpt", sa.Text(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("suggested_action", sa.Text(), nullable=True),
        sa.Column("raw_response", sa.JSON(), nullable=True),
        sa.Column("claude_duration_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["transcription_id"], ["transcriptions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("transcription_id"),
    )

    op.create_table(
        "alerts",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("analysis_id", sa.String(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("pending", "sent", "failed", "suppressed", name="alertstatus"),
            nullable=True,
        ),
        sa.Column("recipients", sa.JSON(), nullable=True),
        sa.Column("message_text", sa.Text(), nullable=True),
        sa.Column("dedup_hash", sa.String(64), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["analysis_id"], ["analyses.id"]),
        sa.ForeignKeyConstraint(["session_id"], ["monitoring_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_alerts_session_dedup", "alerts", ["session_id", "dedup_hash"])

    op.create_table(
        "reports",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("summary_text", sa.Text(), nullable=True),
        sa.Column("key_topics", sa.JSON(), nullable=True),
        sa.Column(
            "overall_sentiment",
            sa.Enum("positive", "negative", "neutral", name="sentiment"),
            nullable=True,
        ),
        sa.Column("total_mentions", sa.Integer(), nullable=True),
        sa.Column("alert_count", sa.Integer(), nullable=True),
        sa.Column("high_urgency_count", sa.Integer(), nullable=True),
        sa.Column("recommendations", sa.JSON(), nullable=True),
        sa.Column("timeline", sa.JSON(), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("whatsapp_status", sa.String(50), nullable=True),
        sa.Column("generated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["monitoring_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id"),
    )


def downgrade() -> None:
    op.drop_table("reports")
    op.drop_index("ix_alerts_session_dedup", "alerts")
    op.drop_table("alerts")
    op.drop_table("analyses")
    op.drop_index("ix_transcriptions_session", "transcriptions")
    op.drop_table("transcriptions")
    op.drop_table("monitoring_sessions")
    op.drop_index("ix_keywords_org_active", "keywords")
    op.drop_table("keywords")
    op.drop_table("programs")
    op.drop_table("radio_stations")
    op.drop_table("alert_recipients")
    op.drop_table("organizations")
