"""Financial health digest route — JSON summary, optional SMS delivery."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from agents.digest_agent import generate_digest
from channels.africastalking_client import send_sms
from constants import DEFAULT_DIGEST_DAYS

router = APIRouter(tags=["digest"])


@router.get("/digest")
def get_digest(
    days: int = Query(default=DEFAULT_DIGEST_DAYS, ge=1, le=90),
    phone_number: str | None = Query(
        default=None,
        description="Optional E.164 number — if set, also SMS the digest via sandbox",
    ),
) -> dict:
    """
    Generate a plain-language financial digest for the lookback window.

    Args:
        days: Period length in days (default 7).
        phone_number: Optional recipient for sandbox SMS.

    Returns:
        JSON with digest_text, generated_at, and optional sms_sent flag.
    """
    try:
        digest_text = generate_digest(period_days=days)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    generated_at = datetime.now(timezone.utc).isoformat()
    payload: dict = {
        "digest_text": digest_text,
        "generated_at": generated_at,
        "period_days": days,
    }

    if phone_number:
        sent = send_sms(phone_number, digest_text)
        payload["sms_sent"] = sent
        payload["sms_to"] = phone_number

    return payload
