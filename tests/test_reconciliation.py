"""Unit tests for reconciliation matching (SQL tool + mocked Gemma decisions)."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from constants import Direction, SourceType, TransactionStatus
from db.database import get_connection, init_db
from agents.reconciliation_agent import (
    query_candidate_transactions,
    reconcile_transaction,
)


@pytest.fixture()
def demo_db(tmp_path, monkeypatch):
    """
    Point DATABASE_PATH at a temp SQLite file and seed two related rows.

    Args:
        tmp_path: pytest temp directory.
        monkeypatch: pytest monkeypatch fixture.

    Returns:
        Dict with source_id and other_id for the seeded pair.
    """
    db_path = tmp_path / "test_ledger.db"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    # Reload path resolution picks up env via get_connection each call
    init_db()

    with get_connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO documents (source_type, image_path, raw_extracted_json)
            VALUES (?, ?, ?)
            """,
            (SourceType.INVOICE.value, "a.jpg", "{}"),
        )
        doc_a = int(cur.lastrowid)
        cur = conn.execute(
            """
            INSERT INTO documents (source_type, image_path, raw_extracted_json)
            VALUES (?, ?, ?)
            """,
            (SourceType.BANK_STATEMENT.value, "b.jpg", "{}"),
        )
        doc_b = int(cur.lastrowid)

        cur = conn.execute(
            """
            INSERT INTO transactions
                (document_id, counterparty_name, amount, transaction_date, direction, status, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                doc_a,
                "John's Duka",
                5000.0,
                "2026-07-01",
                Direction.RECEIVABLE.value,
                TransactionStatus.UNRECONCILED.value,
                "invoice",
            ),
        )
        source_id = int(cur.lastrowid)
        cur = conn.execute(
            """
            INSERT INTO transactions
                (document_id, counterparty_name, amount, transaction_date, direction, status, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                doc_b,
                "Johns Duka",
                4200.0,
                "2026-07-05",
                Direction.PAYABLE.value,
                TransactionStatus.UNRECONCILED.value,
                "payment underpaid",
            ),
        )
        other_id = int(cur.lastrowid)
        conn.commit()

    return {"source_id": source_id, "other_id": other_id, "db_path": db_path}


def test_query_candidate_transactions_fuzzy_name(demo_db):
    """
    SQL tool should find 'Johns Duka' when searching for "John's Duka".

    Args:
        demo_db: Seeded temp database fixture.
    """
    candidates = query_candidate_transactions(
        counterparty_name="John's Duka",
        date_range={"start": "2026-06-01", "end": "2026-07-31"},
        exclude_id=demo_db["source_id"],
    )
    ids = {c["id"] for c in candidates}
    assert demo_db["other_id"] in ids


def test_reconcile_transaction_flags_amount_mismatch(demo_db):
    """
    When Gemma picks the underpaid match, status should become mismatched.

    Args:
        demo_db: Seeded temp database fixture.
    """
    decision = {
        "matched": True,
        "matched_transaction_id": demo_db["other_id"],
        "confidence": 0.85,
        "discrepancy_notes": "Amount differs by 16%",
    }

    with (
        patch(
            "agents.reconciliation_agent.chat_with_tools",
            return_value={"role": "assistant", "content": "ok", "tool_calls": []},
        ),
        patch(
            "agents.reconciliation_agent._ask_model_for_match",
            return_value=decision,
        ),
    ):
        result = reconcile_transaction(demo_db["source_id"])

    assert result["matched"] is True
    assert result["matched_transaction_id"] == demo_db["other_id"]
    assert result["status"] == TransactionStatus.MISMATCHED.value

    with get_connection() as conn:
        status_a = conn.execute(
            "SELECT status FROM transactions WHERE id = ?",
            (demo_db["source_id"],),
        ).fetchone()["status"]
        status_b = conn.execute(
            "SELECT status FROM transactions WHERE id = ?",
            (demo_db["other_id"],),
        ).fetchone()["status"]
        recon_count = conn.execute("SELECT COUNT(*) AS n FROM reconciliations").fetchone()[
            "n"
        ]

    assert status_a == TransactionStatus.MISMATCHED.value
    assert status_b == TransactionStatus.MISMATCHED.value
    assert recon_count == 1
