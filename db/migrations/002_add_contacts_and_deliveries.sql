-- Step 5 & 6 tables. Append-only migration — do not alter existing Step 1–4 tables.

-- Maps a counterparty name to a phone number, so SMS/USSD know who to reach
CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    counterparty_name TEXT NOT NULL UNIQUE,
    phone_number TEXT NOT NULL,       -- E.164 format, e.g. +2547XXXXXXXX
    role TEXT NOT NULL                -- 'retailer' | 'supplier' | 'driver'
);

-- Tracks in-progress USSD sessions (Africa's Talking is stateless per request)
CREATE TABLE IF NOT EXISTS ussd_sessions (
    session_id TEXT PRIMARY KEY,
    phone_number TEXT NOT NULL,
    current_menu TEXT NOT NULL,       -- e.g. 'main' | 'check_balance' | 'confirm_receipt'
    context_json TEXT,                -- any data needed across menu steps
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Stock Trail: dispatch → checkpoint → receipt → three-way match
CREATE TABLE IF NOT EXISTS deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id),
    dispatched_quantity INTEGER,
    dispatch_photo_path TEXT,
    dispatch_confirmed_at TEXT,
    driver_status TEXT,                  -- free-text checkpoint update via USSD
    receipt_confirmed_quantity INTEGER,
    receipt_confirmed_at TEXT,
    match_status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'matched' | 'discrepancy'
    discrepancy_notes TEXT
);
