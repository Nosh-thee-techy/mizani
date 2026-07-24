"""Business analytics agent: SQL aggregates + Gemma narrative of economic life."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any

from agents.gemma_client import GemmaClientError, chat_text
from constants import (
    DEFAULT_DIGEST_DAYS,
    DeliveryMatchStatus,
    Direction,
    DRAFT_PENDING,
    TABLE_DELIVERIES,
    TABLE_DRAFTS,
    TABLE_TRANSACTIONS,
    TransactionStatus,
)
from db.database import get_connection

ANALYTICS_SYSTEM = (
    "You are Gemma advising a Kenyan wholesaler on their business. "
    "Using the metrics JSON, write 3–5 plain sentences about what is going on "
    "in their economic life: who they sell to, money in vs out, stock/delivery "
    "flags, and what needs attention. No accounting jargon. "
    "Swahili/English mix is fine. Return ONLY the narrative."
)


def _period_start(days: int) -> str:
    """
    ISO date for the lookback window start.

    Args:
        days: Number of days to look back.

    Returns:
        YYYY-MM-DD string.
    """
    return (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")


def fetch_overview_metrics(period_days: int = DEFAULT_DIGEST_DAYS) -> dict[str, Any]:
    """
    Aggregate ledger + delivery metrics for the pulse screen.

    Args:
        period_days: Lookback window.

    Returns:
        Metrics dict (no Gemma narrative yet).
    """
    start = _period_start(period_days)
    with get_connection() as conn:
        owed_to = conn.execute(
            f"""
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM {TABLE_TRANSACTIONS}
            WHERE direction = ? AND status != ?
            """,
            (Direction.RECEIVABLE.value, TransactionStatus.MATCHED.value),
        ).fetchone()["total"]

        owed_by = conn.execute(
            f"""
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM {TABLE_TRANSACTIONS}
            WHERE direction = ? AND status != ?
            """,
            (Direction.PAYABLE.value, TransactionStatus.MATCHED.value),
        ).fetchone()["total"]

        period_in = conn.execute(
            f"""
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM {TABLE_TRANSACTIONS}
            WHERE direction = ? AND transaction_date >= ?
            """,
            (Direction.RECEIVABLE.value, start),
        ).fetchone()["total"]

        period_out = conn.execute(
            f"""
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM {TABLE_TRANSACTIONS}
            WHERE direction = ? AND transaction_date >= ?
            """,
            (Direction.PAYABLE.value, start),
        ).fetchone()["total"]

        mismatches = conn.execute(
            f"""
            SELECT COUNT(*) AS n FROM {TABLE_TRANSACTIONS}
            WHERE status = ?
            """,
            (TransactionStatus.MISMATCHED.value,),
        ).fetchone()["n"]

        pending_drafts = conn.execute(
            f"""
            SELECT COUNT(*) AS n FROM {TABLE_DRAFTS}
            WHERE approved = ?
            """,
            (DRAFT_PENDING,),
        ).fetchone()["n"]

        delivery_gaps = conn.execute(
            f"""
            SELECT COUNT(*) AS n FROM {TABLE_DELIVERIES}
            WHERE match_status = ?
            """,
            (DeliveryMatchStatus.DISCREPANCY.value,),
        ).fetchone()["n"]

        pending_deliveries = conn.execute(
            f"""
            SELECT COUNT(*) AS n FROM {TABLE_DELIVERIES}
            WHERE match_status = ?
            """,
            (DeliveryMatchStatus.PENDING.value,),
        ).fetchone()["n"]

        top_buyers = conn.execute(
            f"""
            SELECT counterparty_name AS name,
                   COUNT(*) AS tx_count,
                   COALESCE(SUM(amount), 0) AS total_amount
            FROM {TABLE_TRANSACTIONS}
            WHERE direction = ? AND transaction_date >= ?
            GROUP BY counterparty_name
            ORDER BY total_amount DESC
            LIMIT 5
            """,
            (Direction.RECEIVABLE.value, start),
        ).fetchall()

    return {
        "period_days": period_days,
        "total_owed_to_wholesaler": float(owed_to),
        "total_owed_by_wholesaler": float(owed_by),
        "period_money_in": float(period_in),
        "period_money_out": float(period_out),
        "open_mismatches": int(mismatches),
        "pending_drafts": int(pending_drafts),
        "delivery_discrepancies": int(delivery_gaps),
        "pending_deliveries": int(pending_deliveries),
        "top_buyers": [
            {
                "name": r["name"],
                "tx_count": int(r["tx_count"]),
                "total_amount": float(r["total_amount"]),
            }
            for r in top_buyers
        ],
    }


def generate_business_narrative(metrics: dict[str, Any]) -> str:
    """
    Ask Gemma for a plain-language economic-life summary.

    Args:
        metrics: Output of fetch_overview_metrics.

    Returns:
        Narrative string.
    """
    prompt = (
        f"Summarize this wholesaler's business snapshot:\n{metrics}\n"
        "Focus on who they sell to, cash pressure, and stock/delivery issues."
    )
    try:
        return chat_text(ANALYTICS_SYSTEM, prompt)
    except GemmaClientError as exc:
        raise RuntimeError(f"Couldn't generate analytics narrative: {exc}") from exc


def build_overview(period_days: int = DEFAULT_DIGEST_DAYS) -> dict[str, Any]:
    """
    Full analytics overview payload for GET /analytics/overview.

    Args:
        period_days: Lookback window.

    Returns:
        Dict with metrics, narrative, generated_at.
    """
    try:
        metrics = fetch_overview_metrics(period_days)
    except sqlite3.Error as exc:
        raise RuntimeError(f"Couldn't compute analytics metrics: {exc}") from exc

    try:
        narrative = generate_business_narrative(metrics)
    except Exception as exc:
        narrative = f"Mizani Assistant: Business summary is temporarily unavailable due to Gemma API rate limits: {exc}"

    return {
        "metrics": metrics,
        "narrative": narrative,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def list_counterparties(period_days: int = DEFAULT_DIGEST_DAYS) -> list[dict[str, Any]]:
    """
    Rank counterparties by volume for the Customers & suppliers screen.

    Args:
        period_days: Lookback window (0 = all time).

    Returns:
        List of counterparty summary dicts.
    """
    start = _period_start(period_days) if period_days > 0 else "1970-01-01"
    try:
        with get_connection() as conn:
            rows = conn.execute(
                f"""
                SELECT
                    counterparty_name AS name,
                    SUM(CASE WHEN direction = ? THEN amount ELSE 0 END) AS sold_to,
                    SUM(CASE WHEN direction = ? THEN amount ELSE 0 END) AS bought_from,
                    COUNT(*) AS tx_count,
                    SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS open_mismatches,
                    MAX(transaction_date) AS last_activity
                FROM {TABLE_TRANSACTIONS}
                WHERE transaction_date >= ?
                GROUP BY counterparty_name
                ORDER BY (sold_to + bought_from) DESC
                """,
                (
                    Direction.RECEIVABLE.value,
                    Direction.PAYABLE.value,
                    TransactionStatus.MISMATCHED.value,
                    start,
                ),
            ).fetchall()
    except sqlite3.Error as exc:
        raise RuntimeError(f"Couldn't list counterparties: {exc}") from exc

    results: list[dict[str, Any]] = []
    for r in rows:
        sold = float(r["sold_to"] or 0)
        bought = float(r["bought_from"] or 0)
        role = "buyer" if sold >= bought else "supplier"
        if sold > 0 and bought > 0:
            role = "both"
        results.append(
            {
                "name": r["name"],
                "role": role,
                "sold_to": sold,
                "bought_from": bought,
                "tx_count": int(r["tx_count"]),
                "open_mismatches": int(r["open_mismatches"]),
                "last_activity": r["last_activity"],
            }
        )
    return results


def list_inbox_items() -> dict[str, Any]:
    """
    Collect mismatches and pending drafts for the Action inbox screen.

    Returns:
        Dict with mismatched transactions and pending drafts.
    """
    try:
        with get_connection() as conn:
            mismatches = conn.execute(
                f"""
                SELECT id, counterparty_name, amount, transaction_date,
                       direction, status, notes
                FROM {TABLE_TRANSACTIONS}
                WHERE status = ?
                ORDER BY id DESC
                LIMIT 50
                """,
                (TransactionStatus.MISMATCHED.value,),
            ).fetchall()
            drafts = conn.execute(
                f"""
                SELECT d.id, d.transaction_id, d.draft_type, d.message_text,
                       d.approved, d.created_at, t.counterparty_name, t.amount
                FROM {TABLE_DRAFTS} d
                JOIN {TABLE_TRANSACTIONS} t ON t.id = d.transaction_id
                WHERE d.approved = ?
                ORDER BY d.id DESC
                LIMIT 50
                """,
                (DRAFT_PENDING,),
            ).fetchall()
    except sqlite3.Error as exc:
        raise RuntimeError(f"Couldn't load inbox: {exc}") from exc

    return {
        "mismatches": [{key: r[key] for key in r.keys()} for r in mismatches],
        "pending_drafts": [{key: r[key] for key in r.keys()} for r in drafts],
    }


def list_goods_activity() -> list[dict[str, Any]]:
    """
    Inventory-style delivery trail rows for the Goods screen.

    Returns:
        List of delivery dicts joined with transaction metadata.
    """
    try:
        with get_connection() as conn:
            rows = conn.execute(
                f"""
                SELECT
                    d.id AS delivery_id,
                    d.transaction_id,
                    d.dispatched_quantity,
                    d.receipt_confirmed_quantity,
                    d.match_status,
                    d.discrepancy_notes,
                    d.driver_status,
                    d.dispatch_confirmed_at,
                    d.receipt_confirmed_at,
                    t.counterparty_name,
                    t.amount,
                    t.transaction_date,
                    t.notes AS transaction_notes
                FROM {TABLE_DELIVERIES} d
                JOIN {TABLE_TRANSACTIONS} t ON t.id = d.transaction_id
                ORDER BY d.id DESC
                LIMIT 100
                """
            ).fetchall()
    except sqlite3.Error as exc:
        raise RuntimeError(f"Couldn't load goods activity: {exc}") from exc

    return [{key: r[key] for key in r.keys()} for r in rows]


def list_transactions_for_counterparty(name: str) -> list[dict[str, Any]]:
    """
    Recent transactions for a single counterparty.

    Args:
        name: Exact counterparty_name.

    Returns:
        List of transaction dicts.
    """
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT id, counterparty_name, amount, transaction_date,
                   direction, status, notes
            FROM {TABLE_TRANSACTIONS}
            WHERE counterparty_name = ?
            ORDER BY transaction_date DESC, id DESC
            LIMIT 50
            """,
            (name,),
        ).fetchall()
    return [{key: r[key] for key in r.keys()} for r in rows]
