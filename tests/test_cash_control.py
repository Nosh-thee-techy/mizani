"""Tests for cash-control and Mizizi OS helpers."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from agents.cash_control import (
    check_credit_control,
    get_buyer_trust_scores,
    get_cash_crisis,
    get_financing_pack,
)
from agents.mizizi_os_agent import ask_mizizi_os
from db.database import get_connection, init_db


@pytest.fixture()
def cash_db(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "cash.db"))
    init_db()
    old = (datetime.now(timezone.utc).date() - timedelta(days=45)).isoformat()
    fresh = (datetime.now(timezone.utc).date() - timedelta(days=3)).isoformat()
    with get_connection() as conn:
        doc = conn.execute(
            """
            INSERT INTO documents (source_type, image_path, raw_extracted_json)
            VALUES ('invoice', 'x.jpg', '{}')
            """
        ).lastrowid
        conn.executemany(
            """
            INSERT INTO transactions
              (document_id, counterparty_name, amount, transaction_date, direction, status)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                (doc, "Kamau Hardware", 40000, old, "receivable", "unreconciled"),
                (doc, "Amani Stores", 8000, fresh, "receivable", "unreconciled"),
                (doc, "Jua Supplies", 5000, fresh, "payable", "unreconciled"),
            ],
        )
        conn.commit()


def test_cash_crisis_flags_overdue(cash_db):
    crisis = get_cash_crisis()
    assert crisis["overdue_30_plus"] == 40000
    assert crisis["top_debtors"][0]["name"] == "Kamau Hardware"
    assert any(a["type"] == "hold_credit" for a in crisis["recommended_actions"])


def test_credit_soft_block_and_trust(cash_db):
    check = check_credit_control("Kamau")
    assert check["soft_block"] is True
    assert check["allowed"] is False

    trust = get_buyer_trust_scores()
    names = [b["name"] for b in trust["buyers"]]
    assert "Kamau Hardware" in names


def test_financing_pack_and_os_fallback(cash_db, monkeypatch):
    pack = get_financing_pack()
    assert pack["readiness_score"] >= 40
    assert pack["summary"]["open_receivables"] == 48000

    monkeypatch.setattr(
        "agents.mizizi_os_agent.chat_text",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("offline")),
    )
    result = ask_mizizi_os("Show my cash crisis")
    assert result["card"] == "crisis"
    assert "receivable" in result["reply"].lower() or "KES" in result["reply"]
