"""SQLite connection helpers and idempotent schema initialization for Mizani."""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path

from dotenv import load_dotenv

# Resolve paths relative to the project root (parent of db/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"
MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"

load_dotenv(PROJECT_ROOT / ".env")


def _database_path() -> Path:
    """
    Resolve the SQLite file path from DATABASE_PATH (env) or a default.

    Returns:
        Absolute Path to the SQLite database file.
    """
    raw = os.getenv("DATABASE_PATH", "mizani.db")
    path = Path(raw)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    return path


def get_connection() -> sqlite3.Connection:
    """
    Open a SQLite connection with Row factory for dict-like access.

    Returns:
        A sqlite3.Connection with row_factory set to sqlite3.Row.
    """
    conn = sqlite3.connect(_database_path())
    conn.row_factory = sqlite3.Row
    # Enforce foreign keys for demo integrity
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _apply_migrations(conn: sqlite3.Connection) -> None:
    """
    Run numbered SQL migrations from db/migrations/ in filename order.

    Each file uses CREATE TABLE IF NOT EXISTS so re-runs are safe.

    Args:
        conn: Open SQLite connection.
    """
    if not MIGRATIONS_DIR.exists():
        return

    for migration_path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        sql = migration_path.read_text(encoding="utf-8")
        conn.executescript(sql)


def init_db() -> None:
    """
    Create tables from schema.sql and apply migrations if needed.

    Safe to call on every app startup (idempotent via CREATE TABLE IF NOT EXISTS).
    """
    if not SCHEMA_PATH.exists():
        raise FileNotFoundError(f"Schema file not found at {SCHEMA_PATH}")

    schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
    try:
        with get_connection() as conn:
            conn.executescript(schema_sql)
            _apply_migrations(conn)
            conn.commit()
    except sqlite3.Error as exc:
        raise RuntimeError(f"Failed to initialize database: {exc}") from exc
