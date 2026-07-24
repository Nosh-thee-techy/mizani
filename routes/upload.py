"""Upload route: accept documents, extract fields, persist ledger rows, handle batch PDF splitting."""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
import logging
from pathlib import Path
from typing import List

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pypdf import PdfReader, PdfWriter

from agents.ingestion_agent import extract_document
from constants import (
    MIN_EXTRACTION_CONFIDENCE,
    SourceType,
    TABLE_DOCUMENTS,
    TABLE_TRANSACTIONS,
    TransactionStatus,
)
from db.database import PROJECT_ROOT, get_connection

logger = logging.getLogger(__name__)
router = APIRouter(tags=["upload"])


def _upload_dir() -> Path:
    """Resolve the directory used to store uploaded document images."""
    raw = os.getenv("UPLOAD_DIR", "uploads")
    path = Path(raw)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    path.mkdir(parents=True, exist_ok=True)
    return path


@router.get("/documents")
def list_documents(limit: int = 20) -> dict:
    """Retrieve history of recently uploaded invoices, receipts, and statements."""
    try:
        with get_connection() as conn:
            rows = conn.execute(
                f"""
                SELECT id, source_type, image_path, raw_extracted_json, uploaded_at
                FROM {TABLE_DOCUMENTS}
                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail=f"Database query failed: {exc}")

    results = []
    for r in rows:
        extracted = {}
        if r["raw_extracted_json"]:
            try:
                raw_data = json.loads(r["raw_extracted_json"])
                extracted = raw_data.get("parsed") or raw_data
            except Exception:
                pass
        
        results.append({
            "id": r["id"],
            "source_type": r["source_type"],
            "image_path": Path(r["image_path"]).name if r["image_path"] else None,
            "uploaded_at": r["uploaded_at"],
            "extracted": {
                "counterparty_name": extracted.get("counterparty_name") or "Unrecognized Customer",
                "amount": extracted.get("amount") or 0.0,
                "transaction_date": extracted.get("transaction_date") or None,
                "direction": extracted.get("direction") or None,
            }
        })
    return {"documents": results}


def process_single_file(file_path: Path, source_type: str) -> dict:
    """Helper to run extraction and save document + transaction records in database."""
    try:
        extracted = extract_document(str(file_path), source_type)
    except Exception as exc:
        logger.error(f"Failed to process file {file_path.name}: {exc}")
        return {"file_name": file_path.name, "success": False, "error": str(exc)}

    confidence = float(extracted.get("confidence", 0.0))
    raw_json = json.dumps(extracted.get("raw_response", {}), default=str)

    try:
        with get_connection() as conn:
            cur = conn.execute(
                f"""
                INSERT INTO {TABLE_DOCUMENTS} (source_type, image_path, raw_extracted_json)
                VALUES (?, ?, ?)
                """,
                (source_type, str(file_path), raw_json),
            )
            document_id = int(cur.lastrowid)

            if confidence < MIN_EXTRACTION_CONFIDENCE:
                conn.commit()
                return {
                    "file_name": file_path.name,
                    "document_id": document_id,
                    "success": True,
                    "inserted": False,
                    "confidence": confidence,
                    "message": f"Low extraction confidence ({confidence:.2f})",
                    "extraction": extracted
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
            
            return {
                "file_name": file_path.name,
                "document_id": document_id,
                "success": True,
                "inserted": True,
                "confidence": confidence,
                "transaction": {key: row[key] for key in row.keys()}
            }
    except sqlite3.Error as exc:
        return {"file_name": file_path.name, "success": False, "error": f"DB Write Failed: {exc}"}


@router.post("/upload-document")
async def upload_document(
    file: UploadFile = File(..., description="Photographed invoice/note/statement"),
    source_type: str = Form(..., description="invoice | delivery_note | bank_statement"),
) -> dict:
    """Accept an image or PDF file, process it, and persist details in database."""
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

    # Vision path expects a photo/screenshot — reject empty or non-image early
    if dest.suffix.lower() == ".pdf":
        raise HTTPException(
            status_code=400,
            detail=(
                "Use Upload PDF (batch) for multi-page PDFs, or upload a JPG/PNG "
                "screenshot of the statement instead."
            ),
        )

    result = process_single_file(dest, source_type)
    if not result.get("success", True):
        raise HTTPException(status_code=422, detail=result.get("error") or "Upload failed")
    return result


@router.post("/upload-batch")
async def upload_batch(
    file: UploadFile = File(..., description="Multipage PDF document to split and ingest"),
    source_type: str = Form(..., description="invoice | delivery_note | bank_statement"),
) -> dict:
    """
    Batch Ingestion Endpoint:
    If a PDF is uploaded, splits it into single pages and processes each page in the batch queue.
    """
    try:
        SourceType(source_type)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid source_type. Expected one of: {[s.value for s in SourceType]}",
        ) from exc

    suffix = Path(file.filename or "batch.pdf").suffix or ".pdf"
    if suffix.lower() != ".pdf":
        raise HTTPException(status_code=400, detail="Batch ingestion requires a PDF file.")

    temp_batch = _upload_dir() / f"batch_{uuid.uuid4().hex}.pdf"
    try:
        content = await file.read()
        temp_batch.write_bytes(content)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save batch file: {exc}") from exc

    # Split the PDF into individual pages
    try:
        reader = PdfReader(temp_batch)
        total_pages = len(reader.pages)
        split_paths: List[Path] = []
        
        for i in range(total_pages):
            writer = PdfWriter()
            writer.add_page(reader.pages[i])
            page_dest = _upload_dir() / f"split_{temp_batch.stem}_page_{i+1}.pdf"
            with open(page_dest, "wb") as f:
                writer.write(f)
            split_paths.append(page_dest)
            
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to read/split PDF: {exc}")

    # Process pages in a sequential queue
    results = []
    for page_path in split_paths:
        res = process_single_file(page_path, source_type)
        results.append(res)

    # Clean up master batch file
    try:
        os.remove(temp_batch)
    except OSError:
        pass

    return {
        "success": True,
        "total_pages_processed": total_pages,
        "results": results
    }
