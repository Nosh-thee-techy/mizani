"""Tests for M-PESA sandbox connect/sync (no live Daraja)."""

from __future__ import annotations

import pytest

from agents.mpesa_intake import connect_mpesa, get_mpesa_link, sync_mpesa_fixture
from db.database import get_connection, init_db


@pytest.fixture()
def mpesa_db(tmp_path, monkeypatch):
    """
    Isolated DB for M-PESA intake tests.

    Args:
        tmp_path: pytest temp directory.
        monkeypatch: env patcher.
    """
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "mpesa.db"))
    init_db()


def test_connect_and_sync_inserts_fixture_rows(mpesa_db):
    """
    Connect then sync should insert fixture transactions into the ledger.

    Args:
        mpesa_db: Temp database fixture.
    """
    link = connect_mpesa("Test Till", "+254711111111")
    assert link["linked"] == 1
    assert get_mpesa_link() is not None

    first = sync_mpesa_fixture(force=False)
    assert first["inserted"] >= 1

    second = sync_mpesa_fixture(force=False)
    assert second["inserted"] == 0
    assert second["skipped"] >= 1

    with get_connection() as conn:
        n = conn.execute("SELECT COUNT(*) AS n FROM transactions").fetchone()["n"]
    assert n >= first["inserted"]
