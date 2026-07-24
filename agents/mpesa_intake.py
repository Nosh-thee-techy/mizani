"""M-PESA sandbox intake: connect link state + sync fixture rows into the ledger."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from constants import (
    MPESA_LINKED,
    SourceType,
    TABLE_DOCUMENTS,
    TABLE_MPESA_LINKS,
    TABLE_TRANSACTIONS,
    TransactionStatus,
)
from db.database import PROJECT_ROOT, get_connection

FIXTURE_PATH = PROJECT_ROOT / "sample_data" / "mpesa_sandbox_fixture.json"


def _now() -> str:
    """
    UTC timestamp for sync bookkeeping.

    Returns:
        SQLite-friendly datetime string.
    """
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def get_mpesa_link() -> dict[str, Any] | None:
    """
    Return the latest M-PESA link row, if any.

    Returns:
        Link dict or None when never connected.
    """
    with get_connection() as conn:
        row = conn.execute(
            f"""
            SELECT * FROM {TABLE_MPESA_LINKS}
            ORDER BY id DESC
            LIMIT 1
            """
        ).fetchone()
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


def connect_mpesa(display_name: str, phone_number: str) -> dict[str, Any]:
    """
    Store a demo M-PESA link for the wholesaler app.

    Args:
        display_name: Business / till display name shown in the app.
        phone_number: E.164 phone associated with the sandbox link.

    Returns:
        Newly created (or refreshed) link row as a dict.
    """
    name = display_name.strip() or "Wholesaler Till"
    phone = phone_number.strip() or "+254700000000"
    try:
        with get_connection() as conn:
            # One active link for the demo — clear prior rows
            conn.execute(f"DELETE FROM {TABLE_MPESA_LINKS}")
            cur = conn.execute(
                f"""
                INSERT INTO {TABLE_MPESA_LINKS}
                    (display_name, phone_number, linked, last_synced_at)
                VALUES (?, ?, ?, NULL)
                """,
                (name, phone, MPESA_LINKED),
            )
            link_id = int(cur.lastrowid)
            conn.commit()
            row = conn.execute(
                f"SELECT * FROM {TABLE_MPESA_LINKS} WHERE id = ?",
                (link_id,),
            ).fetchone()
    except sqlite3.Error as exc:
        raise RuntimeError(f"Couldn't save M-PESA link: {exc}") from exc

    return {key: row[key] for key in row.keys()}


def _load_fixture() -> list[dict[str, Any]]:
    """
    Load sandbox M-PESA transaction rows from the JSON fixture.

    Returns:
        List of transaction dicts.

    Raises:
        RuntimeError: If the fixture file is missing or invalid.
    """
    if not FIXTURE_PATH.exists():
        raise RuntimeError(f"M-PESA fixture missing at {FIXTURE_PATH}")
    try:
        payload = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Couldn't read M-PESA fixture: {exc}") from exc
    rows = payload.get("transactions") or []
    if not isinstance(rows, list):
        raise RuntimeError("M-PESA fixture 'transactions' must be a list")
    return rows


def sync_mpesa_fixture(*, force: bool = False) -> dict[str, Any]:
    """
    Insert fixture M-PESA rows into documents/transactions (same path as uploads).

    Skips duplicate inserts when the same fixture notes already exist, unless force.

    Args:
        force: If True, insert even when notes already present.

    Returns:
        Dict with inserted count, skipped count, and link status.
    """
    link = get_mpesa_link()
    if link is None or not link.get("linked"):
        raise ValueError("Connect M-PESA before syncing")

    fixture_rows = _load_fixture()
    inserted = 0
    skipped = 0
    created_ids: list[int] = []

    try:
        with get_connection() as conn:
            for item in fixture_rows:
                notes = str(item.get("notes") or "M-PESA sandbox sync")
                if not force:
                    exists = conn.execute(
                        f"""
                        SELECT id FROM {TABLE_TRANSACTIONS}
                        WHERE notes = ?
                        LIMIT 1
                        """,
                        (notes,),
                    ).fetchone()
                    if exists is not None:
                        skipped += 1
                        continue

                raw = json.dumps(
                    {"mpesa_sandbox": True, "row": item},
                    default=str,
                )
                cur = conn.execute(
                    f"""
                    INSERT INTO {TABLE_DOCUMENTS}
                        (source_type, image_path, raw_extracted_json)
                    VALUES (?, ?, ?)
                    """,
                    (
                        SourceType.BANK_STATEMENT.value,
                        str(FIXTURE_PATH),
                        raw,
                    ),
                )
                doc_id = int(cur.lastrowid)
                cur = conn.execute(
                    f"""
                    INSERT INTO {TABLE_TRANSACTIONS}
                        (document_id, counterparty_name, amount, transaction_date,
                         direction, status, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        doc_id,
                        str(item.get("counterparty_name") or "UNKNOWN"),
                        float(item.get("amount") or 0),
                        str(item.get("transaction_date") or "1970-01-01"),
                        str(item.get("direction") or "receivable"),
                        TransactionStatus.UNRECONCILED.value,
                        notes,
                    ),
                )
                created_ids.append(int(cur.lastrowid))
                inserted += 1

            conn.execute(
                f"""
                UPDATE {TABLE_MPESA_LINKS}
                SET last_synced_at = ?
                WHERE id = ?
                """,
                (_now(), link["id"]),
            )
            conn.commit()
            refreshed = conn.execute(
                f"SELECT * FROM {TABLE_MPESA_LINKS} WHERE id = ?",
                (link["id"],),
            ).fetchone()
    except sqlite3.Error as exc:
        raise RuntimeError(f"M-PESA sync failed: {exc}") from exc

    return {
        "inserted": inserted,
        "skipped": skipped,
        "transaction_ids": created_ids,
        "link": {key: refreshed[key] for key in refreshed.keys()},
        "fixture": str(FIXTURE_PATH.name),
    }
