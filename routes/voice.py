"""Realtime voice transport for Mizizi."""

from fastapi import APIRouter, WebSocket

from agents.mizizi_live_agent import run_mizizi_session


router = APIRouter(prefix="/voice", tags=["voice"])


@router.websocket("/live")
async def mizizi_live(websocket: WebSocket) -> None:
    """Stream microphone audio, transcripts, tools, and spoken replies."""
    await run_mizizi_session(websocket)
