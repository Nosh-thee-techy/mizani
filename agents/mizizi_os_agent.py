"""Mizizi OS — WhatsApp-style simulation agent for cash-control demos."""

from __future__ import annotations

import re
from typing import Any

from agents.business_tools import get_delivery_status, get_ledger_summary
from agents.cash_control import (
    check_credit_control,
    get_buyer_trust_scores,
    get_cash_crisis,
    get_financing_pack,
)
from agents.gemma_client import chat_text


OS_SYSTEM = """
You are Mizizi OS on WhatsApp for a Kenyan wholesaler.
Write short WhatsApp messages (max 4 short paragraphs, no markdown tables).
Speak like a shop-floor co-helper: sales, who owes money, who gets goods today,
credit holds, overdue customers. Light Swahili/English mix is fine.
Use ONLY the facts in the context JSON. Keep numbers as Kenyan shillings.
"""

DEFAULT_SUGGESTIONS = [
    "My sales today",
    "Who owes me money?",
    "Who should get goods today?",
]


def _extract_name(message: str) -> str:
    patterns = [
        r"(?:for|on|about|to|ya|kwa)\s+([A-Za-z][A-Za-z0-9 &.'-]{2,40})",
        r"credit\s+(?:check|hold)?\s*([A-Za-z][A-Za-z0-9 &.'-]{2,40})",
        r"(?:buyer|customer|client)\s+([A-Za-z][A-Za-z0-9 &.'-]{2,40})",
    ]
    for pattern in patterns:
        match = re.search(pattern, message, flags=re.IGNORECASE)
        if match:
            return match.group(1).strip(" .,?!")
    caps = re.findall(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b", message)
    return caps[-1] if caps else ""


def _detect_intent(message: str) -> str:
    text = message.lower()
    if any(k in text for k in ("financ", "loan", "sacco", "lender", "credit pack", "collateral")):
        return "financing"
    if any(k in text for k in ("trust", "score", "risky", "reliable")):
        return "trust"
    if any(
        k in text
        for k in (
            "credit",
            "more stock on account",
            "can this buyer",
            "can i give",
            "hold credit",
            "supply on credit",
        )
    ):
        return "credit"
    if any(
        k in text
        for k in (
            "goods",
            "delivery",
            "dispatch",
            "stock",
            "deliver",
            "who should get",
            "in transit",
        )
    ):
        return "goods"
    if any(
        k in text
        for k in (
            "sales",
            "mauzo",
            "sold",
            "turnover",
            "cash in",
            "money in",
            "biashara yangu",
        )
    ):
        return "sales"
    if any(
        k in text
        for k in (
            "owe",
            "owes",
            "deni",
            "overdue",
            "collect",
            "chase",
            "aging",
            "crisis",
            "cash",
            "receivable",
        )
    ):
        return "crisis"
    return "crisis"


def _format_sales(data: dict[str, Any]) -> str:
    return (
        "*Sales / cash movement*\n"
        f"Money in (period): KES {data.get('period_receivables', 0):,.0f}\n"
        f"Money out (period): KES {data.get('period_payables', 0):,.0f}\n"
        f"Still owed to you: KES {data.get('owed_to_wholesaler', 0):,.0f}\n"
        f"You still owe suppliers: KES {data.get('wholesaler_owes', 0):,.0f}\n"
        f"Lookback: {data.get('period_days', 30)} days"
    )


def _format_goods(data: dict[str, Any]) -> str:
    rows = data.get("deliveries") or []
    if not rows:
        return "*Goods / deliveries*\nHakuna pending deliveries flagged right now."
    lines = ["*Who should get / confirm goods*", ""]
    for row in rows[:5]:
        lines.append(
            f"• {row.get('counterparty_name')} — {row.get('match_status')}"
            f" (dispatch {row.get('dispatched_quantity')}, "
            f"received {row.get('receipt_confirmed_quantity')})"
        )
    return "\n".join(lines)


def _format_crisis(data: dict[str, Any]) -> str:
    debtors = data.get("top_debtors") or []
    lines = [
        "*Who owes you money*",
        f"Open receivables: KES {data['open_receivables']:,.0f}",
        f"30+ days overdue: KES {data['overdue_30_plus']:,.0f}",
        data["runway_hint"],
        "",
        "Top debtors:",
    ]
    for d in debtors[:3]:
        lines.append(f"• {d['name']} — KES {d['open_amount']:,.0f} ({d['oldest_days']}d)")
    return "\n".join(lines)


def _format_trust(data: dict[str, Any]) -> str:
    lines = ["*Buyer reliability*", ""]
    for b in (data.get("buyers") or [])[:5]:
        flag = " · HOLD CREDIT" if b.get("credit_hold") else ""
        lines.append(
            f"• {b['name']}: {b['trust_score']}/100 ({b['band']})"
            f" — open KES {b['open_amount']:,.0f}{flag}"
        )
    return "\n".join(lines)


def _format_credit(data: dict[str, Any]) -> str:
    if data.get("error"):
        return str(data["error"])
    status = "SOFT BLOCK — collect first" if data.get("soft_block") else "OK to supply"
    return (
        f"*Credit check — {data.get('buyer')}*\n"
        f"Status: {status}\n"
        f"{data.get('reason')}\n"
        f"Rule: {data.get('rule', '30-day soft hold')}"
    )


def _format_financing(data: dict[str, Any]) -> str:
    s = data.get("summary") or {}
    return (
        f"*{data.get('title')}*\n"
        f"Readiness: {data.get('readiness_score')}/100\n"
        f"Eligible collateral ~ KES {s.get('eligible_collateral_estimate', 0):,.0f}\n"
        f"Open receivables: KES {s.get('open_receivables', 0):,.0f}"
    )


def ask_mizizi_os(message: str) -> dict[str, Any]:
    """Simulate a WhatsApp turn with Mizizi OS using live ledger cash-control tools."""
    intent = _detect_intent(message)
    name = _extract_name(message)

    if intent == "sales":
        payload = get_ledger_summary(days=1)
        # Also show a short week view so empty-today demos still look useful
        week = get_ledger_summary(days=7)
        payload = {**payload, "week": week}
        card = "sales"
        fallback = (
            f"*My sales*\n"
            f"Today window: in KES {payload.get('period_receivables', 0):,.0f} / "
            f"out KES {payload.get('period_payables', 0):,.0f}\n"
            f"Last 7 days: in KES {week.get('period_receivables', 0):,.0f} / "
            f"out KES {week.get('period_payables', 0):,.0f}\n"
            f"Customers still owe you: KES {payload.get('owed_to_wholesaler', 0):,.0f}"
        )
    elif intent == "goods":
        payload = get_delivery_status()
        card = "goods"
        fallback = _format_goods(payload)
    elif intent == "trust":
        payload = get_buyer_trust_scores()
        card = "trust"
        fallback = _format_trust(payload)
    elif intent == "credit":
        # If no name, use top overdue debtor for a useful demo check
        buyer = name
        if not buyer:
            top = (get_cash_crisis().get("top_debtors") or [{}])[0]
            buyer = top.get("name") or "Unknown"
        payload = check_credit_control(buyer)
        card = "credit"
        fallback = _format_credit(payload)
    elif intent == "financing":
        payload = get_financing_pack()
        card = "financing"
        fallback = _format_financing(payload)
    else:
        payload = get_cash_crisis()
        card = "crisis"
        fallback = _format_crisis(payload)

    try:
        reply = chat_text(
            OS_SYSTEM,
            (
                f"Wholesaler WhatsApp message: {message}\n\n"
                f"Intent: {intent}\n"
                f"Tool result JSON:\n{payload}\n\n"
                "Reply as Mizizi OS on WhatsApp."
            ),
        )
    except Exception:
        reply = fallback

    suggestions = {
        "sales": [
            "Who owes me money?",
            "Who should get goods today?",
            "Any overdue customers?",
        ],
        "crisis": [
            "My sales today",
            "Who should get goods today?",
            "Can this buyer get more credit?",
        ],
        "goods": [
            "Who owes me money?",
            "My sales today",
            "Any overdue customers?",
        ],
        "trust": [
            "Who owes me money?",
            "Can this buyer get more credit?",
            "My sales today",
        ],
        "credit": [
            "Who owes me money?",
            "Who should get goods today?",
            "My sales today",
        ],
        "financing": [
            "Who owes me money?",
            "My sales today",
            "Any overdue customers?",
        ],
    }.get(intent, DEFAULT_SUGGESTIONS)

    return {
        "reply": reply,
        "intent": intent,
        "card": card,
        "data": payload,
        "suggestions": suggestions,
        "channel": "whatsapp_simulation",
    }
