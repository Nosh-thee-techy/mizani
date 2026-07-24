"""Chatbot router: query the Mizani business intelligence assistant."""

from __future__ import annotations

from typing import Any, List, Dict
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents.chat_agent import ask_business_assistant

router = APIRouter(prefix="/chat", tags=["chat"])

class ChatQueryRequest(BaseModel):
    message: str
    history: List[Dict[str, str]] = [] # [{'role': 'user'|'assistant', 'content': '...'}]

@router.post("/query")
def query_chatbot(request: ChatQueryRequest) -> dict[str, Any]:
    """
    Submits user query + past chat history to the Gemma 4 business advisor.
    """
    try:
        result = ask_business_assistant(request.message, request.history)
        return result
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))
