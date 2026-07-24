"""Reconciliation route: match a transaction against ledger counterparts."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agents.reconciliation_agent import reconcile_transaction

router = APIRouter(tags=["reconcile"])


class ReconcileRequest(BaseModel):
    """Body for POST /reconcile."""

    transaction_id: int = Field(..., description="Transaction to reconcile")


@router.post("/reconcile")
def reconcile(body: ReconcileRequest) -> dict:
    """
    Run the reconciliation agent for a transaction id.

    Args:
        body: JSON body with transaction_id.

    Returns:
        Reconciliation result JSON from the agent.
    """
    try:
        return reconcile_transaction(body.transaction_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
