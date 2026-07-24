"""FastAPI entrypoint for Mizani (API + React Native wholesaler client)."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.database import init_db
from routes import analytics, digest, drafts, mpesa, reconcile, stock_trail, upload, ussd, chat


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """
    Initialize the SQLite schema (and migrations) on startup.

    Args:
        _app: FastAPI application instance (unused).

    Yields:
        Control to the running application.
    """
    init_db()
    yield


app = FastAPI(
    title="Mizani",
    description=(
        "Hackathon prototype backend for Kenyan wholesalers — "
        "ingestion, reconciliation, drafts, USSD/SMS, stock trail, digests, "
        "M-PESA sandbox sync, and analytics for the React Native app."
    ),
    version="0.3.0",
    lifespan=lifespan,
)

# Expo / LAN / ngrok clients need cross-origin access to the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(reconcile.router)
app.include_router(drafts.router)
app.include_router(ussd.router)
app.include_router(stock_trail.router)
app.include_router(digest.router)
app.include_router(mpesa.router)
app.include_router(analytics.router)
app.include_router(chat.router)


@app.get("/health")
def health() -> dict[str, str]:
    """
    Lightweight health check for demos and smoke tests.

    Returns:
        Simple status payload.
    """
    return {"status": "ok", "service": "mizani"}
