"""Payables/receivables drafting agent: Gemma-written payment & reminder messages."""

from __future__ import annotations

import logging
import sqlite3
from typing import Any

from agents.gemma_client import GemmaClientError, chat_text
from channels.africastalking_client import send_sms
from constants import (
    DRAFT_PENDING,
    DraftType,
    Direction,
    TABLE_CONTACTS,
    TABLE_DRAFTS,
    TABLE_TRANSACTIONS,
    TransactionStatus,
)
from db.database import get_connection

logger = logging.getLogger(__name__)

TONE_SYSTEM = (
    "You draft short WhatsApp/SMS messages for Kenyan wholesalers. "
    "Tone: respectful, concise, no jargon. Mix plain Swahili and English naturally "
    "(Sheng-light is fine). Do not invent bank details. Return ONLY the message text."
)


def _get_matched_transaction(transaction_id: int) -> dict[str, Any]:
    """
    Load a transaction and enforce that it is reconciled (status = matched).

    Args:
        transaction_id: Primary key to load.

    Returns:
        Transaction as a dict.

    Raises:
        ValueError: If missing or not in matched status.
    """
    with get_connection() as conn:
        row = conn.execute(
            f"SELECT * FROM {TABLE_TRANSACTIONS} WHERE id = ?",
            (transaction_id,),
        ).fetchone()

    if row is None:
        raise ValueError(f"Transaction {transaction_id} not found")

    if row["status"] != TransactionStatus.MATCHED.value:
        raise ValueError(
            f"Cannot draft for transaction {transaction_id}: "
            f"status is '{row['status']}', expected '{TransactionStatus.MATCHED.value}'. "
            "Reconcile successfully before drafting."
        )

    return {key: row[key] for key in row.keys()}


def _insert_draft(transaction_id: int, draft_type: str, message_text: str) -> int:
    """
    Persist a pending draft message.

    Args:
        transaction_id: Related transaction id.
        draft_type: 'payment' or 'reminder'.
        message_text: Body of the draft.

    Returns:
        New draft row id.
    """
    try:
        with get_connection() as conn:
            cur = conn.execute(
                f"""
                INSERT INTO {TABLE_DRAFTS}
                    (transaction_id, draft_type, message_text, approved)
                VALUES (?, ?, ?, ?)
                """,
                (transaction_id, draft_type, message_text, DRAFT_PENDING),
            )
            conn.commit()
            return int(cur.lastrowid)
    except sqlite3.Error as exc:
        raise RuntimeError(f"Failed to save draft: {exc}") from exc


def draft_payment_message(transaction_id: int) -> str:
    """
    For a reconciled 'payable' transaction, drafts a message the
    wholesaler can approve and send to the supplier confirming payment.
    Written in plain, friendly Swahili/English mix, referencing the
    specific invoice amount and counterparty.

    Args:
        transaction_id: Matched payable transaction id.

    Returns:
        Drafted message text (also stored in drafts table).
    """
    tx = _get_matched_transaction(transaction_id)
    if tx["direction"] != Direction.PAYABLE.value:
        raise ValueError(
            f"draft_payment_message expects a payable transaction; "
            f"got direction '{tx['direction']}'"
        )

    user_prompt = (
        f"Draft a short payment confirmation to supplier '{tx['counterparty_name']}' "
        f"for KES {tx['amount']:.2f} dated {tx['transaction_date']}. "
        "Confirm we have reconciled and will pay / have arranged payment. "
        "Keep it under 280 characters if possible."
    )

    try:
        message = chat_text(TONE_SYSTEM, user_prompt)
    except GemmaClientError as exc:
        raise RuntimeError(f"Couldn't draft payment message: {exc}") from exc

    _insert_draft(transaction_id, DraftType.PAYMENT.value, message)
    return message


def draft_reminder_message(transaction_id: int) -> str:
    """
    For an overdue 'receivable' transaction, drafts a WhatsApp/SMS-style
    reminder to the retailer who owes the wholesaler money. Should be
    polite but clear about the amount and due date.

    Args:
        transaction_id: Matched receivable transaction id.

    Returns:
        Drafted reminder text (also stored in drafts table).
    """
    tx = _get_matched_transaction(transaction_id)
    if tx["direction"] != Direction.RECEIVABLE.value:
        raise ValueError(
            f"draft_reminder_message expects a receivable transaction; "
            f"got direction '{tx['direction']}'"
        )

    user_prompt = (
        f"Draft a polite payment reminder to retailer '{tx['counterparty_name']}' "
        f"who owes KES {tx['amount']:.2f} (invoice/date {tx['transaction_date']}). "
        "Be clear about the amount and due date, friendly but firm. "
        "Keep it under 280 characters if possible."
    )

    try:
        message = chat_text(TONE_SYSTEM, user_prompt)
    except GemmaClientError as exc:
        raise RuntimeError(f"Couldn't draft reminder message: {exc}") from exc

    _insert_draft(transaction_id, DraftType.REMINDER.value, message)
    return message


def send_reminder_sms_for_draft(draft_id: int) -> bool:
    """
    After a reminder draft is approved, SMS the drafted text to the counterparty.

    Looks up phone_number via contacts.counterparty_name. Logs a warning and
    returns False if no contact exists (does not raise).

    Args:
        draft_id: Approved draft primary key.

    Returns:
        True if SMS was accepted by Africa's Talking, False otherwise.
    """
    with get_connection() as conn:
        row = conn.execute(
            f"""
            SELECT d.message_text, d.draft_type, t.counterparty_name
            FROM {TABLE_DRAFTS} d
            JOIN {TABLE_TRANSACTIONS} t ON t.id = d.transaction_id
            WHERE d.id = ?
            """,
            (draft_id,),
        ).fetchone()

    if row is None:
        logger.warning("Cannot SMS reminder: draft %s not found", draft_id)
        return False

    if row["draft_type"] != DraftType.REMINDER.value:
        return False

    counterparty = row["counterparty_name"]
    with get_connection() as conn:
        contact = conn.execute(
            f"""
            SELECT phone_number FROM {TABLE_CONTACTS}
            WHERE counterparty_name = ?
            """,
            (counterparty,),
        ).fetchone()

    if contact is None:
        logger.warning(
            "No contact phone for counterparty '%s' — reminder SMS not sent "
            "(draft_id=%s). Add a row in contacts.",
            counterparty,
            draft_id,
        )
        return False

    return send_sms(contact["phone_number"], row["message_text"])
