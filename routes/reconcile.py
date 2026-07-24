"""Reconciliation route: match a transaction against ledger counterparts."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agents.payables_agent import ensure_pending_draft
from agents.reconciliation_agent import reconcile_transaction
from constants import TransactionStatus

router = APIRouter(tags=["reconcile"])
logger = logging.getLogger(__name__)


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
        Reconciliation result plus the automatically-created approval task.
    """
    try:
        result = reconcile_transaction(body.transaction_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    automation: dict = {
        "draft_ready": False,
        "draft": None,
        "message": "No approval draft created because reconciliation needs attention.",
    }

    # A successful reconciliation automatically creates the human approval
    # task. The SMS remains gated behind the explicit approve action.
    if result.get("status") == TransactionStatus.MATCHED.value:
        try:
            draft = ensure_pending_draft(body.transaction_id)
            automation = {
                "draft_ready": True,
                "draft": draft,
                "message": (
                    "Draft created in the approval inbox."
                    if draft["created"]
                    else "Existing pending draft reused."
                ),
            }
        except (ValueError, RuntimeError) as exc:
            # Reconciliation is already committed; report a recoverable
            # automation failure instead of misrepresenting it as rolled back.
            logger.warning(
                "Reconciled transaction %s but could not prepare draft: %s",
                body.transaction_id,
                exc,
            )
            automation["message"] = f"Reconciled, but draft preparation failed: {exc}"

    result["automation"] = automation
    return result
