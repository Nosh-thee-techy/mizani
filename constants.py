"""Shared constants and enums for Mizani — avoids magic strings in agents/routes."""

from enum import Enum


class SourceType(str, Enum):
    """Document source types accepted by the ingestion agent."""

    INVOICE = "invoice"
    DELIVERY_NOTE = "delivery_note"
    BANK_STATEMENT = "bank_statement"


class Direction(str, Enum):
    """Whether money is owed by or owed to the wholesaler."""

    PAYABLE = "payable"
    RECEIVABLE = "receivable"


class TransactionStatus(str, Enum):
    """Reconciliation lifecycle for a ledger transaction."""

    UNRECONCILED = "unreconciled"
    MATCHED = "matched"
    MISMATCHED = "mismatched"


class DraftType(str, Enum):
    """Kinds of draft messages the payables agent can produce."""

    PAYMENT = "payment"
    REMINDER = "reminder"


class ContactRole(str, Enum):
    """Roles for contacts reachable via SMS/USSD."""

    RETAILER = "retailer"
    SUPPLIER = "supplier"
    DRIVER = "driver"


class UssdMenu(str, Enum):
    """Persisted USSD menu steps between Africa's Talking callbacks."""

    MAIN = "main"
    CHECK_BALANCE = "check_balance"
    CONFIRM_RECEIPT = "confirm_receipt"
    CONFIRM_RECEIPT_SELECT = "confirm_receipt_select"
    CONFIRM_RECEIPT_QTY = "confirm_receipt_qty"


class DeliveryMatchStatus(str, Enum):
    """Three-way stock match lifecycle for a delivery."""

    PENDING = "pending"
    MATCHED = "matched"
    DISCREPANCY = "discrepancy"


# Table names — keep in sync with db/schema.sql and migrations
TABLE_DOCUMENTS = "documents"
TABLE_TRANSACTIONS = "transactions"
TABLE_RECONCILIATIONS = "reconciliations"
TABLE_DRAFTS = "drafts"
TABLE_CONTACTS = "contacts"
TABLE_USSD_SESSIONS = "ussd_sessions"
TABLE_DELIVERIES = "deliveries"
TABLE_MPESA_LINKS = "mpesa_links"

# M-PESA link flags (SQLite integers)
MPESA_UNLINKED = 0
MPESA_LINKED = 1

# Ingestion: below this confidence, do not insert into transactions
MIN_EXTRACTION_CONFIDENCE = 0.5

# Reconciliation matching thresholds (used as guidance for the model + post-checks)
AMOUNT_TOLERANCE_PERCENT = 1.0
DATE_WINDOW_DAYS = 14

# Stock Trail: allow small count differences before flagging a discrepancy
QUANTITY_TOLERANCE_UNITS = 0

# Draft approval flags stored as integers in SQLite
DRAFT_PENDING = 0
DRAFT_APPROVED = 1

# Default digest lookback window
DEFAULT_DIGEST_DAYS = 7
