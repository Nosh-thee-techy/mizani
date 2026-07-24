"""Tests for Mizizi's allowlisted read-only ledger tools."""

from __future__ import annotations

import pytest

from agents.business_tools import (
    execute_business_tool,
    get_counterparty_balance,
    get_ledger_summary,
    search_transactions,
)
from db.database import get_connection, init_db


@pytest.fixture()
def business_db(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "mizizi.db"))
    init_db()
    with get_connection() as conn:
        document_id = conn.execute(
            """
            INSERT INTO documents (source_type, image_path, raw_extracted_json)
            VALUES ('invoice', 'invoice.jpg', '{}')
            """
        ).lastrowid
        conn.executemany(
            """
            INSERT INTO transactions
              (document_id, counterparty_name, amount, transaction_date, direction, status)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                (document_id, "Amani Stores", 15000, "2026-07-20", "receivable", "unreconciled"),
                (document_id, "Jua Supplies", 5000, "2026-07-19", "payable", "unreconciled"),
            ],
        )
        conn.commit()


def test_summary_and_counterparty_lookup(business_db):
    summary = get_ledger_summary()
    assert summary["owed_to_wholesaler"] == 15000
    assert summary["wholesaler_owes"] == 5000

    result = get_counterparty_balance("amani")
    assert result["matches"][0]["counterparty_name"] == "Amani Stores"
    assert result["matches"][0]["open_amount"] == 15000


def test_search_filters_direction_and_limits_results(business_db):
    result = search_transactions(direction="payable", limit=1)
    assert len(result["transactions"]) == 1
    assert result["transactions"][0]["counterparty_name"] == "Jua Supplies"


def test_dispatch_rejects_unknown_tools(business_db):
    assert "error" in execute_business_tool("delete_everything")
