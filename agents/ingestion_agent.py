"""Document ingestion agent: photo → structured ledger fields via Gemma 4 vision."""

from __future__ import annotations

from typing import Any

from agents.gemma_client import GemmaClientError, chat_vision_json
from constants import Direction, MIN_EXTRACTION_CONFIDENCE, SourceType

EXTRACTION_SYSTEM_PROMPT = """
You are the Ledger Chain document extractor for Kenyan wholesalers.
The image may be a handwritten ledger page, a printed invoice, a delivery note,
or a phone screenshot of an M-Pesa / bank message.

First identify which kind of document it is, then extract fields.

Return ONLY valid JSON (no prose, no markdown) matching this schema:
{
  "document_kind": "handwritten_ledger" | "printed_invoice" | "delivery_note" | "mpesa_screenshot" | "bank_statement" | "other",
  "counterparty_name": string,
  "amount": number,
  "transaction_date": "YYYY-MM-DD",
  "direction": "payable" | "receivable",
  "confidence": number,
  "notes": string
}

Rules:
- confidence must be between 0.0 and 1.0.
- If you cannot confidently read a required field, set confidence below 0.5
  and still return best-effort values rather than inventing details.
- direction: payable = wholesaler owes supplier; receivable = retailer owes wholesaler.
- Amounts are in KES unless clearly stated otherwise; return the numeric value only.
""".strip()


def extract_document(image_path: str, source_type: str) -> dict[str, Any]:
    """
    Sends a photographed document to Gemma 4 vision and returns
    structured data ready to insert into the `transactions` table.

    Args:
        image_path: path to the uploaded photo on disk
        source_type: one of 'invoice', 'delivery_note', 'bank_statement'

    Returns:
        A dict matching this shape:
        {
            "counterparty_name": str,
            "amount": float,
            "transaction_date": "YYYY-MM-DD",
            "direction": "payable" | "receivable",
            "confidence": float,
            "raw_response": dict
        }
    """
    # Validate source_type early so routes get a clear error
    try:
        SourceType(source_type)
    except ValueError as exc:
        raise ValueError(
            f"Invalid source_type '{source_type}'. "
            f"Expected one of: {[s.value for s in SourceType]}"
        ) from exc

    user_text = (
        f"Extract ledger fields from this {source_type.replace('_', ' ')}. "
        "Remember the image may be handwritten, printed, or an M-Pesa screenshot."
    )

    try:
        result = chat_vision_json(EXTRACTION_SYSTEM_PROMPT, user_text, image_path)
    except GemmaClientError as exc:
        # Surface a demo-safe message rather than crashing the request
        raise RuntimeError(f"Couldn't parse this document: {exc}") from exc

    parsed = result["parsed"]
    raw_response = result["raw_response"]

    counterparty = str(parsed.get("counterparty_name") or "").strip()
    amount_raw = parsed.get("amount")
    date_raw = str(parsed.get("transaction_date") or "").strip()
    direction_raw = str(parsed.get("direction") or "").strip().lower()
    confidence_raw = parsed.get("confidence", 0.0)

    try:
        amount = float(amount_raw)
    except (TypeError, ValueError):
        amount = 0.0
        confidence_raw = 0.0

    try:
        confidence = float(confidence_raw)
    except (TypeError, ValueError):
        confidence = 0.0

    # Clamp confidence into [0, 1]
    confidence = max(0.0, min(1.0, confidence))

    # Normalize direction; if invalid, force low confidence
    try:
        direction = Direction(direction_raw).value
    except ValueError:
        direction = Direction.PAYABLE.value
        confidence = min(confidence, MIN_EXTRACTION_CONFIDENCE - 0.01)

    if not counterparty or not date_raw:
        confidence = min(confidence, MIN_EXTRACTION_CONFIDENCE - 0.01)

    return {
        "counterparty_name": counterparty or "UNKNOWN",
        "amount": amount,
        "transaction_date": date_raw or "1970-01-01",
        "direction": direction,
        "confidence": confidence,
        "notes": str(parsed.get("notes") or ""),
        "raw_response": {
            "parsed": parsed,
            "api": raw_response,
        },
    }
