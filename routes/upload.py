"""Upload route: accept a document photo, extract fields, persist ledger rows."""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from agents.ingestion_agent import extract_document
from constants import (
    MIN_EXTRACTION_CONFIDENCE,
    SourceType,
    TABLE_DOCUMENTS,
    TABLE_TRANSACTIONS,
    TransactionStatus,
)
from db.database import PROJECT_ROOT, get_connection

router = APIRouter(tags=["upload"])


def _upload_dir() -> Path:
    """
    Resolve the directory used to store uploaded document images.

    Returns:
        Absolute Path to the upload directory (created if missing).
    """
    raw = os.getenv("UPLOAD_DIR", "uploads")
    path = Path(raw)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    path.mkdir(parents=True, exist_ok=True)
    return path


@router.post("/upload-document")
async def upload_document(
    file: UploadFile = File(..., description="Photographed invoice/note/statement"),
    source_type: str = Form(..., description="invoice | delivery_note | bank_statement"),
) -> dict:
    """
    Accept an image + source_type, run ingestion, insert documents + transactions.

    Args:
        file: Uploaded image multipart file.
        source_type: Document type enum string.

    Returns:
        JSON with document_id, transaction, and confidence. If confidence is low,
        transaction is omitted and a flag is returned instead.
    """
    try:
        SourceType(source_type)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid source_type. Expected one of: {[s.value for s in SourceType]}",
        ) from exc

    suffix = Path(file.filename or "upload.jpg").suffix or ".jpg"
    dest = _upload_dir() / f"{uuid.uuid4().hex}{suffix}"

    try:
        content = await file.read()
        dest.write_bytes(content)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {exc}") from exc

    try:
        extracted = extract_document(str(dest), source_type)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    confidence = float(extracted["confidence"])
    raw_json = json.dumps(extracted["raw_response"], default=str)

    # Always store the document audit row; only insert a transaction if confident
    try:
        with get_connection() as conn:
            cur = conn.execute(
                f"""
                INSERT INTO {TABLE_DOCUMENTS} (source_type, image_path, raw_extracted_json)
                VALUES (?, ?, ?)
                """,
                (source_type, str(dest), raw_json),
            )
            document_id = int(cur.lastrowid)

            if confidence < MIN_EXTRACTION_CONFIDENCE:
                conn.commit()
                return {
                    "document_id": document_id,
                    "inserted": False,
                    "confidence": confidence,
                    "message": (
                        f"Couldn't confidently parse this document "
                        f"(confidence {confidence:.2f} < {MIN_EXTRACTION_CONFIDENCE}). "
                        "No transaction was inserted."
                    ),
                    "extraction": {
                        "counterparty_name": extracted["counterparty_name"],
                        "amount": extracted["amount"],
                        "transaction_date": extracted["transaction_date"],
                        "direction": extracted["direction"],
                    },
                }

            cur = conn.execute(
                f"""
                INSERT INTO {TABLE_TRANSACTIONS}
                    (document_id, counterparty_name, amount, transaction_date,
                     direction, status, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    document_id,
                    extracted["counterparty_name"],
                    extracted["amount"],
                    extracted["transaction_date"],
                    extracted["direction"],
                    TransactionStatus.UNRECONCILED.value,
                    extracted.get("notes") or None,
                ),
            )
            transaction_id = int(cur.lastrowid)
            conn.commit()

            row = conn.execute(
                f"SELECT * FROM {TABLE_TRANSACTIONS} WHERE id = ?",
                (transaction_id,),
            ).fetchone()
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail=f"Database write failed: {exc}") from exc

    return {
        "document_id": document_id,
        "inserted": True,
        "confidence": confidence,
        "transaction": {key: row[key] for key in row.keys()},
    }
