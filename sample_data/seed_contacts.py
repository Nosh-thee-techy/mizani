"""Seed demo contacts (and a sample pending delivery) for USSD/SMS demos."""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from constants import (  # noqa: E402
    ContactRole,
    DeliveryMatchStatus,
    Direction,
    SourceType,
    TABLE_CONTACTS,
    TABLE_DELIVERIES,
    TABLE_DOCUMENTS,
    TABLE_TRANSACTIONS,
    TransactionStatus,
)
from db.database import get_connection, init_db  # noqa: E402

# Sandbox simulator numbers — replace with your AT sandbox test MSISDNs
DEMO_CONTACTS = [
    ("John's Duka", "+254711000001", ContactRole.RETAILER.value),
    ("Wanjiku Traders Ltd", "+254711000002", ContactRole.SUPPLIER.value),
    ("Kamau Hardware", "+254711000003", ContactRole.RETAILER.value),
    ("Demo Driver", "+254711000004", ContactRole.DRIVER.value),
]


def seed() -> None:
    """
    Insert demo contacts and ensure at least one pending delivery for USSD option 2.

    Returns:
        None
    """
    init_db()

    with get_connection() as conn:
        for name, phone, role in DEMO_CONTACTS:
            conn.execute(
                f"""
                INSERT INTO {TABLE_CONTACTS} (counterparty_name, phone_number, role)
                VALUES (?, ?, ?)
                ON CONFLICT(counterparty_name) DO UPDATE SET
                    phone_number = excluded.phone_number,
                    role = excluded.role
                """,
                (name, phone, role),
            )

        # Ensure a delivery exists for Kamau Hardware so USSD confirm flow is demoable
        pending = conn.execute(
            f"""
            SELECT d.id FROM {TABLE_DELIVERIES} d
            JOIN {TABLE_TRANSACTIONS} t ON t.id = d.transaction_id
            WHERE t.counterparty_name = ?
              AND d.receipt_confirmed_quantity IS NULL
            LIMIT 1
            """,
            ("Kamau Hardware",),
        ).fetchone()

        if pending is None:
            cur = conn.execute(
                f"""
                INSERT INTO {TABLE_DOCUMENTS} (source_type, image_path, raw_extracted_json)
                VALUES (?, ?, ?)
                """,
                (
                    SourceType.DELIVERY_NOTE.value,
                    str(PROJECT_ROOT / "sample_data" / "sample_invoice.jpg"),
                    '{"seed": true}',
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
                    "Kamau Hardware",
                    50.0,
                    "2026-07-20",
                    Direction.RECEIVABLE.value,
                    TransactionStatus.UNRECONCILED.value,
                    "Seed stock trail order qty:50",
                ),
            )
            tx_id = int(cur.lastrowid)
            conn.execute(
                f"""
                INSERT INTO {TABLE_DELIVERIES}
                    (transaction_id, dispatched_quantity, dispatch_photo_path,
                     dispatch_confirmed_at, driver_status, match_status)
                VALUES (?, ?, ?, datetime('now'), ?, ?)
                """,
                (
                    tx_id,
                    48,
                    str(PROJECT_ROOT / "sample_data" / "sample_invoice.jpg"),
                    "Seed dispatch — 48 cartons (deliberate shortfall vs qty:50)",
                    DeliveryMatchStatus.PENDING.value,
                ),
            )

        conn.commit()

    print("Seeded contacts (+ pending Kamau Hardware delivery for USSD confirm).")


if __name__ == "__main__":
    seed()
