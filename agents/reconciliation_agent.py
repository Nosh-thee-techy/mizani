"""Reconciliation agent: match transactions using Gemma 4 function calling + SQL tool."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta
from typing import Any

from agents.gemma_client import GemmaClientError, chat, chat_with_tools
from constants import (
    AMOUNT_TOLERANCE_PERCENT,
    DATE_WINDOW_DAYS,
    TABLE_RECONCILIATIONS,
    TABLE_TRANSACTIONS,
    TransactionStatus,
)
from db.database import get_connection

# OpenAI-style tool schema the model can call to fetch SQL candidates
QUERY_CANDIDATES_TOOL: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "query_candidate_transactions",
        "description": (
            "Look up unreconciled candidate transactions that might match "
            "the source transaction. Uses fuzzy counterparty matching and a date window."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "counterparty_name": {
                    "type": "string",
                    "description": "Counterparty name to fuzzy-match against.",
                },
                "date_range": {
                    "type": "object",
                    "description": "Inclusive date window as YYYY-MM-DD strings.",
                    "properties": {
                        "start": {"type": "string"},
                        "end": {"type": "string"},
                    },
                    "required": ["start", "end"],
                },
            },
            "required": ["counterparty_name", "date_range"],
        },
    },
}


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    """
    Convert a sqlite3.Row into a plain dict.

    Args:
        row: Database row.

    Returns:
        Dict of column name → value.
    """
    return {key: row[key] for key in row.keys()}


def _normalize_name(name: str) -> str:
    """
    Normalize a counterparty name for fuzzy SQL LIKE matching.

    Args:
        name: Raw counterparty string.

    Returns:
        Lowercased name with apostrophes/punctuation simplified.
    """
    cleaned = name.lower().replace("'", "").replace(".", "").replace(",", "")
    return " ".join(cleaned.split())


def query_candidate_transactions(
    counterparty_name: str,
    date_range: dict[str, str],
    *,
    exclude_id: int,
) -> list[dict[str, Any]]:
    """
    Run the SQL tool: fetch unreconciled candidates in a date window.

    Matching is intentionally loose (LIKE on name tokens) so Gemma can
    decide among candidates with fuzzy name awareness.

    Args:
        counterparty_name: Name to search for.
        date_range: Dict with 'start' and 'end' YYYY-MM-DD strings.
        exclude_id: Source transaction id to exclude from results.

    Returns:
        List of candidate transaction dicts.
    """
    start = date_range["start"]
    end = date_range["end"]
    tokens = [t for t in _normalize_name(counterparty_name).split() if len(t) > 2]
    # Fall back to a broad unreconciled pull in the date window if name is tiny
    if not tokens:
        tokens = ["%"]

    # Build OR of LIKE clauses over significant tokens (e.g. "john", "duka")
    like_clauses = " OR ".join(
        ["LOWER(REPLACE(counterparty_name, '''', '')) LIKE ?" for _ in tokens]
    )
    like_params = [f"%{token}%" for token in tokens]

    sql = f"""
        SELECT id, document_id, counterparty_name, amount, transaction_date,
               direction, status, notes
        FROM {TABLE_TRANSACTIONS}
        WHERE id != ?
          AND status = ?
          AND transaction_date BETWEEN ? AND ?
          AND ({like_clauses})
        ORDER BY transaction_date ASC
        LIMIT 25
    """
    params: list[Any] = [
        exclude_id,
        TransactionStatus.UNRECONCILED.value,
        start,
        end,
        *like_params,
    ]

    with get_connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_row_to_dict(r) for r in rows]


def _default_date_range(transaction_date: str) -> dict[str, str]:
    """
    Build a ±DATE_WINDOW_DAYS range around a transaction date.

    Args:
        transaction_date: YYYY-MM-DD string.

    Returns:
        Dict with start/end ISO dates.
    """
    try:
        center = datetime.strptime(transaction_date, "%Y-%m-%d").date()
    except ValueError:
        center = datetime.utcnow().date()
    delta = timedelta(days=DATE_WINDOW_DAYS)
    return {
        "start": (center - delta).isoformat(),
        "end": (center + delta).isoformat(),
    }


def _parse_tool_arguments(raw_args: str | dict[str, Any]) -> dict[str, Any]:
    """
    Normalize tool call arguments from string JSON or already-parsed dict.

    Args:
        raw_args: Arguments payload from the model tool call.

    Returns:
        Parsed argument dict.
    """
    if isinstance(raw_args, dict):
        return raw_args
    return json.loads(raw_args)


def _ask_model_for_match(
    source: dict[str, Any],
    candidates: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Ask Gemma to pick the best candidate and describe any discrepancy.

    Args:
        source: Source transaction dict.
        candidates: Candidate transactions from the SQL tool.

    Returns:
        Dict with matched, matched_transaction_id, confidence, discrepancy_notes.
    """
    system = (
        "You are the Mizani reconciliation agent. "
        "Given a source transaction and candidate matches, decide if there is a match. "
        "Priority: (1) same counterparty fuzzy name, (2) amount within "
        f"{AMOUNT_TOLERANCE_PERCENT}%, (3) dates within {DATE_WINDOW_DAYS} days, "
        "(4) opposite/complementary direction where relevant. "
        "Return ONLY JSON: "
        '{"matched": bool, "matched_transaction_id": int|null, '
        '"confidence": number, "discrepancy_notes": string|null}'
    )
    user = json.dumps(
        {
            "source_transaction": source,
            "candidates": candidates,
            "rules": {
                "amount_tolerance_percent": AMOUNT_TOLERANCE_PERCENT,
                "date_window_days": DATE_WINDOW_DAYS,
            },
        },
        default=str,
    )

    try:
        raw = chat(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        content = raw["choices"][0]["message"]["content"]
        if isinstance(content, list):
            content = "".join(
                part.get("text", "") for part in content if isinstance(part, dict)
            )
        decision = json.loads(content)
    except (GemmaClientError, KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Couldn't reconcile this transaction: {exc}") from exc

    return {
        "matched": bool(decision.get("matched")),
        "matched_transaction_id": decision.get("matched_transaction_id"),
        "confidence": float(decision.get("confidence") or 0.0),
        "discrepancy_notes": decision.get("discrepancy_notes"),
    }


def reconcile_transaction(transaction_id: int) -> dict[str, Any]:
    """
    Attempts to find a matching counterpart transaction for the given
    transaction (e.g. match an invoice to its payment, or a delivery
    note to its invoice), and flags any discrepancy.

    Matching logic (in priority order):
    1. Same counterparty_name (fuzzy match)
    2. Amount within 1% of each other
    3. transaction_date within 14 days of each other
    4. Opposite or complementary direction where relevant

    Args:
        transaction_id: Primary key of the source transaction.

    Returns:
        {
            "matched": bool,
            "matched_transaction_id": int | None,
            "confidence": float,
            "discrepancy_notes": str | None
        }
    """
    with get_connection() as conn:
        row = conn.execute(
            f"SELECT * FROM {TABLE_TRANSACTIONS} WHERE id = ?",
            (transaction_id,),
        ).fetchone()

    if row is None:
        raise ValueError(f"Transaction {transaction_id} not found")

    source = _row_to_dict(row)
    date_range = _default_date_range(str(source["transaction_date"]))

    tools = [QUERY_CANDIDATES_TOOL]
    messages: list[dict[str, Any]] = [
        {
            "role": "system",
            "content": (
                "You reconcile Kenyan wholesaler ledger entries. "
                "Call query_candidate_transactions with a counterparty_name and date_range "
                "to fetch candidates, then decide the best match."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Find a match for transaction {json.dumps(source, default=str)}. "
                f"Suggested date_range: {json.dumps(date_range)}. "
                "Call the tool first."
            ),
        },
    ]

    candidates: list[dict[str, Any]] = []
    try:
        # First turn: encourage a tool call
        assistant_msg = chat_with_tools(messages, tools, tool_choice="auto")
        messages.append(assistant_msg)

        tool_calls = assistant_msg.get("tool_calls") or []
        if tool_calls:
            for call in tool_calls:
                fn = call.get("function") or {}
                if fn.get("name") != "query_candidate_transactions":
                    continue
                args = _parse_tool_arguments(fn.get("arguments") or {})
                # Always exclude the source id in the tool implementation
                tool_result = query_candidate_transactions(
                    counterparty_name=str(
                        args.get("counterparty_name") or source["counterparty_name"]
                    ),
                    date_range=args.get("date_range") or date_range,
                    exclude_id=transaction_id,
                )
                candidates = tool_result
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.get("id", "call_0"),
                        "content": json.dumps(tool_result, default=str),
                    }
                )
        else:
            # Model skipped tools — still run the SQL helper ourselves for the demo
            candidates = query_candidate_transactions(
                counterparty_name=str(source["counterparty_name"]),
                date_range=date_range,
                exclude_id=transaction_id,
            )
    except GemmaClientError as exc:
        # Fall back to SQL-only candidates so the demo can still proceed
        candidates = query_candidate_transactions(
            counterparty_name=str(source["counterparty_name"]),
            date_range=date_range,
            exclude_id=transaction_id,
        )
        # If we have no API at all later decision will also fail — re-raise clearly
        if not candidates:
            raise RuntimeError(f"Couldn't reconcile this transaction: {exc}") from exc

    # If tool loop returned candidates via messages but decision still needed:
    if not candidates:
        candidates = query_candidate_transactions(
            counterparty_name=str(source["counterparty_name"]),
            date_range=date_range,
            exclude_id=transaction_id,
        )

    result = _ask_model_for_match(source, candidates)

    matched = result["matched"]
    matched_id = result["matched_transaction_id"]
    confidence = max(0.0, min(1.0, float(result["confidence"])))
    notes = result["discrepancy_notes"]

    # Validate matched_id is actually in the candidate set
    candidate_ids = {c["id"] for c in candidates}
    if matched_id is not None and matched_id not in candidate_ids:
        matched = False
        matched_id = None
        notes = (notes or "") + " Model proposed an invalid match id; ignored."
        confidence = min(confidence, 0.3)

    # Status: matched vs mismatched (amount gap) vs no match
    if matched and matched_id is not None:
        match_row = next(c for c in candidates if c["id"] == matched_id)
        src_amt = float(source["amount"])
        other_amt = float(match_row["amount"])
        if src_amt > 0:
            pct_diff = abs(src_amt - other_amt) / src_amt * 100.0
        else:
            pct_diff = 0.0 if other_amt == 0 else 100.0

        if pct_diff > AMOUNT_TOLERANCE_PERCENT:
            status = TransactionStatus.MISMATCHED.value
            if not notes:
                notes = f"Amount differs by {pct_diff:.1f}%"
            matched_flag = True  # linked, but flagged
        else:
            status = TransactionStatus.MATCHED.value
            matched_flag = True
    else:
        status = TransactionStatus.MISMATCHED.value
        matched_flag = False
        matched_id = None
        if not notes:
            notes = "No suitable counterpart transaction found"

    try:
        with get_connection() as conn:
            conn.execute(
                f"""
                INSERT INTO {TABLE_RECONCILIATIONS}
                    (transaction_a_id, transaction_b_id, match_confidence, discrepancy_notes)
                VALUES (?, ?, ?, ?)
                """,
                (transaction_id, matched_id, confidence, notes),
            )
            conn.execute(
                f"UPDATE {TABLE_TRANSACTIONS} SET status = ? WHERE id = ?",
                (status, transaction_id),
            )
            if matched_id is not None:
                conn.execute(
                    f"UPDATE {TABLE_TRANSACTIONS} SET status = ? WHERE id = ?",
                    (status, matched_id),
                )
            conn.commit()
    except sqlite3.Error as exc:
        raise RuntimeError(f"Failed to save reconciliation: {exc}") from exc

    return {
        "matched": matched_flag,
        "matched_transaction_id": matched_id,
        "confidence": confidence,
        "discrepancy_notes": notes,
        "status": status,
    }


def flag_delivery_discrepancy(transaction_id: int, discrepancy_notes: str) -> None:
    """
    Surface a Stock Trail shortfall in the same reconciliations stream as payment mismatches.

    Inserts a reconciliations row (no counterpart) and marks the transaction mismatched.

    Args:
        transaction_id: Ledger transaction tied to the delivery.
        discrepancy_notes: Plain-language explanation of the quantity gap.

    Returns:
        None
    """
    try:
        with get_connection() as conn:
            row = conn.execute(
                f"SELECT id FROM {TABLE_TRANSACTIONS} WHERE id = ?",
                (transaction_id,),
            ).fetchone()
            if row is None:
                raise ValueError(f"Transaction {transaction_id} not found")

            conn.execute(
                f"""
                INSERT INTO {TABLE_RECONCILIATIONS}
                    (transaction_a_id, transaction_b_id, match_confidence, discrepancy_notes)
                VALUES (?, NULL, ?, ?)
                """,
                (transaction_id, 0.0, discrepancy_notes),
            )
            conn.execute(
                f"UPDATE {TABLE_TRANSACTIONS} SET status = ? WHERE id = ?",
                (TransactionStatus.MISMATCHED.value, transaction_id),
            )
            conn.commit()
    except sqlite3.Error as exc:
        raise RuntimeError(f"Failed to flag delivery discrepancy: {exc}") from exc
