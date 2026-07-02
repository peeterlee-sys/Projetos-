#!/usr/bin/env python3
"""
Migration: fix UNIQUE constraint on analyses table from single-column
(transcription_id) to composite (transcription_id, org_id).

Required for multi-org support: each transcription can now have one
analysis row per subscribing organization.

Run from the project root:
    python3 scripts/migrate_analyses_multi_org.py
"""
import sqlite3
import shutil
import sys
from pathlib import Path
from datetime import datetime


DB_CANDIDATES = [
    Path("porta_voz.db"),
    Path("/root/projetos-/porta-voz/porta_voz.db"),
]


def find_db() -> Path:
    for p in DB_CANDIDATES:
        if p.exists():
            return p
    # Allow passing path as argument
    if len(sys.argv) > 1:
        p = Path(sys.argv[1])
        if p.exists():
            return p
    print("ERROR: porta_voz.db not found. Pass the path as argument.")
    sys.exit(1)


def get_index_defs(conn: sqlite3.Connection, table: str) -> list[dict]:
    rows = conn.execute(
        "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name=?",
        (table,),
    ).fetchall()
    return [{"name": r[0], "sql": r[1]} for r in rows]


def needs_migration(conn: sqlite3.Connection) -> bool:
    """Returns True if analyses table has a unique index on transcription_id alone."""
    indexes = get_index_defs(conn, "analyses")
    for idx in indexes:
        sql = (idx["sql"] or "").upper()
        # Check for unique index on only transcription_id
        if "UNIQUE" in sql and "TRANSCRIPTION_ID" in sql and "ORG_ID" not in sql:
            return True

    # Also check for UNIQUE column constraint (from older schema)
    schema = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='analyses'"
    ).fetchone()
    if schema:
        ddl = schema[0].upper()
        # If transcription_id column has UNIQUE keyword
        lines = ddl.split("\n")
        for line in lines:
            if "TRANSCRIPTION_ID" in line and "UNIQUE" in line:
                return True

    return False


def migrate(db_path: Path) -> None:
    backup_path = db_path.with_suffix(f".db.bak_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    print(f"Backing up database to {backup_path} ...")
    shutil.copy2(db_path, backup_path)
    print("Backup done.")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    print("\nCurrent indexes on analyses:")
    for idx in get_index_defs(conn, "analyses"):
        print(f"  [{idx['name']}] {idx['sql']}")

    print("\nCurrent CREATE TABLE analyses:")
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='analyses'"
    ).fetchone()
    print(f"  {row[0] if row else '(not found)'}")

    if not needs_migration(conn):
        print("\nNo migration needed — composite unique index already in place.")
        conn.close()
        return

    print("\nMigrating analyses table...")

    # SQLite doesn't support DROP CONSTRAINT; must recreate table.
    migration_sql = """
PRAGMA foreign_keys=OFF;

BEGIN TRANSACTION;

CREATE TABLE analyses_new (
    id TEXT NOT NULL PRIMARY KEY,
    transcription_id TEXT NOT NULL REFERENCES transcriptions (id),
    org_id TEXT REFERENCES organizations (id),
    is_relevant BOOLEAN NOT NULL,
    theme VARCHAR(200),
    sentiment VARCHAR(9),
    urgency VARCHAR(8),
    content_type VARCHAR(13),
    confidence_score REAL,
    summary TEXT,
    excerpt TEXT,
    reason TEXT,
    suggested_action TEXT,
    raw_response JSON,
    claude_duration_ms INTEGER,
    created_at DATETIME
);

INSERT INTO analyses_new
    SELECT id, transcription_id, org_id, is_relevant, theme, sentiment,
           urgency, content_type, confidence_score, summary, excerpt, reason,
           suggested_action, raw_response, claude_duration_ms, created_at
    FROM analyses;

DROP TABLE analyses;

ALTER TABLE analyses_new RENAME TO analyses;

CREATE UNIQUE INDEX ix_analyses_transcription_org
    ON analyses (transcription_id, org_id);

COMMIT;

PRAGMA foreign_keys=ON;
"""

    try:
        conn.executescript(migration_sql)
        conn.close()
        print("Migration completed successfully.")
    except Exception as e:
        conn.close()
        print(f"\nERROR during migration: {e}")
        print(f"Restore backup with: cp {backup_path} {db_path}")
        sys.exit(1)

    # Verify
    conn2 = sqlite3.connect(db_path)
    print("\nNew indexes on analyses:")
    for idx in get_index_defs(conn2, "analyses"):
        print(f"  [{idx['name']}] {idx['sql']}")
    conn2.close()
    print("\nDone! Restart the porta-voz service: systemctl restart porta-voz")


if __name__ == "__main__":
    db_path = find_db()
    print(f"Using database: {db_path}")
    migrate(db_path)
