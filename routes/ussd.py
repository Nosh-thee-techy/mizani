"""Africa's Talking USSD callback — retailer balance check and delivery confirmation."""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Form
from fastapi.responses import PlainTextResponse

from agents.stock_trail_agent import three_way_match
from channels.africastalking_client import build_ussd_response
from constants import (
    DeliveryMatchStatus,
    Direction,
    TABLE_CONTACTS,
    TABLE_DELIVERIES,
    TABLE_TRANSACTIONS,
    TABLE_USSD_SESSIONS,
    TransactionStatus,
    UssdMenu,
)
from db.database import get_connection

router = APIRouter(tags=["ussd"])
logger = logging.getLogger(__name__)

MAIN_MENU_TEXT = (
    "Ledger Chain\n"
    "1. Check what I owe\n"
    "2. Confirm delivery received\n"
    "3. Exit"
)


def _now() -> str:
    """
    UTC timestamp string for session updates.

    Returns:
        SQLite-friendly UTC datetime string.
    """
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _load_session(session_id: str) -> dict[str, Any] | None:
    """
    Load a persisted USSD session row.

    Args:
        session_id: Africa's Talking sessionId.

    Returns:
        Session dict or None.
    """
    with get_connection() as conn:
        row = conn.execute(
            f"SELECT * FROM {TABLE_USSD_SESSIONS} WHERE session_id = ?",
            (session_id,),
        ).fetchone()
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


def _save_session(
    session_id: str,
    phone_number: str,
    current_menu: str,
    context: dict[str, Any] | None = None,
) -> None:
    """
    Upsert USSD session state for the next keypress callback.

    Args:
        session_id: Africa's Talking sessionId.
        phone_number: Caller MSISDN.
        current_menu: UssdMenu value.
        context: Optional JSON-serializable menu context.
    """
    context_json = json.dumps(context or {})
    try:
        with get_connection() as conn:
            conn.execute(
                f"""
                INSERT INTO {TABLE_USSD_SESSIONS}
                    (session_id, phone_number, current_menu, context_json, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    phone_number = excluded.phone_number,
                    current_menu = excluded.current_menu,
                    context_json = excluded.context_json,
                    updated_at = excluded.updated_at
                """,
                (session_id, phone_number, current_menu, context_json, _now()),
            )
            conn.commit()
    except sqlite3.Error as exc:
        logger.warning("Failed to persist USSD session %s: %s", session_id, exc)


def _clear_session(session_id: str) -> None:
    """
    Delete a finished USSD session.

    Args:
        session_id: Africa's Talking sessionId.
    """
    try:
        with get_connection() as conn:
            conn.execute(
                f"DELETE FROM {TABLE_USSD_SESSIONS} WHERE session_id = ?",
                (session_id,),
            )
            conn.commit()
    except sqlite3.Error as exc:
        logger.warning("Failed to clear USSD session %s: %s", session_id, exc)


def _contact_for_phone(phone_number: str) -> dict[str, Any] | None:
    """
    Look up a contacts row by E.164 phone number.

    Args:
        phone_number: Caller phone from Africa's Talking.

    Returns:
        Contact dict or None.
    """
    with get_connection() as conn:
        row = conn.execute(
            f"SELECT * FROM {TABLE_CONTACTS} WHERE phone_number = ?",
            (phone_number,),
        ).fetchone()
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


def _latest_input(text: str) -> str:
    """
    Africa's Talking concatenates inputs with '*'; return the last segment.

    Args:
        text: Full session text field.

    Returns:
        Last user input segment (stripped).
    """
    if not text:
        return ""
    return text.split("*")[-1].strip()


def _owing_summary(counterparty_name: str) -> str:
    """
    Sum open receivable balances for a retailer counterparty.

    Args:
        counterparty_name: Name linked via contacts.

    Returns:
        Plain-text balance message.
    """
    with get_connection() as conn:
        row = conn.execute(
            f"""
            SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n
            FROM {TABLE_TRANSACTIONS}
            WHERE counterparty_name = ?
              AND direction = ?
              AND status != ?
            """,
            (
                counterparty_name,
                Direction.RECEIVABLE.value,
                TransactionStatus.MATCHED.value,
            ),
        ).fetchone()
    total = float(row["total"])
    count = int(row["n"])
    if count == 0:
        return f"Habari {counterparty_name}: hakuna deni kwa sasa. Balance: KES 0."
    return (
        f"Habari {counterparty_name}: una deni ya KES {total:,.0f} "
        f"across {count} open invoice(s)."
    )


def _pending_deliveries(counterparty_name: str) -> list[dict[str, Any]]:
    """
    List deliveries awaiting receipt confirmation for this counterparty.

    Args:
        counterparty_name: Retailer name.

    Returns:
        List of delivery dicts (id, transaction_id, dispatched_quantity, ...).
    """
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT d.id, d.transaction_id, d.dispatched_quantity, d.match_status,
                   t.counterparty_name, t.transaction_date, t.amount
            FROM {TABLE_DELIVERIES} d
            JOIN {TABLE_TRANSACTIONS} t ON t.id = d.transaction_id
            WHERE t.counterparty_name = ?
              AND d.receipt_confirmed_quantity IS NULL
              AND d.match_status = ?
            ORDER BY d.id DESC
            LIMIT 8
            """,
            (counterparty_name, DeliveryMatchStatus.PENDING.value),
        ).fetchall()
    return [{key: r[key] for key in r.keys()} for r in rows]


def _confirm_receipt(delivery_id: int, quantity: int) -> str:
    """
    Write receipt_confirmed_quantity and run three_way_match.

    Args:
        delivery_id: Deliveries primary key.
        quantity: Units the retailer confirms receiving.

    Returns:
        Thank-you / result message for USSD END screen.
    """
    now = _now()
    try:
        with get_connection() as conn:
            row = conn.execute(
                f"SELECT id FROM {TABLE_DELIVERIES} WHERE id = ?",
                (delivery_id,),
            ).fetchone()
            if row is None:
                return "Delivery not found. Asante."

            conn.execute(
                f"""
                UPDATE {TABLE_DELIVERIES}
                SET receipt_confirmed_quantity = ?, receipt_confirmed_at = ?
                WHERE id = ?
                """,
                (quantity, now, delivery_id),
            )
            conn.commit()
    except sqlite3.Error as exc:
        logger.warning("Failed to write receipt qty: %s", exc)
        return "Couldn't save confirmation. Try again later."

    try:
        result = three_way_match(delivery_id)
    except (ValueError, RuntimeError) as exc:
        logger.warning("three_way_match failed: %s", exc)
        return f"Receipt saved ({quantity} units). Match pending — asante!"

    if result["match_status"] == DeliveryMatchStatus.MATCHED.value:
        return f"Asante! Confirmed {quantity} units. Stock matched."
    return (
        f"Asante! Confirmed {quantity} units. "
        f"Flagged: {result.get('discrepancy_notes') or 'quantity mismatch'}."
    )


def _handle_ussd(
    session_id: str,
    phone_number: str,
    text: str,
) -> str:
    """
    Core USSD menu state machine using ussd_sessions between callbacks.

    Args:
        session_id: Africa's Talking sessionId.
        phone_number: Caller MSISDN.
        text: Concatenated input string from AT.

    Returns:
        CON/END formatted plain-text response.
    """
    session = _load_session(session_id)
    menu = session["current_menu"] if session else UssdMenu.MAIN.value
    context: dict[str, Any] = {}
    if session and session.get("context_json"):
        try:
            context = json.loads(session["context_json"] or "{}")
        except json.JSONDecodeError:
            context = {}

    # Fresh dial — show main menu
    if text == "":
        _save_session(session_id, phone_number, UssdMenu.MAIN.value, {})
        return build_ussd_response(MAIN_MENU_TEXT, continue_session=True)

    choice = _latest_input(text)
    contact = _contact_for_phone(phone_number)

    # Main menu selections
    if menu == UssdMenu.MAIN.value:
        if choice == "1":
            if contact is None:
                _clear_session(session_id)
                return build_ussd_response(
                    "Number not linked. Ask wholesaler to add you in contacts.",
                    continue_session=False,
                )
            summary = _owing_summary(contact["counterparty_name"])
            _clear_session(session_id)
            return build_ussd_response(summary, continue_session=False)

        if choice == "2":
            if contact is None:
                _clear_session(session_id)
                return build_ussd_response(
                    "Number not linked. Ask wholesaler to add you in contacts.",
                    continue_session=False,
                )
            pending = _pending_deliveries(contact["counterparty_name"])
            if not pending:
                _clear_session(session_id)
                return build_ussd_response(
                    "No pending deliveries to confirm. Asante.",
                    continue_session=False,
                )
            if len(pending) == 1:
                # Single delivery — jump straight to quantity prompt
                delivery_id = int(pending[0]["id"])
                _save_session(
                    session_id,
                    phone_number,
                    UssdMenu.CONFIRM_RECEIPT_QTY.value,
                    {"delivery_id": delivery_id},
                )
                dispatched = pending[0].get("dispatched_quantity")
                hint = f" (dispatched ~{dispatched})" if dispatched is not None else ""
                return build_ussd_response(
                    f"Confirm quantity received{hint}: enter number",
                    continue_session=True,
                )

            # Multiple — ask caller to pick by list number
            lines = ["Select delivery:"]
            id_map: dict[str, int] = {}
            for idx, item in enumerate(pending, start=1):
                lines.append(
                    f"{idx}. Order #{item['transaction_id']} "
                    f"({item.get('dispatched_quantity') or '?'} units)"
                )
                id_map[str(idx)] = int(item["id"])
            _save_session(
                session_id,
                phone_number,
                UssdMenu.CONFIRM_RECEIPT_SELECT.value,
                {"delivery_choices": id_map},
            )
            return build_ussd_response("\n".join(lines), continue_session=True)

        if choice == "3":
            _clear_session(session_id)
            return build_ussd_response("Asante. Kwaheri.", continue_session=False)

        return build_ussd_response(
            "Invalid option.\n" + MAIN_MENU_TEXT,
            continue_session=True,
        )

    # Multi-delivery pick
    if menu == UssdMenu.CONFIRM_RECEIPT_SELECT.value:
        choices = context.get("delivery_choices") or {}
        if choice not in choices:
            return build_ussd_response(
                "Invalid selection. Enter the list number.",
                continue_session=True,
            )
        delivery_id = int(choices[choice])
        _save_session(
            session_id,
            phone_number,
            UssdMenu.CONFIRM_RECEIPT_QTY.value,
            {"delivery_id": delivery_id},
        )
        return build_ussd_response(
            "Confirm quantity received: enter number",
            continue_session=True,
        )

    # Quantity entry → write + three-way match
    if menu == UssdMenu.CONFIRM_RECEIPT_QTY.value:
        delivery_id = context.get("delivery_id")
        if delivery_id is None:
            _clear_session(session_id)
            return build_ussd_response("Session expired. Dial again.", continue_session=False)
        try:
            quantity = int(choice)
        except ValueError:
            return build_ussd_response(
                "Enter quantity as a whole number.",
                continue_session=True,
            )
        if quantity < 0:
            return build_ussd_response(
                "Quantity cannot be negative. Try again.",
                continue_session=True,
            )
        message = _confirm_receipt(int(delivery_id), quantity)
        _clear_session(session_id)
        return build_ussd_response(message, continue_session=False)

    # Unknown menu — reset
    _save_session(session_id, phone_number, UssdMenu.MAIN.value, {})
    return build_ussd_response(MAIN_MENU_TEXT, continue_session=True)


@router.post("/ussd")
async def ussd_callback(
    sessionId: str = Form(default=""),
    phoneNumber: str = Form(default=""),
    text: str = Form(default=""),
    serviceCode: str = Form(default=""),
    networkCode: str = Form(default=""),
) -> PlainTextResponse:
    """
    Africa's Talking USSD webhook (application/x-www-form-urlencoded).

    Expected fields: sessionId, phoneNumber, text, serviceCode, networkCode.
    Response must be text/plain starting with CON or END.

    Args:
        sessionId: Unique session token for this dial.
        phoneNumber: Caller MSISDN in E.164.
        text: Concatenated user inputs separated by '*'.
        serviceCode: USSD code assigned in the sandbox.
        networkCode: Telco network code (unused in demo logic).

    Returns:
        PlainTextResponse for the USSD gateway.
    """
    # serviceCode / networkCode kept for AT compatibility / future logging
    _ = serviceCode, networkCode
    try:
        body = _handle_ussd(sessionId, phoneNumber, text or "")
    except Exception as exc:  # noqa: BLE001 — never 500 the USSD gateway mid-demo
        logger.exception("USSD handler error: %s", exc)
        body = build_ussd_response(
            "Sorry, temporary error. Please try again.",
            continue_session=False,
        )

    return PlainTextResponse(content=body, media_type="text/plain")
