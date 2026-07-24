"""Unit tests for the document ingestion agent (mocked Gemma client)."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from agents.ingestion_agent import extract_document
from constants import MIN_EXTRACTION_CONFIDENCE


@pytest.fixture()
def fake_image(tmp_path):
    """
    Create a temporary fake image file path for extract_document.

    Args:
        tmp_path: pytest temporary directory.

    Returns:
        Path string to a dummy image file.
    """
    path = tmp_path / "receipt.jpg"
    path.write_bytes(b"fake-image-bytes")
    return str(path)


def test_extract_document_happy_path(fake_image):
    """
    extract_document should normalize a confident Gemma JSON payload.

    Args:
        fake_image: Temporary image path fixture.
    """
    mock_payload = {
        "parsed": {
            "document_kind": "printed_invoice",
            "counterparty_name": "John's Duka",
            "amount": 5000,
            "transaction_date": "2026-07-01",
            "direction": "receivable",
            "confidence": 0.91,
            "notes": "ok",
        },
        "raw_response": {"id": "mock"},
    }

    with patch("agents.ingestion_agent.chat_vision_json", return_value=mock_payload):
        result = extract_document(fake_image, "invoice")

    assert result["counterparty_name"] == "John's Duka"
    assert result["amount"] == 5000.0
    assert result["direction"] == "receivable"
    assert result["confidence"] >= MIN_EXTRACTION_CONFIDENCE
    assert "raw_response" in result


def test_extract_document_low_confidence_on_missing_fields(fake_image):
    """
    Missing required fields should force confidence below the insert threshold.

    Args:
        fake_image: Temporary image path fixture.
    """
    mock_payload = {
        "parsed": {
            "document_kind": "other",
            "counterparty_name": "",
            "amount": 100,
            "transaction_date": "",
            "direction": "payable",
            "confidence": 0.9,
            "notes": "",
        },
        "raw_response": {},
    }

    with patch("agents.ingestion_agent.chat_vision_json", return_value=mock_payload):
        result = extract_document(fake_image, "bank_statement")

    assert result["confidence"] < MIN_EXTRACTION_CONFIDENCE


def test_extract_document_rejects_bad_source_type(fake_image):
    """
    Invalid source_type values should raise ValueError before calling Gemma.

    Args:
        fake_image: Temporary image path fixture.
    """
    with pytest.raises(ValueError):
        extract_document(fake_image, "receipt")
