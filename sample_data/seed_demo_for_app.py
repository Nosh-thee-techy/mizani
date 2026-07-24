"""Seed demo data so the React Native app has M-PESA + analytics content immediately."""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from agents.mpesa_intake import connect_mpesa, sync_mpesa_fixture  # noqa: E402
from db.database import init_db  # noqa: E402
from sample_data.seed_contacts import seed as seed_contacts  # noqa: E402
from sample_data.seed_mismatches import seed as seed_mismatches  # noqa: E402


def seed() -> None:
    """
    Initialize DB, seed mismatches/contacts, connect + sync M-PESA fixture.

    Returns:
        None
    """
    init_db()
    seed_mismatches()
    seed_contacts()
    connect_mpesa("Ledger Demo Till", "+254700000000")
    result = sync_mpesa_fixture(force=False)
    print(
        f"Demo ready: M-PESA inserted={result['inserted']} skipped={result['skipped']}"
    )


if __name__ == "__main__":
    seed()
