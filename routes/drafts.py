"""Draft message routes: list pending drafts and approve them."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, HTTPException

from agents.payables_agent import (
    draft_payment_message,
    draft_reminder_message,
    send_reminder_sms_for_draft,
)
from constants import (
    DRAFT_APPROVED,
    DRAFT_PENDING,
    Direction,
    DraftType,
    TABLE_DRAFTS,
    TABLE_TRANSACTIONS,
)
from db.database import get_connection

router = APIRouter(tags=["drafts"])


@router.get("/drafts/{transaction_id}")
def get_drafts(transaction_id: int) -> dict:
    """
    Return any pending drafts for a transaction.

    If none exist yet and the transaction is matched, auto-generate the
    appropriate draft (payment for payable, reminder for receivable).

    Args:
        transaction_id: Transaction primary key.

    Returns:
        Dict with transaction_id and a list of draft rows.
    """
    with get_connection() as conn:
        tx = conn.execute(
            f"SELECT * FROM {TABLE_TRANSACTIONS} WHERE id = ?",
            (transaction_id,),
        ).fetchone()
        if tx is None:
            raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found")

        rows = conn.execute(
            f"""
            SELECT * FROM {TABLE_DRAFTS}
            WHERE transaction_id = ? AND approved = ?
            ORDER BY created_at DESC
            """,
            (transaction_id, DRAFT_PENDING),
        ).fetchall()

    drafts = [{key: r[key] for key in r.keys()} for r in rows]

    # Convenience for the demo: generate a draft on first GET if none pending
    if not drafts:
        try:
            if tx["direction"] == Direction.PAYABLE.value:
                draft_payment_message(transaction_id)
            elif tx["direction"] == Direction.RECEIVABLE.value:
                draft_reminder_message(transaction_id)
            else:
                raise HTTPException(
                    status_code=422,
                    detail=f"Unsupported direction '{tx['direction']}' for drafting",
                )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        with get_connection() as conn:
            rows = conn.execute(
                f"""
                SELECT * FROM {TABLE_DRAFTS}
                WHERE transaction_id = ? AND approved = ?
                ORDER BY created_at DESC
                """,
                (transaction_id, DRAFT_PENDING),
            ).fetchall()
        drafts = [{key: r[key] for key in r.keys()} for r in rows]

    return {"transaction_id": transaction_id, "drafts": drafts}


@router.post("/drafts/{draft_id}/approve")
def approve_draft(draft_id: int) -> dict:
    """
    Flip a draft's approved flag to 1; for reminders, also SMS via Africa's Talking.

    Args:
        draft_id: Draft primary key.

    Returns:
        Updated draft row as JSON, plus sms_sent when applicable.
    """
    try:
        with get_connection() as conn:
            row = conn.execute(
                f"SELECT * FROM {TABLE_DRAFTS} WHERE id = ?",
                (draft_id,),
            ).fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail=f"Draft {draft_id} not found")

            draft_type = row["draft_type"]
            conn.execute(
                f"UPDATE {TABLE_DRAFTS} SET approved = ? WHERE id = ?",
                (DRAFT_APPROVED, draft_id),
            )
            conn.commit()
            updated = conn.execute(
                f"SELECT * FROM {TABLE_DRAFTS} WHERE id = ?",
                (draft_id,),
            ).fetchone()
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail=f"Failed to approve draft: {exc}") from exc

    payload: dict = {"draft": {key: updated[key] for key in updated.keys()}}

    # Prompt Step 5: after reminder draft is approved, send SMS to the contact
    if draft_type == DraftType.REMINDER.value:
        payload["sms_sent"] = send_reminder_sms_for_draft(draft_id)

    return payload
