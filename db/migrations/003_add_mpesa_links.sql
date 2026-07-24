-- Demo M-PESA link state for the wholesaler React Native app (sandbox / fixture sync).

CREATE TABLE IF NOT EXISTS mpesa_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    linked INTEGER NOT NULL DEFAULT 1,
    last_synced_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
