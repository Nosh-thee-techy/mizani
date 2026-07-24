"""Financial health digest: plain-language summary across ledger + stock trail."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any

from agents.gemma_client import GemmaClientError, chat_text
from constants import (
    DEFAULT_DIGEST_DAYS,
    DeliveryMatchStatus,
    Direction,
    TABLE_DELIVERIES,
    TABLE_RECONCILIATIONS,
    TABLE_TRANSACTIONS,
    TransactionStatus,
)
from db.database import get_connection

DIGEST_SYSTEM = (
    "You write a short financial health update for a Kenyan wholesaler. "
    "Summarize the raw numbers in 3–4 plain sentences, no accounting jargon, "
    "suitable as a single SMS or WhatsApp message. "
    "Mix of Swahili and English is fine if natural. Return ONLY the message text."
)


def _fetch_digest_metrics(period_days: int) -> dict[str, Any]:
    """
    Aggregate receivables, payables, discrepancies, and prior-period net for Gemma.

    Args:
        period_days: Lookback window in days for "current" activity.

    Returns:
        Dict of numeric/text metrics for the digest prompt.
    """
    now = datetime.now(timezone.utc)
    period_start = (now - timedelta(days=period_days)).strftime("%Y-%m-%d")
    prior_start = (now - timedelta(days=period_days * 2)).strftime("%Y-%m-%d")
    prior_end = period_start

    with get_connection() as conn:
        # Unpaid / open receivables owed TO the wholesaler
        owed_to = conn.execute(
            f"""
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM {TABLE_TRANSACTIONS}
            WHERE direction = ?
              AND status != ?
            """,
            (Direction.RECEIVABLE.value, TransactionStatus.MATCHED.value),
        ).fetchone()["total"]

        # Unpaid / open payables owed BY the wholesaler
        owed_by = conn.execute(
            f"""
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM {TABLE_TRANSACTIONS}
            WHERE direction = ?
              AND status != ?
            """,
            (Direction.PAYABLE.value, TransactionStatus.MATCHED.value),
        ).fetchone()["total"]

        open_mismatches = conn.execute(
            f"""
            SELECT COUNT(*) AS n FROM {TABLE_TRANSACTIONS}
            WHERE status = ?
            """,
            (TransactionStatus.MISMATCHED.value,),
        ).fetchone()["n"]

        recon_notes = conn.execute(
            f"""
            SELECT discrepancy_notes FROM {TABLE_RECONCILIATIONS}
            WHERE discrepancy_notes IS NOT NULL AND TRIM(discrepancy_notes) != ''
            ORDER BY created_at DESC
            LIMIT 5
            """
        ).fetchall()

        delivery_gaps = conn.execute(
            f"""
            SELECT COUNT(*) AS n FROM {TABLE_DELIVERIES}
            WHERE match_status = ?
            """,
            (DeliveryMatchStatus.DISCREPANCY.value,),
        ).fetchone()["n"]

        # Net activity in current vs prior window (receivables − payables booked)
        def _net_between(start: str, end: str) -> float:
            row = conn.execute(
                f"""
                SELECT
                  COALESCE(SUM(CASE WHEN direction = ? THEN amount ELSE 0 END), 0)
                  - COALESCE(SUM(CASE WHEN direction = ? THEN amount ELSE 0 END), 0)
                  AS net
                FROM {TABLE_TRANSACTIONS}
                WHERE transaction_date >= ? AND transaction_date < ?
                """,
                (
                    Direction.RECEIVABLE.value,
                    Direction.PAYABLE.value,
                    start,
                    end,
                ),
            ).fetchone()
            return float(row["net"])

        current_net = _net_between(period_start, "9999-12-31")
        prior_net = _net_between(prior_start, prior_end)

    return {
        "period_days": period_days,
        "total_owed_to_wholesaler": float(owed_to),
        "total_owed_by_wholesaler": float(owed_by),
        "open_mismatched_transactions": int(open_mismatches),
        "delivery_discrepancies": int(delivery_gaps),
        "recent_discrepancy_notes": [
            r["discrepancy_notes"] for r in recon_notes if r["discrepancy_notes"]
        ],
        "net_current_period": current_net,
        "net_prior_period": prior_net,
        "net_change": current_net - prior_net,
    }


def generate_digest(period_days: int = DEFAULT_DIGEST_DAYS) -> str:
    """
    Pulls a summary across everything built so far:
      - total owed TO the wholesaler (unpaid 'receivable' transactions)
      - total owed BY the wholesaler (unpaid 'payable' transactions)
      - any open discrepancies from reconciliations or deliveries
      - net change vs the previous period, if data exists

    Sends this raw data to Gemma 4 with an instruction to summarize it
    in 3-4 plain sentences, no accounting jargon, suitable to send as a
    single SMS or WhatsApp message.

    Args:
        period_days: Lookback window (default 7).

    Returns:
        Final plain-language digest string.
    """
    if period_days < 1:
        raise ValueError("period_days must be at least 1")

    try:
        metrics = _fetch_digest_metrics(period_days)
    except sqlite3.Error as exc:
        raise RuntimeError(f"Couldn't build digest metrics: {exc}") from exc

    user_prompt = (
        f"Turn this ledger snapshot into a short SMS-style update:\n"
        f"{metrics}\n"
        "Mention money owed in/out, any mismatches or stock gaps, and whether "
        "this week looks better or worse than the prior window."
    )

    try:
        return chat_text(DIGEST_SYSTEM, user_prompt)
    except GemmaClientError as exc:
        raise RuntimeError(f"Couldn't generate digest: {exc}") from exc
