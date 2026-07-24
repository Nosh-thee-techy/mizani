"""Tests for the reconciliation → approval-inbox automation bridge."""

from __future__ import annotations

from unittest.mock import patch

from constants import TransactionStatus
from routes.reconcile import ReconcileRequest, reconcile


def test_matched_reconciliation_prepares_draft() -> None:
    """A matched result should create the approval task in the same request."""
    result = {
        "matched": True,
        "matched_transaction_id": 9,
        "confidence": 0.98,
        "discrepancy_notes": None,
        "status": TransactionStatus.MATCHED.value,
    }
    draft = {
        "id": 4,
        "transaction_id": 3,
        "draft_type": "reminder",
        "created": True,
    }

    with (
        patch("routes.reconcile.reconcile_transaction", return_value=result),
        patch("routes.reconcile.ensure_pending_draft", return_value=draft) as ensure,
    ):
        response = reconcile(ReconcileRequest(transaction_id=3))

    ensure.assert_called_once_with(3)
    assert response["automation"]["draft_ready"] is True
    assert response["automation"]["draft"]["id"] == 4


def test_mismatch_does_not_create_draft() -> None:
    """A discrepancy should remain in the action inbox without unsafe drafting."""
    result = {
        "matched": True,
        "matched_transaction_id": 9,
        "confidence": 0.84,
        "discrepancy_notes": "Amount differs by 16%",
        "status": TransactionStatus.MISMATCHED.value,
    }

    with (
        patch("routes.reconcile.reconcile_transaction", return_value=result),
        patch("routes.reconcile.ensure_pending_draft") as ensure,
    ):
        response = reconcile(ReconcileRequest(transaction_id=3))

    ensure.assert_not_called()
    assert response["automation"]["draft_ready"] is False

