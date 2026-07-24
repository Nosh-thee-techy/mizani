"""Thin wrapper around the Gemma 4 API (OpenAI-compatible chat completions)."""

from __future__ import annotations

import base64
import json
import os
import re
import time
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

from db.database import PROJECT_ROOT

load_dotenv(PROJECT_ROOT / ".env")


class GemmaClientError(RuntimeError):
    """Raised when a Gemma 4 API call fails or returns an unexpected payload."""


RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_SECONDS = 5.0


def _retry_delay(response: httpx.Response, attempt: int) -> float:
    """
    Determine how long to wait after a transient cloud API failure.

    Args:
        response: Failed HTTP response.
        attempt: Zero-based retry attempt.

    Returns:
        Delay in seconds, capped to keep demo requests responsive.
    """
    retry_after = response.headers.get("retry-after")
    if retry_after:
        try:
            return min(float(retry_after), 30.0)
        except ValueError:
            pass

    # Google often puts "Please retry in 4.8s" in the JSON error text
    # instead of a standard Retry-After header.
    match = re.search(r"retry in\s+([0-9.]+)s", response.text, flags=re.IGNORECASE)
    if match:
        return min(float(match.group(1)) + 0.5, 30.0)

    return min(DEFAULT_RETRY_SECONDS * (2**attempt), 30.0)


def _strip_reasoning_blocks(content: str) -> str:
    """
    Remove provider-emitted hidden reasoning tags from user-visible content.

    Args:
        content: Raw assistant text.

    Returns:
        Text without `<thought>` / `<think>` blocks.
    """
    return re.sub(
        r"<(?:thought|think)>.*?</(?:thought|think)>",
        "",
        content,
        flags=re.IGNORECASE | re.DOTALL,
    ).strip()


def _settings() -> tuple[str, str, str]:
    """
    Load API key, base URL, and model name from the environment.

    Returns:
        Tuple of (api_key, base_url, model_name).

    Raises:
        GemmaClientError: If required env vars are missing.
    """
    api_key = os.getenv("GEMMA_API_KEY", "").strip()
    base_url = os.getenv(
        "GEMMA_BASE_URL",
        "https://generativelanguage.googleapis.com/v1beta/openai/",
    ).rstrip("/")
    model = os.getenv("GEMMA_MODEL", "gemma-4-26b-it").strip()

    if not api_key or api_key == "your_api_key_here":
        raise GemmaClientError(
            "GEMMA_API_KEY is not set. Copy .env.example to .env and add your key."
        )
    return api_key, base_url, model


def _detect_image_mime(data: bytes) -> str | None:
    """
    Detect image MIME from file magic bytes.

    Args:
        data: Raw file bytes.

    Returns:
        MIME type string, or None when the payload is not a supported image.
    """
    if len(data) < 12:
        return None
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return "image/gif"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _encode_image_as_data_url(image_path: str) -> str:
    """
    Read an image from disk and return a data URL for vision requests.

    Args:
        image_path: Path to a local image file.

    Returns:
        A data: URL string with base64-encoded image bytes.
    """
    path = Path(image_path)
    if not path.exists():
        raise GemmaClientError(f"Image not found: {image_path}")

    data = path.read_bytes()
    mime = _detect_image_mime(data)
    if mime is None:
        if data[:4] == b"%PDF":
            raise GemmaClientError(
                "PDF vision is not supported here — upload a photo or screenshot "
                "of the M-Pesa / bank statement (JPG or PNG), or use Upload PDF batch."
            )
        hint = data[:80].decode("utf-8", errors="ignore").strip()
        raise GemmaClientError(
            "File is not a valid image (JPG/PNG/WebP). "
            f"Upload a real statement photo. Preview: {hint[:60]!r}"
        )

    encoded = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def chat(
    messages: list[dict[str, Any]],
    *,
    tools: list[dict[str, Any]] | None = None,
    tool_choice: str | dict[str, Any] | None = None,
    response_format: dict[str, Any] | None = None,
    temperature: float = 0.2,
) -> dict[str, Any]:
    """
    Call Gemma 4 chat completions (OpenAI-compatible).

    Args:
        messages: OpenAI-style chat messages (may include image content parts).
        tools: Optional tool/function definitions for native function calling.
        tool_choice: Optional tool_choice directive ("auto", "required", or named tool).
        response_format: Optional response_format (e.g. {"type": "json_object"}).
        temperature: Sampling temperature; low for structured extraction.

    Returns:
        The full JSON response body from the API.

    Raises:
        GemmaClientError: On network/API errors or non-JSON responses.
    """
    api_key, base_url, model = _settings()
    url = f"{base_url}/chat/completions"

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    if tools is not None:
        payload["tools"] = tools
    if tool_choice is not None:
        payload["tool_choice"] = tool_choice
    if response_format is not None:
        payload["response_format"] = response_format

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    max_retries = max(
        0,
        int(os.getenv("GEMMA_MAX_RETRIES", str(DEFAULT_MAX_RETRIES))),
    )

    try:
        with httpx.Client(timeout=120.0) as client:
            response: httpx.Response | None = None
            for attempt in range(max_retries + 1):
                response = client.post(url, headers=headers, json=payload)
                if (
                    response.status_code not in RETRYABLE_STATUS_CODES
                    or attempt == max_retries
                ):
                    break
                time.sleep(_retry_delay(response, attempt))

            if response is None:
                raise GemmaClientError("Cloud model request did not produce a response")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as exc:
        body = exc.response.text[:500] if exc.response is not None else ""
        raise GemmaClientError(
            f"Gemma API HTTP {exc.response.status_code}: {body}"
        ) from exc
    except httpx.HTTPError as exc:
        raise GemmaClientError(f"Gemma API request failed: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise GemmaClientError(f"Gemma API returned non-JSON: {exc}") from exc


def chat_vision_json(
    system_prompt: str,
    user_text: str,
    image_path: str,
) -> dict[str, Any]:
    """
    Send an image + prompts and parse a JSON object from the model reply.

    Args:
        system_prompt: Instructions that demand JSON-only output.
        user_text: User-facing instruction for this document.
        image_path: Local path to the photographed document.

    Returns:
        Parsed JSON dict from the assistant message content.

    Raises:
        GemmaClientError: If the API fails or content is not valid JSON.
    """
    data_url = _encode_image_as_data_url(image_path)
    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": user_text},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        },
    ]

    raw = chat(
        messages,
        response_format={"type": "json_object"},
        temperature=0.1,
    )

    try:
        content = raw["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise GemmaClientError(f"Unexpected Gemma response shape: {raw}") from exc

    if isinstance(content, list):
        # Some OpenAI-compatible providers return content as parts
        content = "".join(
            part.get("text", "") for part in content if isinstance(part, dict)
        )

    if not isinstance(content, str) or not content.strip():
        raise GemmaClientError("Gemma returned empty content for vision JSON request")

    # Strip optional markdown fences if the model ignores json_object mode
    cleaned = _strip_reasoning_blocks(content)
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        # drop first fence line and optional trailing fence
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise GemmaClientError(
            f"Could not parse document JSON from model: {exc}. Raw: {cleaned[:300]}"
        ) from exc

    if isinstance(parsed, list):
        dicts = [item for item in parsed if isinstance(item, dict)]
        if dicts:
            parsed = dicts[0]
        else:
            raise GemmaClientError("Model JSON was a list but contained no objects")

    if not isinstance(parsed, dict):
        raise GemmaClientError("Model JSON was not an object")
    return {"parsed": parsed, "raw_response": raw}


def chat_with_tools(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    *,
    tool_choice: str | dict[str, Any] = "auto",
) -> dict[str, Any]:
    """
    Call Gemma with native tool/function definitions and return the message.

    Args:
        messages: Conversation so far.
        tools: OpenAI-style tool schemas.
        tool_choice: How the model should pick tools.

    Returns:
        The assistant message dict (may include tool_calls).
    """
    raw = chat(messages, tools=tools, tool_choice=tool_choice, temperature=0.2)
    try:
        return raw["choices"][0]["message"]
    except (KeyError, IndexError, TypeError) as exc:
        raise GemmaClientError(f"Unexpected Gemma tool response shape: {raw}") from exc


def chat_text(system_prompt: str, user_prompt: str) -> str:
    """
    Simple text completion helper for drafting messages.

    Args:
        system_prompt: Tone / role instructions.
        user_prompt: Concrete drafting request with transaction details.

    Returns:
        Plain text from the assistant message.
    """
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    raw = chat(messages, temperature=0.4)
    try:
        content = raw["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise GemmaClientError(f"Unexpected Gemma text response shape: {raw}") from exc

    if isinstance(content, list):
        content = "".join(
            part.get("text", "") for part in content if isinstance(part, dict)
        )
    if not isinstance(content, str) or not content.strip():
        raise GemmaClientError("Gemma returned empty text content")
    return _strip_reasoning_blocks(content)
