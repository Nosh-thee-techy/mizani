"""Mizizi OS WhatsApp simulation + cash-control API routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from agents.cash_control import (
    check_credit_control,
    get_buyer_trust_scores,
    get_cash_crisis,
    get_financing_pack,
    get_receivables_aging,
)
from agents.mizizi_os_agent import ask_mizizi_os

router = APIRouter(tags=["mizizi-os"])


class OsChatRequest(BaseModel):
    message: str = Field(min_length=1)


@router.post("/mizizi-os/chat")
def mizizi_os_chat(request: OsChatRequest) -> dict[str, Any]:
    """WhatsApp simulation turn for Mizizi OS cash-control agent."""
    try:
        return ask_mizizi_os(request.message.strip())
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/mizizi-os/cash-crisis")
def mizizi_os_cash_crisis() -> dict[str, Any]:
    return get_cash_crisis()


@router.get("/mizizi-os/aging")
def mizizi_os_aging() -> dict[str, Any]:
    return get_receivables_aging()


@router.get("/mizizi-os/trust-scores")
def mizizi_os_trust_scores(
    limit: int = Query(default=10, ge=1, le=25),
) -> dict[str, Any]:
    return get_buyer_trust_scores(limit=limit)


@router.get("/mizizi-os/credit-check")
def mizizi_os_credit_check(
    name: str = Query(min_length=1),
    amount: float = Query(default=0, ge=0),
) -> dict[str, Any]:
    result = check_credit_control(name, proposed_amount=amount)
    if "error" in result:
        raise HTTPException(status_code=422, detail=result["error"])
    return result


@router.get("/mizizi-os/financing-pack")
def mizizi_os_financing_pack() -> dict[str, Any]:
    return get_financing_pack()
