"""Add multi-client monitoring support

Revision ID: 0002
Revises: 0001
Create Date: 2025-01-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tabela de assinaturas: múltiplos clientes por rádio
    op.create_table(
        "station_subscriptions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("station_id", sa.String(), nullable=False),
        sa.Column("org_id", sa.String(), nullable=False),
        sa.Column("city_filter", sa.String(100), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["station_id"], ["radio_stations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_subscriptions_station", "station_subscriptions", ["station_id", "is_active"])
    op.create_index("ix_subscriptions_station_org", "station_subscriptions", ["station_id", "org_id"], unique=True)

    # 2. Adiciona org_id em analyses (para distinguir análises por cliente)
    with op.batch_alter_table("analyses", recreate="always") as batch_op:
        batch_op.add_column(sa.Column("org_id", sa.String(), nullable=True))
        batch_op.create_index("ix_analyses_transcription_org", ["transcription_id", "org_id"], unique=True)

    # 3. Adiciona org_id em alerts (para saber qual cliente recebeu)
    with op.batch_alter_table("alerts") as batch_op:
        batch_op.add_column(sa.Column("org_id", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("alerts") as batch_op:
        batch_op.drop_column("org_id")

    with op.batch_alter_table("analyses", recreate="always") as batch_op:
        batch_op.drop_index("ix_analyses_transcription_org")
        batch_op.drop_column("org_id")

    op.drop_index("ix_subscriptions_station_org", "station_subscriptions")
    op.drop_index("ix_subscriptions_station", "station_subscriptions")
    op.drop_table("station_subscriptions")
