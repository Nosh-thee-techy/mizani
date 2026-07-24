"""Stock Trail routes: dispatch photo upload and delivery status lookup."""

from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from agents.stock_trail_agent import create_delivery_from_dispatch
from constants import TABLE_DELIVERIES, TABLE_TRANSACTIONS
from db.database import PROJECT_ROOT, get_connection

router = APIRouter(tags=["stock_trail"])


def _upload_dir() -> Path:
    """
    Resolve (and create) the directory for dispatch photos.

    Returns:
        Absolute Path to the upload directory.
    """
    raw = os.getenv("UPLOAD_DIR", "uploads")
    path = Path(raw)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    path.mkdir(parents=True, exist_ok=True)
    return path


@router.post("/dispatch")
async def dispatch_stock(
    transaction_id: int = Form(..., description="Related ledger transaction id"),
    file: UploadFile = File(..., description="Photo of loaded stock"),
    invoice_quantity: int | None = Form(
        default=None,
        description="Optional unit count from the invoice (stored as qty:N on notes)",
    ),
) -> dict:
    """
    Accept a transaction_id + dispatch photo, count units, write a deliveries row.

    Args:
        transaction_id: Ledger transaction this dispatch belongs to.
        file: Multipart image of loaded goods.
        invoice_quantity: Optional invoice unit count for three-way match.

    Returns:
        Created delivery plus vision extraction metadata.
    """
    with get_connection() as conn:
        tx = conn.execute(
            f"SELECT id FROM {TABLE_TRANSACTIONS} WHERE id = ?",
            (transaction_id,),
        ).fetchone()
    if tx is None:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found")

    suffix = Path(file.filename or "dispatch.jpg").suffix or ".jpg"
    dest = _upload_dir() / f"dispatch_{uuid.uuid4().hex}{suffix}"
    try:
        dest.write_bytes(await file.read())
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save photo: {exc}") from exc

    try:
        result = create_delivery_from_dispatch(
            transaction_id,
            str(dest),
            invoice_quantity=invoice_quantity,
        )
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return result


@router.get("/deliveries/{transaction_id}")
def get_deliveries(transaction_id: int) -> dict:
    """
    Return current delivery trail status for a transaction (demo view).

    Args:
        transaction_id: Ledger transaction primary key.

    Returns:
        Dict with transaction_id and list of delivery rows.
    """
    with get_connection() as conn:
        tx = conn.execute(
            f"SELECT id FROM {TABLE_TRANSACTIONS} WHERE id = ?",
            (transaction_id,),
        ).fetchone()
        if tx is None:
            raise HTTPException(
                status_code=404,
                detail=f"Transaction {transaction_id} not found",
            )
        rows = conn.execute(
            f"""
            SELECT * FROM {TABLE_DELIVERIES}
            WHERE transaction_id = ?
            ORDER BY id DESC
            """,
            (transaction_id,),
        ).fetchall()

    deliveries = [{key: r[key] for key in r.keys()} for r in rows]
    # Lightweight trail labels for the demo UI / curl output
    for item in deliveries:
        if item.get("receipt_confirmed_quantity") is not None:
            stage = item.get("match_status") or "receipt_confirmed"
        elif item.get("dispatched_quantity") is not None:
            stage = "in_transit"
        else:
            stage = "created"
        item["trail_stage"] = stage

    return {"transaction_id": transaction_id, "deliveries": deliveries}
