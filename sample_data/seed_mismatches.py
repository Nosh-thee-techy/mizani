"""Seed deliberately mismatched sample transactions for the reconciliation demo."""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Allow running as `python sample_data/seed_mismatches.py` from project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from constants import (  # noqa: E402
    Direction,
    SourceType,
    TABLE_DOCUMENTS,
    TABLE_TRANSACTIONS,
    TransactionStatus,
)
from db.database import get_connection, init_db  # noqa: E402

# Placeholder image notes — replace with real photos when available
SAMPLE_INVOICE_NOTE = PROJECT_ROOT / "sample_data" / "sample_invoice.jpg"
SAMPLE_STATEMENT_NOTE = PROJECT_ROOT / "sample_data" / "sample_statement.jpg"


def _ensure_placeholders() -> None:
    """
    Create tiny placeholder files so image_path columns are non-empty.

    Returns:
        None
    """
    for path in (SAMPLE_INVOICE_NOTE, SAMPLE_STATEMENT_NOTE):
        if not path.exists():
            path.write_text(
                "PLACEHOLDER — replace with a real document photo for the demo.\n",
                encoding="utf-8",
            )


def seed() -> None:
    """
    Insert at least three deliberately mismatched transaction pairs.

    Examples include an invoice for 5000 with a payment at 4200, a fuzzy
    name pair, and a date-skewed delivery note.

    Returns:
        None
    """
    init_db()
    _ensure_placeholders()

    # Each tuple: (source_type, image, counterparty, amount, date, direction, notes)
    samples = [
        # Pair 1 — amount mismatch (5000 vs 4200)
        (
            SourceType.INVOICE.value,
            str(SAMPLE_INVOICE_NOTE),
            "John's Duka",
            5000.0,
            "2026-07-01",
            Direction.RECEIVABLE.value,
            "Seed invoice 5000 KES",
        ),
        (
            SourceType.BANK_STATEMENT.value,
            str(SAMPLE_STATEMENT_NOTE),
            "Johns Duka",
            4200.0,
            "2026-07-05",
            Direction.PAYABLE.value,
            "Seed payment recorded at 4200 — deliberate mismatch",
        ),
        # Pair 2 — fuzzy name + small amount drift
        (
            SourceType.INVOICE.value,
            str(SAMPLE_INVOICE_NOTE),
            "Wanjiku Traders Ltd",
            12500.0,
            "2026-07-10",
            Direction.PAYABLE.value,
            "Seed supplier invoice",
        ),
        (
            SourceType.BANK_STATEMENT.value,
            str(SAMPLE_STATEMENT_NOTE),
            "Wanjiku Traders",
            12000.0,
            "2026-07-12",
            Direction.RECEIVABLE.value,
            "Seed M-Pesa out 12000 — amount off by 4%",
        ),
        # Pair 3 — complementary docs with date skew / missing exact amount
        (
            SourceType.DELIVERY_NOTE.value,
            str(SAMPLE_INVOICE_NOTE),
            "Kamau Hardware",
            7800.0,
            "2026-06-20",
            Direction.RECEIVABLE.value,
            "Seed delivery note",
        ),
        (
            SourceType.INVOICE.value,
            str(SAMPLE_INVOICE_NOTE),
            "Kamau Hardware Nairobi",
            8000.0,
            "2026-07-02",
            Direction.RECEIVABLE.value,
            "Seed invoice 13 days later, amount 8000 vs 7800",
        ),
    ]

    with get_connection() as conn:
        existing = conn.execute(
            f"SELECT COUNT(*) AS n FROM {TABLE_TRANSACTIONS} WHERE notes LIKE 'Seed %'"
        ).fetchone()["n"]
        if existing:
            print(f"Seed data already present ({existing} rows). Skipping.")
            return

        for source_type, image_path, name, amount, date, direction, notes in samples:
            raw = json.dumps({"seed": True, "notes": notes})
            cur = conn.execute(
                f"""
                INSERT INTO {TABLE_DOCUMENTS} (source_type, image_path, raw_extracted_json)
                VALUES (?, ?, ?)
                """,
                (source_type, image_path, raw),
            )
            doc_id = int(cur.lastrowid)
            conn.execute(
                f"""
                INSERT INTO {TABLE_TRANSACTIONS}
                    (document_id, counterparty_name, amount, transaction_date,
                     direction, status, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    doc_id,
                    name,
                    amount,
                    date,
                    direction,
                    TransactionStatus.UNRECONCILED.value,
                    notes,
                ),
            )
        conn.commit()

    print("Seeded 6 sample transactions (3 deliberate mismatch scenarios).")


if __name__ == "__main__":
    seed()
