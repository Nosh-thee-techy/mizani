"""Chat Agent: allows wholesalers to query their business books using Gemma 4."""

from __future__ import annotations

import json
from typing import Any

from agents.gemma_client import chat
from constants import (
    TABLE_DELIVERIES,
    TABLE_TRANSACTIONS,
    TABLE_CONTACTS,
)
from db.database import get_connection

CHAT_SYSTEM_PROMPT = """
You are the Mizani Business Assistant, an AI advisor for Kenyan wholesalers.
You are helping the wholesaler manage their bookkeeping, cash flow, statements, and deliveries.

You have access to the following real-time business context from the SQLite database:
{context}

Rules:
1. Answer the wholesaler's questions accurately using the provided data.
2. Use a friendly Swahili/English mix (Sheng-light) naturally.
3. Be concise and practical — wholesalers are busy people.
4. At the very end of your response, output a suggestion JSON block wrapped in ---suggested--- tags containing 2 or 3 brief follow-up questions they could click next. Example:
---suggested---
[
  "How much does Kamau Hardware owe me?",
  "Are there any delivery gaps today?"
]
"""

def get_business_context() -> str:
    """Fetch structured summary of the business database to feed as context."""
    try:
        with get_connection() as conn:
            # 1. Financial summary
            totals = conn.execute(
                f"""
                SELECT
                  SUM(CASE WHEN direction = 'receivable' AND status != 'matched' THEN amount ELSE 0 END) as owed_to_us,
                  SUM(CASE WHEN direction = 'payable' AND status != 'matched' THEN amount ELSE 0 END) as we_owe,
                  SUM(CASE WHEN direction = 'receivable' THEN amount ELSE 0 END) as total_receivables,
                  SUM(CASE WHEN direction = 'payable' THEN amount ELSE 0 END) as total_payables
                FROM {TABLE_TRANSACTIONS}
                """
            ).fetchone()

            # 2. Delivery gaps
            gaps = conn.execute(
                f"""
                SELECT COUNT(*) as n FROM {TABLE_DELIVERIES} WHERE match_status = 'discrepancy'
                """
            ).fetchone()["n"]

            # 3. Overdue/Pending deliveries
            pending_del = conn.execute(
                f"""
                SELECT COUNT(*) as n FROM {TABLE_DELIVERIES} WHERE match_status = 'pending'
                """
            ).fetchone()["n"]

            # 4. Top buyers
            buyers = conn.execute(
                f"""
                SELECT counterparty_name, SUM(amount) as total, COUNT(*) as tx_count
                FROM {TABLE_TRANSACTIONS}
                WHERE direction = 'receivable'
                GROUP BY counterparty_name
                ORDER BY total DESC
                LIMIT 5
                """
            ).fetchall()

            # 5. Mismatches
            mismatches = conn.execute(
                f"""
                SELECT COUNT(*) as n FROM {TABLE_TRANSACTIONS} WHERE status = 'mismatched'
                """
            ).fetchone()["n"]

        context_dict = {
            "financials": {
                "owed_to_wholesaler_receivables": totals["owed_to_us"] or 0.0,
                "wholesaler_owes_payables": totals["we_owe"] or 0.0,
                "total_receivables_volume": totals["total_receivables"] or 0.0,
                "total_payables_volume": totals["total_payables"] or 0.0,
            },
            "mismatches_count": mismatches,
            "delivery_discrepancies": gaps,
            "pending_deliveries": pending_del,
            "top_customers": [
                {"name": r["counterparty_name"], "total_bought": r["total"], "transactions": r["tx_count"]}
                for r in buyers
            ]
        }
        return json.dumps(context_dict, indent=2)
    except Exception as e:
        return f"Error loading context: {e}"

def ask_business_assistant(message: str, history: list[dict[str, str]] = None) -> dict[str, Any]:
    """
    Submits user message and database context to Gemma, returning the response and suggestions.
    """
    if history is None:
        history = []

    context = get_business_context()
    sys_prompt = CHAT_SYSTEM_PROMPT.format(context=context)

    # Format history and prompt for LLM call
    messages = [{"role": "system", "content": sys_prompt}]
    for h in history:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    try:
        raw = chat(messages, temperature=0.3)
        reply = raw["choices"][0]["message"]["content"]
    except Exception as e:
        return {
            "reply": f"Pole sana, I encountered an error: {e}",
            "suggestions": ["What are my top customer balances?", "Show summary of cash flow"]
        }

    # Extract suggested questions if present
    suggestions = ["What are my top customer balances?", "How much do we owe suppliers?"]
    if "---suggested---" in reply:
        try:
            parts = reply.split("---suggested---")
            reply_text = parts[0].strip()
            suggested_json = parts[1].strip()
            suggestions = json.loads(suggested_json)
            reply = reply_text
        except Exception:
            pass

    return {
        "reply": reply,
        "suggestions": suggestions
    }
