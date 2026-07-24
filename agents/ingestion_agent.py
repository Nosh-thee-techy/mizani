"""Document ingestion agent: photo → structured ledger fields via Gemma 4 vision."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from agents.gemma_client import GemmaClientError, chat_vision_json, chat_json
from constants import Direction, MIN_EXTRACTION_CONFIDENCE, SourceType

EXTRACTION_TEXT_SYSTEM_PROMPT = """
You are the Mizani document extractor for Kenyan wholesalers.
You will extract fields from copy-pasted M-Pesa SMS messages, bank notifications, or written transaction logs.

Return ONLY valid JSON matching this schema:
{
  "counterparty_name": string,
  "amount": number,
  "transaction_date": "YYYY-MM-DD",
  "direction": "payable" | "receivable",
  "confidence": number,
  "notes": string
}

Rules:
- direction: payable = wholesaler owes supplier; receivable = retailer owes wholesaler.
- Amounts are in KES; extract numeric values only.
""".strip()

EXTRACTION_SYSTEM_PROMPT = """
You are the Mizani document extractor for Kenyan wholesalers.
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


PDF_EXTRACTION_SYSTEM_PROMPT = """
You are the Mizani document extractor for Kenyan wholesalers.
You will receive raw text extracted from a PDF invoice, delivery note, or bank statement.

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
- counterparty_name: the buyer or supplier name (e.g. "Maisha Supermarket", "Kariuki Agrovet").
- amount: the TOTAL amount on the document as a plain number (e.g. 35500).
- direction: "receivable" if the wholesaler is owed money (invoice TO a customer); "payable" if the wholesaler owes a supplier.
- confidence: 0.8-1.0 if you can clearly read all fields; lower if uncertain.
- Amounts are in KES; return the numeric value only, no commas or currency symbol.
""".strip()


def extract_pdf_document(file_path: str, source_type: str) -> dict[str, Any]:
    """
    Extract text from a PDF file using pypdf, then send to Gemma chat_json.
    PDFs cannot be sent as images to the vision API — this is the correct path.
    """
    try:
        from pypdf import PdfReader
        reader = PdfReader(file_path)
        pages_text = []
        for page in reader.pages:
            t = page.extract_text()
            if t:
                pages_text.append(t.strip())
        full_text = "\n\n--- PAGE BREAK ---\n\n".join(pages_text)
    except Exception as exc:
        raise RuntimeError(f"Could not read PDF text: {exc}") from exc

    if not full_text.strip():
        raise RuntimeError("PDF contains no extractable text (may be a scanned image PDF).")

    user_text = (
        f"Extract ledger fields from this PDF {source_type.replace('_', ' ')}.\n\n"
        f"PDF TEXT CONTENT:\n{full_text[:4000]}"  # cap to avoid token limits
    )

    try:
        result = chat_json(PDF_EXTRACTION_SYSTEM_PROMPT, user_text)
    except GemmaClientError as exc:
        raise RuntimeError(f"Couldn't parse this PDF document: {exc}") from exc

    parsed = result["parsed"]
    raw_response = result["raw_response"]

    counterparty = str(parsed.get("counterparty_name") or "").strip()
    amount_raw = parsed.get("amount")
    date_raw = str(parsed.get("transaction_date") or "").strip()
    direction_raw = str(parsed.get("direction") or "").strip().lower()
    confidence_raw = parsed.get("confidence", 0.8)

    try:
        amount = float(str(amount_raw).replace(",", ""))
    except (TypeError, ValueError):
        amount = 0.0
        confidence_raw = 0.3

    try:
        confidence = float(confidence_raw)
    except (TypeError, ValueError):
        confidence = 0.5
    confidence = max(0.0, min(1.0, confidence))

    # For well-structured text PDFs, boost confidence if key fields present
    if counterparty and amount > 0 and len(date_raw) == 10:
        confidence = max(confidence, 0.75)

    try:
        direction = Direction(direction_raw).value
    except ValueError:
        direction = Direction.RECEIVABLE.value
        confidence = min(confidence, 0.49)

    return {
        "counterparty_name": counterparty or "UNKNOWN",
        "amount": amount,
        "transaction_date": date_raw or "1970-01-01",
        "direction": direction,
        "confidence": confidence,
        "notes": str(parsed.get("notes") or f"Extracted from PDF: {Path(file_path).name}"),
        "raw_response": {
            "parsed": parsed,
            "api": raw_response,
        },
    }


def extract_document(image_path: str, source_type: str) -> dict[str, Any]:
    """
    Extract structured ledger fields from a document file.
    - For PDF files: extracts text via pypdf and sends to chat_json (text API).
    - For image files (JPG, PNG, etc.): sends to chat_vision_json (vision API).

    Args:
        image_path: path to the uploaded file on disk
        source_type: one of 'invoice', 'delivery_note', 'bank_statement'
    """
    # Validate source_type early so routes get a clear error
    try:
        SourceType(source_type)
    except ValueError as exc:
        raise ValueError(
            f"Invalid source_type '{source_type}'. "
            f"Expected one of: {[s.value for s in SourceType]}"
        ) from exc

    # Route PDF files through text extraction — vision API cannot process PDFs
    if Path(image_path).suffix.lower() == ".pdf":
        return extract_pdf_document(image_path, source_type)

    user_text = (
        f"Extract ledger fields from this {source_type.replace('_', ' ')}. "
        "Remember the image may be handwritten, printed, or an M-Pesa screenshot."
    )

    try:
        result = chat_vision_json(EXTRACTION_SYSTEM_PROMPT, user_text, image_path)
    except GemmaClientError as exc:
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


def extract_text_document(text_content: str, source_type: str) -> dict[str, Any]:
    """
    Sends raw copy-pasted statement text to Gemma and returns structured transaction details.
    """
    try:
        SourceType(source_type)
    except ValueError as exc:
        raise ValueError(
            f"Invalid source_type '{source_type}'. "
            f"Expected one of: {[s.value for s in SourceType]}"
        ) from exc

    user_text = f"Extract ledger fields from this raw text statement: \n\n{text_content}"
    try:
        result = chat_json(EXTRACTION_TEXT_SYSTEM_PROMPT, user_text)
    except GemmaClientError as exc:
        raise RuntimeError(f"Couldn't parse this text statement: {exc}") from exc

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

    direction = "receivable"
    if "pay" in direction_raw or "sent" in direction_raw or "out" in direction_raw or "payable" in direction_raw:
        direction = "payable"

    # Default to current date if missing
    from datetime import date
    transaction_date = date_raw if len(date_raw) == 10 else date.today().isoformat()

    return {
        "counterparty_name": counterparty or "Unknown Client",
        "amount": amount,
        "transaction_date": transaction_date,
        "direction": direction,
        "confidence": float(confidence_raw),
        "notes": parsed.get("notes") or f"Extracted from text: {text_content[:40]}...",
        "raw_response": {
            "parsed": parsed,
            "api": raw_response,
        },
    }
