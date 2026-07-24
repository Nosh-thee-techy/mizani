"""Cash-control intelligence: crisis mode, credit rules, trust scores, financing pack."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from constants import TABLE_DELIVERIES, TABLE_DOCUMENTS, TABLE_TRANSACTIONS
from db.database import get_connection

CREDIT_HOLD_DAYS = 30


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    text = str(value).strip()[:10]
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _days_overdue(tx_date: str | None, today: date | None = None) -> int:
    parsed = _parse_date(tx_date)
    if parsed is None:
        return 0
    today = today or datetime.now(timezone.utc).date()
    return max(0, (today - parsed).days)


def _bucket(days: int) -> str:
    if days <= 7:
        return "0_7"
    if days <= 14:
        return "8_14"
    if days <= 30:
        return "15_30"
    if days <= 60:
        return "31_60"
    return "61_plus"


def get_receivables_aging() -> dict[str, Any]:
    """Age open receivables into 7/14/30/60+ day buckets."""
    today = datetime.now(timezone.utc).date()
    buckets = {"0_7": 0.0, "8_14": 0.0, "15_30": 0.0, "31_60": 0.0, "61_plus": 0.0}
    rows_out: list[dict[str, Any]] = []
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT id, counterparty_name, amount, transaction_date, status, notes
            FROM {TABLE_TRANSACTIONS}
            WHERE direction = 'receivable' AND status != 'matched'
            ORDER BY transaction_date ASC, id ASC
            """
        ).fetchall()
    for row in rows:
        days = _days_overdue(row["transaction_date"], today)
        item = {
            "id": row["id"],
            "counterparty_name": row["counterparty_name"],
            "amount": row["amount"],
            "transaction_date": row["transaction_date"],
            "days_overdue": days,
            "bucket": _bucket(days),
            "status": row["status"],
            "notes": row["notes"],
        }
        buckets[item["bucket"]] += float(row["amount"] or 0)
        rows_out.append(item)
    return {
        "currency": "KES",
        "as_of": today.isoformat(),
        "buckets": buckets,
        "total_open": sum(buckets.values()),
        "invoices": rows_out,
    }


def get_cash_crisis() -> dict[str, Any]:
    """Cash Crisis Mode: overdue pressure, top debtors, recommended actions."""
    aging = get_receivables_aging()
    overdue_30 = aging["buckets"]["31_60"] + aging["buckets"]["61_plus"]
    overdue_14 = overdue_30 + aging["buckets"]["15_30"]

    debtor_map: dict[str, dict[str, Any]] = {}
    for inv in aging["invoices"]:
        name = inv["counterparty_name"]
        slot = debtor_map.setdefault(
            name,
            {"name": name, "open_amount": 0.0, "oldest_days": 0, "invoice_count": 0},
        )
        slot["open_amount"] += float(inv["amount"] or 0)
        slot["oldest_days"] = max(slot["oldest_days"], inv["days_overdue"])
        slot["invoice_count"] += 1

    top_debtors = sorted(
        debtor_map.values(),
        key=lambda d: (d["oldest_days"], d["open_amount"]),
        reverse=True,
    )[:5]

    with get_connection() as conn:
        payables = conn.execute(
            f"""
            SELECT COALESCE(SUM(amount), 0) AS we_owe
            FROM {TABLE_TRANSACTIONS}
            WHERE direction = 'payable' AND status != 'matched'
            """
        ).fetchone()["we_owe"]

    actions: list[dict[str, str]] = []
    for debtor in top_debtors[:3]:
        if debtor["oldest_days"] >= CREDIT_HOLD_DAYS:
            actions.append(
                {
                    "type": "hold_credit",
                    "target": debtor["name"],
                    "detail": (
                        f"Hold new credit — {debtor['name']} is "
                        f"{debtor['oldest_days']} days overdue "
                        f"(KES {debtor['open_amount']:,.0f})."
                    ),
                }
            )
        actions.append(
            {
                "type": "remind",
                "target": debtor["name"],
                "detail": (
                    f"Send WhatsApp/SMS reminder to {debtor['name']} "
                    f"for KES {debtor['open_amount']:,.0f}."
                ),
            }
        )

    net_pressure = float(aging["total_open"]) - float(payables or 0)
    if overdue_30 > 0:
        severity = "critical"
        headline = "Cash crisis: over 30-day debt is trapping working capital."
    elif overdue_14 > 0:
        severity = "warning"
        headline = "Cash pressure rising: invoices past 14 days need chase."
    elif aging["total_open"] > 0:
        severity = "watch"
        headline = "Books are open but still collectable — stay ahead of delays."
    else:
        severity = "calm"
        headline = "No open receivables pressure right now."

    runway_hint = (
        f"If the top overdue invoices clear, you free about KES {overdue_30:,.0f} "
        "before supplier pressure bites."
        if overdue_30 > 0
        else "Keep collecting within 14 days to avoid expensive borrowing."
    )

    return {
        "currency": "KES",
        "severity": severity,
        "headline": headline,
        "runway_hint": runway_hint,
        "open_receivables": aging["total_open"],
        "overdue_14_plus": overdue_14,
        "overdue_30_plus": overdue_30,
        "open_payables": float(payables or 0),
        "net_receivable_pressure": net_pressure,
        "aging_buckets": aging["buckets"],
        "top_debtors": top_debtors,
        "recommended_actions": actions[:6],
        "as_of": aging["as_of"],
    }


def get_buyer_trust_scores(limit: int = 10) -> dict[str, Any]:
    """Score buyers 0–100 from pay speed, open risk, mismatches, delivery gaps."""
    safe_limit = max(1, min(int(limit), 25))
    aging = get_receivables_aging()

    with get_connection() as conn:
        buyers = conn.execute(
            f"""
            SELECT counterparty_name,
              COUNT(*) AS tx_count,
              COALESCE(SUM(amount), 0) AS volume,
              SUM(CASE WHEN status = 'matched' THEN 1 ELSE 0 END) AS matched_count,
              SUM(CASE WHEN status = 'mismatched' THEN 1 ELSE 0 END) AS mismatch_count,
              SUM(CASE WHEN status != 'matched' THEN amount ELSE 0 END) AS open_amount
            FROM {TABLE_TRANSACTIONS}
            WHERE direction = 'receivable'
            GROUP BY counterparty_name
            ORDER BY open_amount DESC, volume DESC
            LIMIT ?
            """,
            (safe_limit,),
        ).fetchall()

        delivery_gaps = conn.execute(
            f"""
            SELECT t.counterparty_name, COUNT(*) AS gaps
            FROM {TABLE_DELIVERIES} d
            JOIN {TABLE_TRANSACTIONS} t ON t.id = d.transaction_id
            WHERE d.match_status = 'discrepancy'
            GROUP BY t.counterparty_name
            """
        ).fetchall()
    gap_map = {r["counterparty_name"]: r["gaps"] for r in delivery_gaps}

    oldest: dict[str, int] = {}
    for inv in aging["invoices"]:
        name = inv["counterparty_name"]
        oldest[name] = max(oldest.get(name, 0), inv["days_overdue"])

    scores: list[dict[str, Any]] = []
    for row in buyers:
        name = row["counterparty_name"]
        matched = int(row["matched_count"] or 0)
        total = max(1, int(row["tx_count"] or 1))
        match_rate = matched / total
        days = oldest.get(name, 0)
        mismatches = int(row["mismatch_count"] or 0)
        gaps = int(gap_map.get(name, 0))

        score = 100
        score -= min(45, days)
        score -= min(20, mismatches * 8)
        score -= min(15, gaps * 7)
        score -= 10 if float(row["open_amount"] or 0) > 0 and days >= CREDIT_HOLD_DAYS else 0
        score += int(match_rate * 10)
        score = max(0, min(100, score))

        if score >= 80:
            band = "trusted"
        elif score >= 55:
            band = "watch"
        else:
            band = "high_risk"

        scores.append(
            {
                "name": name,
                "trust_score": score,
                "band": band,
                "open_amount": float(row["open_amount"] or 0),
                "oldest_days_overdue": days,
                "match_rate": round(match_rate, 2),
                "mismatches": mismatches,
                "delivery_gaps": gaps,
                "tx_count": total,
                "credit_hold": days >= CREDIT_HOLD_DAYS and float(row["open_amount"] or 0) > 0,
            }
        )

    scores.sort(key=lambda s: (s["trust_score"], -s["open_amount"]))
    return {
        "currency": "KES",
        "credit_hold_days": CREDIT_HOLD_DAYS,
        "buyers": list(reversed(scores)),
        "as_of": aging["as_of"],
    }


def check_credit_control(name: str, proposed_amount: float = 0) -> dict[str, Any]:
    """Soft credit rule: hold new dispatch/credit if buyer is 30+ days overdue."""
    query = name.strip()
    if not query:
        return {"error": "A buyer name is required."}

    trust = get_buyer_trust_scores(limit=50)
    match = next(
        (b for b in trust["buyers"] if query.lower() in b["name"].lower()),
        None,
    )
    if match is None:
        return {
            "currency": "KES",
            "buyer": query,
            "allowed": True,
            "soft_block": False,
            "reason": "No prior receivable history — allow with caution and set tight terms.",
            "trust_score": None,
            "proposed_amount": proposed_amount,
        }

    soft_block = bool(match["credit_hold"])
    reason = (
        f"Soft block: {match['name']} is {match['oldest_days_overdue']} days overdue "
        f"(open KES {match['open_amount']:,.0f}). Collect before new credit."
        if soft_block
        else f"OK to proceed for {match['name']} (trust {match['trust_score']}/100)."
    )
    return {
        "currency": "KES",
        "buyer": match["name"],
        "allowed": not soft_block,
        "soft_block": soft_block,
        "reason": reason,
        "trust_score": match["trust_score"],
        "band": match["band"],
        "open_amount": match["open_amount"],
        "oldest_days_overdue": match["oldest_days_overdue"],
        "proposed_amount": proposed_amount,
        "rule": f"Hold new credit when open receivables exceed {CREDIT_HOLD_DAYS} days.",
    }


def get_financing_pack() -> dict[str, Any]:
    """Clean receivables package a SACCO/lender can review for cheaper credit."""
    crisis = get_cash_crisis()
    trust = get_buyer_trust_scores(limit=15)
    aging = get_receivables_aging()

    with get_connection() as conn:
        docs = conn.execute(f"SELECT COUNT(*) AS n FROM {TABLE_DOCUMENTS}").fetchone()["n"]
        matched = conn.execute(
            f"""
            SELECT COUNT(*) AS n FROM {TABLE_TRANSACTIONS}
            WHERE direction = 'receivable' AND status = 'matched'
            """
        ).fetchone()["n"]

    eligible = [
        inv
        for inv in aging["invoices"]
        if inv["days_overdue"] <= 60 and inv["status"] != "mismatched"
    ]
    eligible_total = sum(float(i["amount"] or 0) for i in eligible)
    high_risk = [b for b in trust["buyers"] if b["band"] == "high_risk"]

    readiness = 40
    readiness += 15 if docs else 0
    readiness += 15 if matched else 0
    readiness += 10 if crisis["overdue_30_plus"] < crisis["open_receivables"] * 0.5 else 0
    readiness += 10 if len(high_risk) <= 2 else 0
    readiness += 10 if eligible_total > 0 else 0
    readiness = max(0, min(100, readiness))

    return {
        "currency": "KES",
        "title": "Mizani receivables financing pack",
        "readiness_score": readiness,
        "summary": {
            "documented_invoices": docs,
            "matched_receivables": matched,
            "open_receivables": crisis["open_receivables"],
            "eligible_collateral_estimate": eligible_total,
            "overdue_30_plus": crisis["overdue_30_plus"],
            "high_risk_buyers": len(high_risk),
        },
        "top_debtors": crisis["top_debtors"],
        "trusted_buyers": [b for b in trust["buyers"] if b["band"] == "trusted"][:5],
        "eligible_invoices": eligible[:12],
        "lender_notes": [
            "Parsed invoice archive available as audit trail.",
            "Delivery USSD confirmations strengthen proof of supply.",
            "Use this pack with a SACCO/lender for invoice-backed working capital — not a loan offer.",
        ],
        "as_of": crisis["as_of"],
    }
