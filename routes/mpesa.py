"""M-PESA connect/sync routes for the wholesaler React Native app (sandbox fixture)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agents.mpesa_intake import connect_mpesa, get_mpesa_link, sync_mpesa_fixture

router = APIRouter(prefix="/mpesa", tags=["mpesa"])


class ConnectBody(BaseModel):
    """Body for POST /mpesa/connect."""

    display_name: str = Field(default="Wholesaler Till", min_length=1)
    phone_number: str = Field(default="+254700000000", min_length=10)


class SyncBody(BaseModel):
    """Body for POST /mpesa/sync."""

    force: bool = Field(
        default=False,
        description="Re-insert fixture rows even if notes already exist",
    )


@router.get("/status")
def mpesa_status() -> dict:
    """
    Return current M-PESA link state for the app header.

    Returns:
        Dict with linked flag and link row (or null).
    """
    link = get_mpesa_link()
    return {
        "linked": bool(link and link.get("linked")),
        "link": link,
    }


@router.post("/connect")
def mpesa_connect(body: ConnectBody) -> dict:
    """
    Mark M-PESA as connected for the demo wholesaler.

    Args:
        body: Display name and phone for the sandbox till.

    Returns:
        Created link row.
    """
    try:
        link = connect_mpesa(body.display_name, body.phone_number)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"linked": True, "link": link}


@router.post("/sync")
def mpesa_sync(body: SyncBody | None = None) -> dict:
    """
    Pull sandbox fixture rows into documents/transactions.

    Args:
        body: Optional force flag.

    Returns:
        Sync summary with inserted/skipped counts.
    """
    force = bool(body.force) if body else False
    try:
        return sync_mpesa_fixture(force=force)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
