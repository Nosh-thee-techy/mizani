"""Thin wrapper around the Gemma 4 API (OpenAI-compatible chat completions)."""

from __future__ import annotations

import base64
import json
import mimetypes
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

    mime, _ = mimetypes.guess_type(path.name)
    if mime is None:
        mime = "image/jpeg"

    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
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

    _max_retries = 3
    _last_exc: Exception | None = None
    for attempt in range(_max_retries + 1):
        try:
            with httpx.Client(timeout=120.0) as client:
                response = client.post(url, headers=headers, json=payload)

                # Transparent retry on 429 rate-limit
                if response.status_code == 429:
                    body = response.text
                    # Extract retry delay from API message, e.g. "retry in 54.1s"
                    match = re.search(r"retry in ([\d.]+)s", body, re.IGNORECASE)
                    wait_s = float(match.group(1)) if match else (20 * (attempt + 1))
                    wait_s = min(wait_s, 65)  # cap at 65 s
                    if attempt < _max_retries:
                        time.sleep(wait_s)
                        continue
                    # All retries exhausted — surface the 429
                    raise GemmaClientError(f"Gemma API HTTP 429: {body[:500]}")

                response.raise_for_status()
                return response.json()
        except GemmaClientError:
            raise
        except httpx.HTTPStatusError as exc:
            body = exc.response.text[:500] if exc.response is not None else ""
            raise GemmaClientError(
                f"Gemma API HTTP {exc.response.status_code}: {body}"
            ) from exc
        except httpx.HTTPError as exc:
            _last_exc = exc
            if attempt < _max_retries:
                time.sleep(5 * (attempt + 1))
                continue
            raise GemmaClientError(f"Gemma API request failed: {exc}") from exc
        except json.JSONDecodeError as exc:
            raise GemmaClientError(f"Gemma API returned non-JSON: {exc}") from exc
    raise GemmaClientError(f"Gemma API request failed after retries: {_last_exc}")


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
    cleaned = content.strip()
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
    return content.strip()


def chat_json(system_prompt: str, user_prompt: str) -> dict[str, Any]:
    """
    Call Gemma with system and user prompts, demanding JSON output.
    """
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    raw = chat(messages, response_format={"type": "json_object"}, temperature=0.1)
    try:
        content = raw["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise GemmaClientError(f"Unexpected Gemma JSON response shape: {raw}") from exc

    if isinstance(content, list):
        content = "".join(part.get("text", "") for part in content if isinstance(part, dict))

    cleaned = content.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise GemmaClientError(f"Could not parse JSON from model: {exc}. Raw: {cleaned[:300]}") from exc

    if isinstance(parsed, list):
        dicts = [item for item in parsed if isinstance(item, dict)]
        if dicts:
            parsed = dicts[0]
        else:
            raise GemmaClientError("Model JSON was a list but contained no objects")

    if not isinstance(parsed, dict):
        raise GemmaClientError("Model JSON was not an object")
    return {"parsed": parsed, "raw_response": raw}
