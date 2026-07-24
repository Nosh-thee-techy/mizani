import { Platform } from 'react-native';


const BASE =
  (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');

export const MIZIZI_VOICE_URL =
  `${BASE.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')}/voice/live`;

/** Optional ngrok browser warning bypass header for free tunnels. */
const DEFAULT_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': '1',
};

/**
 * Low-level JSON fetch against the Ledger Chain API.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...DEFAULT_HEADERS,
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      // keep statusText
    }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return response.json() as Promise<T>;
}

export type OverviewResponse = {
  metrics: {
    period_days: number;
    total_owed_to_wholesaler: number;
    total_owed_by_wholesaler: number;
    period_money_in: number;
    period_money_out: number;
    open_mismatches: number;
    pending_drafts: number;
    delivery_discrepancies: number;
    pending_deliveries: number;
    top_buyers: { name: string; tx_count: number; total_amount: number }[];
  };
  narrative: string;
  generated_at: string;
};

export type Counterparty = {
  name: string;
  role: string;
  sold_to: number;
  bought_from: number;
  tx_count: number;
  open_mismatches: number;
  last_activity: string | null;
};

export type DeliveryRow = {
  delivery_id: number;
  transaction_id: number;
  dispatched_quantity: number | null;
  receipt_confirmed_quantity: number | null;
  match_status: string;
  discrepancy_notes: string | null;
  driver_status: string | null;
  counterparty_name: string;
  amount: number;
  transaction_date: string;
};

export type InboxResponse = {
  mismatches: {
    id: number;
    counterparty_name: string;
    amount: number;
    transaction_date: string;
    direction: string;
    status: string;
    notes: string | null;
  }[];
  pending_drafts: {
    id: number;
    transaction_id: number;
    draft_type: string;
    message_text: string;
    approved: number;
    counterparty_name: string;
    amount: number;
  }[];
};

export const api = {
  baseUrl: BASE,

  health: () => request<{ status: string }>('/health'),

  overview: (days = 7) => request<OverviewResponse>(`/analytics/overview?days=${days}`),

  counterparties: (days = 7) =>
    request<{ counterparties: Counterparty[]; period_days: number }>(
      `/analytics/counterparties?days=${days}`,
    ),

  counterpartyTxs: (name: string) =>
    request<{ name: string; transactions: Record<string, unknown>[] }>(
      `/analytics/counterparties/${encodeURIComponent(name)}/transactions`,
    ),

  inbox: () => request<InboxResponse>('/analytics/inbox'),

  goods: () => request<{ deliveries: DeliveryRow[] }>('/analytics/goods'),

  mpesaStatus: () =>
    request<{ linked: boolean; link: Record<string, unknown> | null }>('/mpesa/status'),

  mpesaConnect: (display_name: string, phone_number: string) =>
    request<{ linked: boolean; link: Record<string, unknown> }>('/mpesa/connect', {
      method: 'POST',
      body: JSON.stringify({ display_name, phone_number }),
    }),

  mpesaSync: (force = false) =>
    request<{
      inserted: number;
      skipped: number;
      transaction_ids: number[];
      link: Record<string, unknown>;
    }>('/mpesa/sync', {
      method: 'POST',
      body: JSON.stringify({ force }),
    }),

  reconcile: (transaction_id: number) =>
    request<Record<string, unknown>>('/reconcile', {
      method: 'POST',
      body: JSON.stringify({ transaction_id }),
    }),

  approveDraft: (draft_id: number) =>
    request<{ draft: Record<string, unknown>; sms_sent?: boolean }>(
      `/drafts/${draft_id}/approve`,
      { method: 'POST' },
    ),

  /**
   * Upload a document photo/PDF to POST /upload-document.
   */
  uploadDocument: async (uri: string, sourceType: string, fileName = 'upload.jpg') => {
    const form = new FormData();
    form.append('source_type', sourceType);
    
    if (Platform.OS === 'web') {
      const res = await fetch(uri);
      const blob = await res.blob();
      form.append('file', blob, fileName);
    } else {
      form.append('file', {
        uri,
        name: fileName,
        type: fileName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
      } as unknown as Blob);
    }

    const response = await fetch(`${BASE}/upload-document`, {
      method: 'POST',
      headers: { 'ngrok-skip-browser-warning': '1' },
      body: form,
    });
    if (!response.ok) {
      const text = await response.text();
      let detail = text || response.statusText;
      try {
        const parsed = JSON.parse(text) as { detail?: unknown };
        if (typeof parsed.detail === 'string') detail = parsed.detail;
      } catch {
        /* keep raw text */
      }
      throw new Error(detail);
    }
    return response.json();
  },

  /**
   * Upload a dispatch photo for Stock Trail.
   */
  dispatch: async (
    transactionId: number,
    uri: string,
    invoiceQuantity?: number,
    fileName = 'dispatch.jpg',
  ) => {
    const form = new FormData();
    form.append('transaction_id', String(transactionId));
    if (invoiceQuantity != null) {
      form.append('invoice_quantity', String(invoiceQuantity));
    }
    
    if (Platform.OS === 'web') {
      const res = await fetch(uri);
      const blob = await res.blob();
      form.append('file', blob, fileName);
    } else {
      form.append('file', {
        uri,
        name: fileName,
        type: 'image/jpeg',
      } as unknown as Blob);
    }

    const response = await fetch(`${BASE}/dispatch`, {
      method: 'POST',
      headers: { 'ngrok-skip-warning': '1' },
      body: form,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || response.statusText);
    }
    return response.json();
  },

  /** Ask business assistant chatbot */
  chat: (message: string, history: { role: string; content: string }[] = []) =>
    request<{ reply: string; suggestions: string[] }>('/chat/query', {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    }),

  /** Get uploaded document history */
  documents: () =>
    request<{
      documents: {
        id: number;
        source_type: string;
        image_path: string;
        uploaded_at: string;
        extracted: Record<string, any>;
      }[];
    }>('/documents'),

  /** Mizizi OS WhatsApp simulation */
  miziziOsChat: (message: string) =>
    request<{
      reply: string;
      intent: string;
      card: string;
      data: Record<string, any>;
      suggestions: string[];
      channel: string;
    }>('/mizizi-os/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  cashCrisis: () => request<CashCrisisResponse>('/mizizi-os/cash-crisis'),

  trustScores: (limit = 10) =>
    request<TrustScoresResponse>(`/mizizi-os/trust-scores?limit=${limit}`),

  creditCheck: (name: string, amount = 0) =>
    request<CreditCheckResponse>(
      `/mizizi-os/credit-check?name=${encodeURIComponent(name)}&amount=${amount}`,
    ),

  financingPack: () => request<FinancingPackResponse>('/mizizi-os/financing-pack'),
};

export type CashCrisisResponse = {
  currency: string;
  severity: 'critical' | 'warning' | 'watch' | 'calm' | string;
  headline: string;
  runway_hint: string;
  open_receivables: number;
  overdue_14_plus: number;
  overdue_30_plus: number;
  open_payables: number;
  net_receivable_pressure: number;
  aging_buckets: Record<string, number>;
  top_debtors: {
    name: string;
    open_amount: number;
    oldest_days: number;
    invoice_count: number;
  }[];
  recommended_actions: { type: string; target: string; detail: string }[];
  as_of: string;
};

export type TrustScoresResponse = {
  currency: string;
  credit_hold_days: number;
  buyers: {
    name: string;
    trust_score: number;
    band: string;
    open_amount: number;
    oldest_days_overdue: number;
    match_rate: number;
    mismatches: number;
    delivery_gaps: number;
    tx_count: number;
    credit_hold: boolean;
  }[];
  as_of: string;
};

export type CreditCheckResponse = {
  currency: string;
  buyer: string;
  allowed: boolean;
  soft_block: boolean;
  reason: string;
  trust_score: number | null;
  band?: string;
  open_amount?: number;
  oldest_days_overdue?: number;
  proposed_amount: number;
  rule?: string;
};

export type FinancingPackResponse = {
  currency: string;
  title: string;
  readiness_score: number;
  summary: {
    documented_invoices: number;
    matched_receivables: number;
    open_receivables: number;
    eligible_collateral_estimate: number;
    overdue_30_plus: number;
    high_risk_buyers: number;
  };
  top_debtors: { name: string; open_amount: number; oldest_days: number }[];
  trusted_buyers: { name: string; trust_score: number; band: string }[];
  lender_notes: string[];
  as_of: string;
};

/**
 * Format KES amounts for UI display.
 */
export function kes(amount: number): string {
  return `KES ${amount.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}
