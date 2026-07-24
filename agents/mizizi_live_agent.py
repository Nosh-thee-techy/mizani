"""Gemini Live session bridge for Mizizi, the Mizani voice co-helper."""

from __future__ import annotations

import asyncio
import base64
import os
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types

from agents.business_tools import LIVE_TOOL_DECLARATIONS, execute_business_tool


MIZIZI_SYSTEM_PROMPT = """
You are Mizizi, the warm, capable female voice co-helper inside Mizani for Kenyan
wholesalers. Speak naturally in the language the wholesaler uses: Kenyan English,
Kiswahili, or light Sheng. You can code-switch naturally, but keep financial
figures and business facts unambiguous.

Your job is to help with invoices, customer and supplier balances, cash flow,
stock deliveries, reconciliations, cash crisis mode, credit holds, buyer trust
scores, financing readiness, and practical next steps. Keep spoken answers
brief and conversational. Ask only one clarification at a time.

Business safety rules:
- Use the provided tools before stating any ledger-specific number or status.
- Never invent an invoice, payment, customer, supplier, or delivery.
- Say clearly when data is missing, old, or uncertain.
- Treat parsed documents as records to explain, not proof that payment occurred.
- Never approve payments or send messages; explain what the wholesaler can review.
- Read currency as Kenyan shillings, not as an unexplained abbreviation.
"""


def _api_key() -> str:
    key = (os.getenv("GEMINI_API_KEY") or os.getenv("GEMMA_API_KEY") or "").strip()
    if not key or key == "your_api_key_here":
        raise RuntimeError("Set GEMINI_API_KEY or GEMMA_API_KEY before starting voice mode.")
    return key


def _config() -> dict[str, Any]:
    return {
        "response_modalities": ["AUDIO"],
        "system_instruction": MIZIZI_SYSTEM_PROMPT,
        "temperature": 0.35,
        "speech_config": {
            "voice_config": {"prebuilt_voice_config": {"voice_name": "Aoede"}}
        },
        "tools": [{"function_declarations": LIVE_TOOL_DECLARATIONS}],
        "input_audio_transcription": {},
        "output_audio_transcription": {},
        "session_resumption": {},
        "context_window_compression": {"sliding_window": {}},
    }


async def _send_event(websocket: WebSocket, event_type: str, **payload: Any) -> None:
    await websocket.send_json({"type": event_type, **payload})


async def _forward_mobile(websocket: WebSocket, session: Any) -> None:
    while True:
        event = await websocket.receive_json()
        event_type = event.get("type")
        if event_type == "audio":
            encoded = event.get("data", "")
            if encoded:
                await session.send_realtime_input(
                    audio=types.Blob(
                        data=base64.b64decode(encoded),
                        mime_type="audio/pcm;rate=16000",
                    )
                )
        elif event_type == "text":
            text = str(event.get("text", "")).strip()
            if text:
                await session.send_realtime_input(text=text)
        elif event_type == "audio_end":
            await session.send_realtime_input(audio_stream_end=True)
        elif event_type == "close":
            return


async def _handle_tool_calls(websocket: WebSocket, session: Any, message: Any) -> None:
    responses: list[types.FunctionResponse] = []
    for call in message.tool_call.function_calls or []:
        name = call.name or ""
        await _send_event(websocket, "tool", name=name, state="running")
        result = await asyncio.to_thread(execute_business_tool, name, dict(call.args or {}))
        responses.append(
            types.FunctionResponse(
                name=name,
                id=call.id,
                response={"result": result},
            )
        )
        await _send_event(websocket, "tool", name=name, state="complete")
    if responses:
        await session.send_tool_response(function_responses=responses)


async def _forward_gemini(websocket: WebSocket, session: Any) -> None:
    turn_id = 0
    while True:
        async for message in session.receive():
            if message.tool_call:
                await _handle_tool_calls(websocket, session, message)

            content = message.server_content
            if content:
                if content.interrupted:
                    turn_id += 1
                    await _send_event(websocket, "interrupted", turn_id=str(turn_id))

                if content.input_transcription and content.input_transcription.text:
                    await _send_event(
                        websocket,
                        "transcript",
                        role="user",
                        text=content.input_transcription.text,
                    )
                if content.output_transcription and content.output_transcription.text:
                    await _send_event(
                        websocket,
                        "transcript",
                        role="assistant",
                        text=content.output_transcription.text,
                    )

                if content.model_turn:
                    for part in content.model_turn.parts or []:
                        inline_data = part.inline_data
                        if inline_data and inline_data.data:
                            await _send_event(
                                websocket,
                                "audio",
                                data=base64.b64encode(inline_data.data).decode("ascii"),
                                turn_id=str(turn_id),
                                mime_type=inline_data.mime_type or "audio/pcm;rate=24000",
                            )

                if content.generation_complete:
                    await _send_event(websocket, "generation_complete", turn_id=str(turn_id))
                if content.turn_complete:
                    await _send_event(websocket, "turn_complete", turn_id=str(turn_id))
                    turn_id += 1

            if message.session_resumption_update:
                update = message.session_resumption_update
                if update.resumable and update.new_handle:
                    await _send_event(websocket, "resume", handle=update.new_handle)
            if message.go_away:
                await _send_event(websocket, "reconnecting")


async def run_mizizi_session(websocket: WebSocket) -> None:
    """Bridge one authenticated-by-network mobile socket to Gemini Live."""
    await websocket.accept()
    try:
        client = genai.Client(
            api_key=_api_key(),
            http_options={"api_version": "v1beta"},
        )
        model = os.getenv("GEMINI_LIVE_MODEL", "gemini-3.1-flash-live-preview")
        async with client.aio.live.connect(model=model, config=_config()) as session:
            await _send_event(websocket, "ready", model=model)
            mobile_task = asyncio.create_task(_forward_mobile(websocket, session))
            gemini_task = asyncio.create_task(_forward_gemini(websocket, session))
            done, pending = await asyncio.wait(
                {mobile_task, gemini_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            for task in done:
                task.result()
    except WebSocketDisconnect:
        return
    except Exception as exc:
        try:
            await _send_event(websocket, "error", message=str(exc))
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
