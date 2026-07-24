"""Tests for Stock Trail three-way match (no live Gemma calls)."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from agents.stock_trail_agent import three_way_match
from constants import (
    DeliveryMatchStatus,
    Direction,
    SourceType,
    TransactionStatus,
)
from db.database import get_connection, init_db


@pytest.fixture()
def delivery_db(tmp_path, monkeypatch):
    """
    Temp DB with a delivery ready for receipt confirmation + match.

    Args:
        tmp_path: pytest temp directory.
        monkeypatch: env patcher.

    Returns:
        Dict with delivery_id and transaction_id.
    """
    db_path = tmp_path / "stock.db"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    init_db()

    with get_connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO documents (source_type, image_path, raw_extracted_json)
            VALUES (?, ?, ?)
            """,
            (SourceType.DELIVERY_NOTE.value, "x.jpg", "{}"),
        )
        doc_id = int(cur.lastrowid)
        cur = conn.execute(
            """
            INSERT INTO transactions
                (document_id, counterparty_name, amount, transaction_date,
                 direction, status, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                doc_id,
                "Kamau Hardware",
                50.0,
                "2026-07-20",
                Direction.RECEIVABLE.value,
                TransactionStatus.UNRECONCILED.value,
                "qty:50",
            ),
        )
        tx_id = int(cur.lastrowid)
        cur = conn.execute(
            """
            INSERT INTO deliveries
                (transaction_id, dispatched_quantity, receipt_confirmed_quantity,
                 match_status)
            VALUES (?, ?, ?, ?)
            """,
            (tx_id, 50, 45, DeliveryMatchStatus.PENDING.value),
        )
        delivery_id = int(cur.lastrowid)
        conn.commit()

    return {"delivery_id": delivery_id, "transaction_id": tx_id}


def test_three_way_match_flags_discrepancy(delivery_db):
    """
    Invoice 50 / dispatch 50 / receipt 45 should mark discrepancy and recon flag.

    Args:
        delivery_db: Seeded delivery fixture.
    """
    with patch("agents.stock_trail_agent.flag_delivery_discrepancy") as flag_mock:
        result = three_way_match(delivery_db["delivery_id"])

    assert result["match_status"] == DeliveryMatchStatus.DISCREPANCY.value
    assert "45" in (result["discrepancy_notes"] or "")
    flag_mock.assert_called_once()

    with get_connection() as conn:
        status = conn.execute(
            "SELECT match_status FROM deliveries WHERE id = ?",
            (delivery_db["delivery_id"],),
        ).fetchone()["match_status"]
    assert status == DeliveryMatchStatus.DISCREPANCY.value


def test_build_ussd_response_prefixes():
    """CON/END prefixes must match Africa's Talking gateway expectations."""
    from channels.africastalking_client import build_ussd_response

    assert build_ussd_response("Hi", True).startswith("CON ")
    assert build_ussd_response("Bye", False).startswith("END ")
