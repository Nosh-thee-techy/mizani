"""Thin Africa's Talking sandbox wrapper for SMS and USSD response formatting."""

from __future__ import annotations

import logging
import os
from typing import Any

from dotenv import load_dotenv

from db.database import PROJECT_ROOT

load_dotenv(PROJECT_ROOT / ".env")

logger = logging.getLogger(__name__)

# Prefixes required by Africa's Talking USSD gateway
USSD_CONTINUE_PREFIX = "CON "
USSD_END_PREFIX = "END "


def _sms_service() -> Any | None:
    """
    Initialize the Africa's Talking SMS service from env, or None if unset.

    Returns:
        africastalking.SMS service instance, or None when credentials missing.
    """
    username = os.getenv("AT_USERNAME", "sandbox").strip()
    api_key = os.getenv("AT_API_KEY", "").strip()

    if not api_key or api_key == "your_sandbox_api_key_here":
        logger.warning(
            "AT_API_KEY not configured — SMS sends are skipped (demo-safe no-op)."
        )
        return None

    try:
        import africastalking

        africastalking.initialize(username, api_key)
        return africastalking.SMS
    except Exception as exc:  # noqa: BLE001 — never crash callers on SDK import/init
        logger.warning("Africa's Talking init failed: %s", exc)
        return None


def send_sms(phone_number: str, message: str) -> bool:
    """
    Sends an SMS via the Africa's Talking sandbox.
    Returns True on success, False on failure — never raises, since a
    failed reminder shouldn't crash the reconciliation flow that
    triggered it.

    Args:
        phone_number: E.164 recipient, e.g. +2547XXXXXXXX.
        message: Plain-text SMS body.

    Returns:
        True if the SDK accepted the send, False otherwise.
    """
    sms = _sms_service()
    if sms is None:
        return False

    try:
        response = sms.send(message, [phone_number])
        logger.info("SMS sent to %s: %s", phone_number, response)
        return True
    except Exception as exc:  # noqa: BLE001 — contract: never raise
        logger.warning("SMS send failed to %s: %s", phone_number, exc)
        return False


def build_ussd_response(text: str, continue_session: bool) -> str:
    """
    Formats a response string in Africa's Talking's required USSD format:
    prefix with 'CON ' to keep the session open (show another menu) or
    'END ' to close it (final message).

    Args:
        text: Menu or final message body (without CON/END prefix).
        continue_session: True → CON (more input), False → END (close).

    Returns:
        Plain-text response for the USSD gateway.
    """
    body = text.strip()
    prefix = USSD_CONTINUE_PREFIX if continue_session else USSD_END_PREFIX
    return f"{prefix}{body}"
