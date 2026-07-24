"""Analytics routes for the wholesaler React Native app."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from agents.analytics_agent import (
    build_overview,
    list_counterparties,
    list_goods_activity,
    list_inbox_items,
    list_transactions_for_counterparty,
)
from constants import DEFAULT_DIGEST_DAYS

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview")
def analytics_overview(
    days: int = Query(default=DEFAULT_DIGEST_DAYS, ge=1, le=90),
) -> dict:
    """
    Business pulse: metrics + Gemma narrative.

    Args:
        days: Lookback window.

    Returns:
        { metrics, narrative, generated_at }.
    """
    try:
        return build_overview(period_days=days)
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/counterparties")
def analytics_counterparties(
    days: int = Query(default=DEFAULT_DIGEST_DAYS, ge=0, le=365),
) -> dict:
    """
    Ranked buyers/suppliers for the Customers screen.

    Args:
        days: Lookback (0 = all time).

    Returns:
        Dict with counterparties list.
    """
    try:
        items = list_counterparties(period_days=days)
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"counterparties": items, "period_days": days}


@router.get("/counterparties/{name}/transactions")
def counterparty_transactions(name: str) -> dict:
    """
    Transaction history for one counterparty.

    Args:
        name: Counterparty name (URL-encoded).

    Returns:
        Dict with name and transactions.
    """
    return {
        "name": name,
        "transactions": list_transactions_for_counterparty(name),
    }


@router.get("/inbox")
def analytics_inbox() -> dict:
    """
    Action inbox: mismatches + pending drafts.

    Returns:
        Dict with mismatches and pending_drafts lists.
    """
    try:
        return list_inbox_items()
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/goods")
def analytics_goods() -> dict:
    """
    Inventory / Stock Trail activity for the Goods screen.

    Returns:
        Dict with deliveries list.
    """
    try:
        return {"deliveries": list_goods_activity()}
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
