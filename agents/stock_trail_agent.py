"""Stock Trail agent: dispatch photo counting and three-way quantity match."""

from __future__ import annotations

import json
import logging
import re
import sqlite3
from datetime import datetime, timezone
from typing import Any

from agents.gemma_client import GemmaClientError, chat_vision_json
from agents.reconciliation_agent import flag_delivery_discrepancy
from constants import (
    QUANTITY_TOLERANCE_UNITS,
    DeliveryMatchStatus,
    TABLE_DELIVERIES,
    TABLE_TRANSACTIONS,
    TABLE_DRAFTS,
)
from db.database import get_connection

logger = logging.getLogger(__name__)

DISPATCH_SYSTEM_PROMPT = """
You are counting stock for Mizani's Stock Trail.
The photo shows goods being loaded for delivery. Count distinct items or
cartons visible in the image.

Return ONLY valid JSON (no prose, no markdown):
{
  "estimated_quantity": integer,
  "confidence": number,
  "notes": string
}

Rules:
- estimated_quantity must be a non-negative integer.
- confidence is 0.0–1.0; if the image is unclear, lower confidence rather than guess wildly.
- notes: brief description of what you counted (e.g. "12 sealed cartons").
""".strip()


def extract_dispatch_quantity(image_path: str) -> dict[str, Any]:
    """
    Sends a photo of loaded stock to Gemma 4 vision and asks it to
    count visible units/cartons. Returns:
    { "estimated_quantity": int, "confidence": float, "notes": str }
    Prompt Gemma 4 explicitly: this photo shows goods being loaded for
    delivery, count distinct items or cartons visible.

    Args:
        image_path: Path to the dispatch photo on disk.

    Returns:
        Dict with estimated_quantity, confidence, and notes.
    """
    user_text = (
        "This photo shows goods being loaded for delivery. "
        "Count distinct items or cartons visible and return JSON only."
    )
    try:
        result = chat_vision_json(DISPATCH_SYSTEM_PROMPT, user_text, image_path)
    except GemmaClientError as exc:
        raise RuntimeError(f"Couldn't count stock in this photo: {exc}") from exc

    parsed = result["parsed"]
    try:
        qty = int(parsed.get("estimated_quantity") or 0)
    except (TypeError, ValueError):
        qty = 0
    try:
        confidence = float(parsed.get("confidence") or 0.0)
    except (TypeError, ValueError):
        confidence = 0.0

    return {
        "estimated_quantity": max(0, qty),
        "confidence": max(0.0, min(1.0, confidence)),
        "notes": str(parsed.get("notes") or ""),
    }


def _invoice_quantity(tx: dict[str, Any]) -> int | None:
    """
    Derive invoice/order quantity from a transaction row.

    Prefers `qty:N` / `quantity:N` in notes; otherwise uses a whole-number
    amount (handy for demo delivery_note rows seeded with unit counts).

    Args:
        tx: Transaction dict.

    Returns:
        Integer quantity, or None if unknown.
    """
    notes = str(tx.get("notes") or "")
    match = re.search(r"(?:qty|quantity)\s*[:=]\s*(\d+)", notes, flags=re.IGNORECASE)
    if match:
        return int(match.group(1))

    amount = tx.get("amount")
    try:
        as_float = float(amount)
    except (TypeError, ValueError):
        return None
    if as_float >= 0 and as_float == int(as_float):
        return int(as_float)
    return None


def three_way_match(delivery_id: int) -> dict[str, Any]:
    """
    Compares three numbers for a given delivery:
      1. The quantity on the original transaction/invoice
      2. dispatched_quantity (from the dispatch photo)
      3. receipt_confirmed_quantity (from the retailer's USSD confirmation)

    If all three agree (or are within a small tolerance), sets
    match_status = 'matched'. If any differ, sets match_status =
    'discrepancy' and writes a plain-language discrepancy_notes
    explaining exactly where the mismatch is.

    Args:
        delivery_id: Primary key in the deliveries table.

    Returns:
        Dict with match_status, quantities, and discrepancy_notes.
    """
    with get_connection() as conn:
        delivery = conn.execute(
            f"SELECT * FROM {TABLE_DELIVERIES} WHERE id = ?",
            (delivery_id,),
        ).fetchone()
        if delivery is None:
            raise ValueError(f"Delivery {delivery_id} not found")

        tx = conn.execute(
            f"SELECT * FROM {TABLE_TRANSACTIONS} WHERE id = ?",
            (delivery["transaction_id"],),
        ).fetchone()
        if tx is None:
            raise ValueError(
                f"Transaction {delivery['transaction_id']} missing for delivery {delivery_id}"
            )

        invoice_qty = _invoice_quantity({key: tx[key] for key in tx.keys()})
        dispatched = delivery["dispatched_quantity"]
        received = delivery["receipt_confirmed_quantity"]

        if dispatched is None or received is None:
            raise ValueError(
                f"Delivery {delivery_id} is missing dispatched or receipt quantity"
            )

        # Build a plain-language note covering each leg of the triangle
        parts: list[str] = []
        tol = QUANTITY_TOLERANCE_UNITS
        ok = True

        if invoice_qty is None:
            parts.append("Invoice quantity unknown — compared dispatch vs receipt only.")
            if abs(int(dispatched) - int(received)) > tol:
                ok = False
                parts.append(
                    f"Dispatched {dispatched}, but only {received} confirmed received."
                )
        else:
            if abs(invoice_qty - int(dispatched)) > tol:
                ok = False
                parts.append(
                    f"Invoice said {invoice_qty}, dispatch photo counted {dispatched}."
                )
            if abs(invoice_qty - int(received)) > tol:
                ok = False
                parts.append(
                    f"Invoice said {invoice_qty}, only {received} confirmed received "
                    "— check dispatch or transit."
                )
            if abs(int(dispatched) - int(received)) > tol:
                ok = False
                parts.append(
                    f"Dispatched {dispatched} but retailer confirmed {received}."
                )

        if ok:
            status = DeliveryMatchStatus.MATCHED.value
            notes = "Invoice, dispatch, and receipt quantities agree."
        else:
            status = DeliveryMatchStatus.DISCREPANCY.value
            notes = " ".join(parts) if parts else "Quantity discrepancy detected."

        try:
            conn.execute(
                f"""
                UPDATE {TABLE_DELIVERIES}
                SET match_status = ?, discrepancy_notes = ?
                WHERE id = ?
                """,
                (status, notes, delivery_id),
            )
            conn.commit()
        except sqlite3.Error as exc:
            raise RuntimeError(f"Failed to save three-way match: {exc}") from exc

        transaction_id = int(delivery["transaction_id"])

    # Surface shortfalls in the same place as payment mismatches
    if status == DeliveryMatchStatus.DISCREPANCY.value:
        try:
            flag_delivery_discrepancy(transaction_id, notes)
        except Exception as exc:  # noqa: BLE001 — don't fail USSD on recon side-effect
            logger.warning(
                "Could not flag delivery discrepancy on transaction %s: %s",
                transaction_id,
                exc,
            )

    return {
        "delivery_id": delivery_id,
        "transaction_id": transaction_id,
        "invoice_quantity": invoice_qty,
        "dispatched_quantity": int(dispatched),
        "receipt_confirmed_quantity": int(received),
        "match_status": status,
        "discrepancy_notes": notes,
    }


def create_delivery_from_dispatch(
    transaction_id: int,
    image_path: str,
    *,
    invoice_quantity: int | None = None,
) -> dict[str, Any]:
    """
    Run vision counting and insert a pending delivery row.

    Args:
        transaction_id: Related ledger transaction.
        image_path: Saved dispatch photo path.
        invoice_quantity: Optional unit count from the invoice; stored on notes.

    Returns:
        Created delivery row as a dict, plus extraction metadata.
    """
    with get_connection() as conn:
        tx = conn.execute(
            f"SELECT * FROM {TABLE_TRANSACTIONS} WHERE id = ?",
            (transaction_id,),
        ).fetchone()
    if tx is None:
        raise ValueError(f"Transaction {transaction_id} not found")

    extraction = extract_dispatch_quantity(image_path)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    # Persist invoice qty on the transaction notes for three_way_match
    if invoice_quantity is not None:
        notes = str(tx["notes"] or "")
        if not re.search(r"(?:qty|quantity)\s*[:=]\s*\d+", notes, flags=re.I):
            stamped = f"{notes} qty:{invoice_quantity}".strip()
            try:
                with get_connection() as conn:
                    conn.execute(
                        f"UPDATE {TABLE_TRANSACTIONS} SET notes = ? WHERE id = ?",
                        (stamped, transaction_id),
                    )
                    conn.commit()
            except sqlite3.Error as exc:
                raise RuntimeError(f"Failed to stamp invoice quantity: {exc}") from exc

    try:
        with get_connection() as conn:
            cur = conn.execute(
                f"""
                INSERT INTO {TABLE_DELIVERIES}
                    (transaction_id, dispatched_quantity, dispatch_photo_path,
                     dispatch_confirmed_at, driver_status, match_status, discrepancy_notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    transaction_id,
                    extraction["estimated_quantity"],
                    image_path,
                    now,
                    extraction.get("notes") or "Dispatched",
                    DeliveryMatchStatus.PENDING.value,
                    None,
                ),
            )
            delivery_id = int(cur.lastrowid)
            
            # Create a draft notification message in the drafts table
            # Once a dispatch is done, a message is given in the inbox (drafts).
            draft_text = (
                f"Habari {tx['counterparty_name']}. Delivery #{delivery_id} of "
                f"{extraction['estimated_quantity']} units has been dispatched. "
                f"Track delivery: http://localhost:8000/tracking/{delivery_id}"
            )
            conn.execute(
                f"""
                INSERT INTO {TABLE_DRAFTS} (transaction_id, draft_type, message_text, approved)
                VALUES (?, ?, ?, 0)
                """,
                (transaction_id, "reminder", draft_text),
            )
            
            conn.commit()
            row = conn.execute(
                f"SELECT * FROM {TABLE_DELIVERIES} WHERE id = ?",
                (delivery_id,),
            ).fetchone()
    except sqlite3.Error as exc:
        raise RuntimeError(f"Failed to create delivery: {exc}") from exc

    return {
        "delivery": {key: row[key] for key in row.keys()},
        "extraction": extraction,
    }
