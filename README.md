# Mizani

**When stock, invoices, and M-PESA finally balance.**

Mizani helps Kenyan wholesalers keep books *sawa* — photo a document, reconcile money and stock, chase payables over SMS/USSD, and see the business pulse on mobile.

## What it does

| Capability | What happens |
|---|---|
| **Ingest** | Photo invoices, delivery notes, bank statements → Gemma extracts structured transactions |
| **Reconcile** | Match payables ↔ receivables / statements; flag mismatches |
| **Act** | Draft payment & reminder SMS; approve to send via Africa's Talking |
| **Stock trail** | Three-way match: invoice ↔ dispatch ↔ retailer USSD receipt |
| **M-PESA** | Sandbox sync into the same ledger |
| **Pulse** | Digests + analytics for the Expo mobile app |

## Architecture

```mermaid
flowchart LR
  subgraph Clients
    M[Expo mobile]
    U[USSD / SMS]
    C[Camera / uploads]
  end

  subgraph Mizani["Mizani API (FastAPI)"]
    R[Routes]
    A[Agents]
    DB[(SQLite)]
  end

  subgraph External
    G[Gemma / Gemini]
    AT[Africa's Talking]
    MP[M-PESA sandbox]
  end

  C --> R
  M --> R
  U --> R
  R --> A
  A --> DB
  A --> G
  A --> AT
  R --> MP
```

## Core money flow

```mermaid
sequenceDiagram
  participant W as Wholesaler
  participant API as Mizani API
  participant Gemma as Gemma
  participant DB as SQLite
  participant AT as Africa's Talking

  W->>API: POST /upload-document
  API->>Gemma: Extract fields from photo
  Gemma-->>API: Structured JSON
  API->>DB: Save document + transactions
  W->>API: POST /reconcile
  API->>DB: Match / flag mismatches
  W->>API: GET /drafts/{tx}
  API-->>W: Payment or reminder draft
  W->>API: POST /drafts/{id}/approve
  API->>AT: Send SMS
```

## Stock trail

```mermaid
flowchart TD
  I[Invoice / sale] --> D[POST /dispatch]
  D --> P[Pending delivery]
  P --> U[Retailer confirms on USSD]
  U --> M{Qty matches?}
  M -->|Yes| OK[Matched]
  M -->|No| DIS[Discrepancy]
```

## Quick start

```bash
# Backend
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # add GEMMA_API_KEY, AT_API_KEY
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

```bash
# Mobile
cd mobile
npm install
# set EXPO_PUBLIC_API_URL in mobile/.env
npx expo start
```

```bash
# Tests
pytest
```

API docs: [http://localhost:8000/docs](http://localhost:8000/docs) · Health: `GET /health`

## API map

```mermaid
mindmap
  root((Mizani))
    Documents
      POST /upload-document
      POST /reconcile
    Drafts
      GET /drafts/{tx}
      POST /drafts/{id}/approve
    Channels
      POST /ussd
      GET /digest
    Stock
      POST /dispatch
      GET /deliveries/{tx}
    M-PESA
      POST /mpesa/connect
      POST /mpesa/sync
      GET /mpesa/status
    Analytics
      GET /analytics/overview
      GET /analytics/counterparties
      GET /analytics/inbox
      GET /analytics/goods
```

## Project layout

```
agents/          # Ingestion, reconcile, payables, stock, digest, M-PESA, analytics
channels/        # Africa's Talking SMS / USSD client
db/              # Schema, migrations, SQLite helpers
routes/          # FastAPI endpoints
mobile/          # Expo (React Native) client
sample_data/     # Fixtures + seed scripts
tests/           # pytest
```

## Stack

**FastAPI · SQLite · Gemma/Gemini · Africa's Talking · M-PESA sandbox · Expo**
