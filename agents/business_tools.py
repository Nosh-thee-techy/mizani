"""Read-only business tools shared by Mizizi's text and live voice agents."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from agents.cash_control import (
    check_credit_control,
    get_buyer_trust_scores,
    get_cash_crisis,
    get_financing_pack,
    get_receivables_aging,
)
from constants import TABLE_DELIVERIES, TABLE_DOCUMENTS, TABLE_TRANSACTIONS
from db.database import get_connection


def get_ledger_summary(days: int = 30) -> dict[str, Any]:
    """Return receivables, payables, movement, and exception counts."""
    safe_days = max(1, min(int(days), 365))
    since = (datetime.now(timezone.utc) - timedelta(days=safe_days)).date().isoformat()
    with get_connection() as conn:
        totals = conn.execute(
            f"""
            SELECT
              COALESCE(SUM(CASE WHEN direction = 'receivable' AND status != 'matched'
                THEN amount ELSE 0 END), 0) AS owed_to_us,
              COALESCE(SUM(CASE WHEN direction = 'payable' AND status != 'matched'
                THEN amount ELSE 0 END), 0) AS we_owe,
              COALESCE(SUM(CASE WHEN direction = 'receivable' AND transaction_date >= ?
                THEN amount ELSE 0 END), 0) AS period_in,
              COALESCE(SUM(CASE WHEN direction = 'payable' AND transaction_date >= ?
                THEN amount ELSE 0 END), 0) AS period_out,
              SUM(CASE WHEN status = 'mismatched' THEN 1 ELSE 0 END) AS mismatches
            FROM {TABLE_TRANSACTIONS}
            """,
            (since, since),
        ).fetchone()
        delivery = conn.execute(
            f"""
            SELECT
              SUM(CASE WHEN match_status = 'pending' THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN match_status = 'discrepancy' THEN 1 ELSE 0 END) AS discrepancies
            FROM {TABLE_DELIVERIES}
            """
        ).fetchone()
    return {
        "currency": "KES",
        "period_days": safe_days,
        "owed_to_wholesaler": totals["owed_to_us"],
        "wholesaler_owes": totals["we_owe"],
        "period_receivables": totals["period_in"],
        "period_payables": totals["period_out"],
        "mismatches": totals["mismatches"] or 0,
        "pending_deliveries": delivery["pending"] or 0,
        "delivery_discrepancies": delivery["discrepancies"] or 0,
    }


def search_transactions(
    counterparty: str = "",
    direction: str = "",
    limit: int = 8,
) -> dict[str, Any]:
    """Search recent transactions using constrained, parameterized filters."""
    safe_limit = max(1, min(int(limit), 20))
    clauses: list[str] = []
    params: list[Any] = []
    if counterparty.strip():
        clauses.append("LOWER(counterparty_name) LIKE ?")
        params.append(f"%{counterparty.strip().lower()}%")
    if direction in {"payable", "receivable"}:
        clauses.append("direction = ?")
        params.append(direction)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(safe_limit)
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT id, counterparty_name, amount, transaction_date, direction, status, notes
            FROM {TABLE_TRANSACTIONS}
            {where}
            ORDER BY transaction_date DESC, id DESC
            LIMIT ?
            """,
            params,
        ).fetchall()
    return {"currency": "KES", "transactions": [dict(row) for row in rows]}


def get_counterparty_balance(name: str) -> dict[str, Any]:
    """Return open balances for a customer or supplier."""
    query = name.strip()
    if not query:
        return {"error": "A counterparty name is required."}
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT counterparty_name, direction,
              COALESCE(SUM(CASE WHEN status != 'matched' THEN amount ELSE 0 END), 0) AS open_amount,
              COUNT(*) AS transaction_count
            FROM {TABLE_TRANSACTIONS}
            WHERE LOWER(counterparty_name) LIKE ?
            GROUP BY counterparty_name, direction
            ORDER BY open_amount DESC
            LIMIT 10
            """,
            (f"%{query.lower()}%",),
        ).fetchall()
    return {"currency": "KES", "matches": [dict(row) for row in rows]}


def get_recent_documents(limit: int = 5) -> dict[str, Any]:
    """Return recent parsed documents and their normalized transactions."""
    safe_limit = max(1, min(int(limit), 10))
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT d.id, d.source_type, d.uploaded_at,
              COUNT(t.id) AS transaction_count,
              COALESCE(SUM(t.amount), 0) AS total_amount
            FROM {TABLE_DOCUMENTS} d
            LEFT JOIN {TABLE_TRANSACTIONS} t ON t.document_id = d.id
            GROUP BY d.id, d.source_type, d.uploaded_at
            ORDER BY d.uploaded_at DESC, d.id DESC
            LIMIT ?
            """,
            (safe_limit,),
        ).fetchall()
    return {"currency": "KES", "documents": [dict(row) for row in rows]}


def get_delivery_status(status: str = "") -> dict[str, Any]:
    """Return recent delivery states and discrepancies."""
    clauses = ""
    params: list[Any] = []
    if status in {"pending", "matched", "discrepancy"}:
        clauses = "WHERE d.match_status = ?"
        params.append(status)
    params.append(10)
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT d.id, d.match_status, d.dispatched_quantity,
              d.receipt_confirmed_quantity, d.driver_status, d.discrepancy_notes,
              t.counterparty_name, t.transaction_date
            FROM {TABLE_DELIVERIES} d
            JOIN {TABLE_TRANSACTIONS} t ON t.id = d.transaction_id
            {clauses}
            ORDER BY d.id DESC
            LIMIT ?
            """,
            params,
        ).fetchall()
    return {"deliveries": [dict(row) for row in rows]}


TOOL_FUNCTIONS: dict[str, Callable[..., dict[str, Any]]] = {
    "get_ledger_summary": get_ledger_summary,
    "search_transactions": search_transactions,
    "get_counterparty_balance": get_counterparty_balance,
    "get_recent_documents": get_recent_documents,
    "get_delivery_status": get_delivery_status,
    "get_cash_crisis": get_cash_crisis,
    "get_receivables_aging": get_receivables_aging,
    "get_buyer_trust_scores": get_buyer_trust_scores,
    "check_credit_control": check_credit_control,
    "get_financing_pack": get_financing_pack,
}


LIVE_TOOL_DECLARATIONS = [
    {
        "name": "get_ledger_summary",
        "description": "Get current balances, cash movement, mismatches, and delivery alerts.",
        "parameters": {
            "type": "OBJECT",
            "properties": {"days": {"type": "INTEGER", "description": "Lookback period, 1 to 365 days."}},
        },
    },
    {
        "name": "search_transactions",
        "description": "Find recent invoices or ledger transactions by counterparty or direction.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "counterparty": {"type": "STRING"},
                "direction": {"type": "STRING", "enum": ["payable", "receivable"]},
                "limit": {"type": "INTEGER"},
            },
        },
    },
    {
        "name": "get_counterparty_balance",
        "description": "Look up open balances for a named customer or supplier.",
        "parameters": {
            "type": "OBJECT",
            "properties": {"name": {"type": "STRING"}},
            "required": ["name"],
        },
    },
    {
        "name": "get_recent_documents",
        "description": "List recently uploaded and parsed invoices, statements, or delivery notes.",
        "parameters": {
            "type": "OBJECT",
            "properties": {"limit": {"type": "INTEGER"}},
        },
    },
    {
        "name": "get_delivery_status",
        "description": "Check pending, matched, or discrepant stock deliveries.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "status": {"type": "STRING", "enum": ["pending", "matched", "discrepancy"]}
            },
        },
    },
    {
        "name": "get_cash_crisis",
        "description": "Cash Crisis Mode: overdue totals, top debtors, and chase actions.",
        "parameters": {"type": "OBJECT", "properties": {}},
    },
    {
        "name": "get_receivables_aging",
        "description": "Age open customer invoices into 7/14/30/60+ day buckets.",
        "parameters": {"type": "OBJECT", "properties": {}},
    },
    {
        "name": "get_buyer_trust_scores",
        "description": "Score buyers 0-100 for pay reliability and credit risk.",
        "parameters": {
            "type": "OBJECT",
            "properties": {"limit": {"type": "INTEGER"}},
        },
    },
    {
        "name": "check_credit_control",
        "description": "Soft credit check before dispatching or giving more credit to a buyer.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "name": {"type": "STRING"},
                "proposed_amount": {"type": "NUMBER"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "get_financing_pack",
        "description": "Build a clean receivables financing pack for SACCO/lender discussions.",
        "parameters": {"type": "OBJECT", "properties": {}},
    },
]


def execute_business_tool(name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
    """Dispatch a model tool call to an allowlisted read-only function."""
    function = TOOL_FUNCTIONS.get(name)
    if function is None:
        return {"error": f"Unknown tool: {name}"}
    try:
        return function(**(arguments or {}))
    except (TypeError, ValueError) as exc:
        return {"error": f"Invalid arguments for {name}: {exc}"}
    except Exception as exc:
        return {"error": f"{name} could not read the ledger: {exc}"}
