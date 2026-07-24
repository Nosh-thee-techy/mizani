-- Mizani schema (Steps 1–4). Column names are fixed for later USSD/Stock Trail work.

-- One row per photographed document, regardless of type
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL,       -- 'invoice' | 'delivery_note' | 'bank_statement'
    image_path TEXT NOT NULL,
    raw_extracted_json TEXT NOT NULL, -- full Gemma 4 output, for audit/debug
    uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Normalized transactions parsed out of documents
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id),
    counterparty_name TEXT NOT NULL,
    amount REAL NOT NULL,
    transaction_date TEXT NOT NULL,
    direction TEXT NOT NULL,          -- 'payable' | 'receivable'
    status TEXT NOT NULL DEFAULT 'unreconciled', -- 'unreconciled' | 'matched' | 'mismatched'
    notes TEXT
);

-- Output of the reconciliation agent — links related transactions
CREATE TABLE IF NOT EXISTS reconciliations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_a_id INTEGER NOT NULL REFERENCES transactions(id),
    transaction_b_id INTEGER REFERENCES transactions(id), -- NULL if no match found
    match_confidence REAL,
    discrepancy_notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Drafted messages awaiting the wholesaler's approval
CREATE TABLE IF NOT EXISTS drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id),
    draft_type TEXT NOT NULL,         -- 'payment' | 'reminder'
    message_text TEXT NOT NULL,
    approved INTEGER NOT NULL DEFAULT 0, -- 0 = pending, 1 = approved
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
