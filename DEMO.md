# Mizani — three-minute judge demo

## Before judges arrive

- Start Ollama with the local Gemma model.
- Start FastAPI, Expo, ngrok, and the Africa's Talking simulator.
- Run `python sample_data/seed_demo_for_app.py`.
- Keep one matching invoice/payment pair ready for reconciliation.
- Keep the seeded Kamau Hardware delivery pending at 48 dispatched vs 50 invoiced.
- Use the simulator phone mapped to Kamau Hardware.

## 0:00–0:30 — The business pulse

**Human (wholesaler):** Open the Expo app on **Pulse**.

**System:** Gemma summarizes money in, money out, key buyers, mismatches, and
delivery risk from the shared ledger.

**Say:** “Mizani is not another dashboard. It reads the wholesaler's economic
life from documents, M-PESA activity, and physical deliveries.”

## 0:30–1:00 — Money enters automatically

**Human:** Open **Money**, tap **Connect M-PESA**, then **Sync statement**.

**System:** Fixture transactions enter the same ledger used by document photos,
reconciliation, analytics, and USSD.

**Say:** “This demo uses a sandbox statement; the production connector replaces
the fixture without changing the ledger or agent flow.”

## 1:00–1:35 — Reconciliation creates the next action

**Human:** Open **Inbox** and tap **Run reconcile** on the prepared transaction.

**System:** Gemma selects the counterpart; deterministic checks enforce amount
and date tolerances. If matched, the same request automatically creates a
pending payment/reminder draft in Inbox.

**Human:** Tap **Approve & SMS** once.

**System:** Approval flips the draft state and automatically sends the retailer
alert through Africa's Talking.

**Pause and say:** “The wholesaler made one decision. Draft generation and
delivery happened from the reconciliation workflow—there was no second admin
process.”

## 1:35–2:35 — Stock Trail and the three-way match

**Human (wholesaler):** Open **Goods** and show the delivery: invoice quantity
50, dispatch photo count 48, receipt still pending.

**Narrate the time jump:** “Normally the retailer confirms hours later. We are
fast-forwarding that event.”

**Human (retailer):** Dial the USSD channel, choose **Confirm delivery received**,
and enter `45`.

**System:** The saved receipt event triggers the match automatically:

1. invoice/order quantity: 50;
2. Gemma dispatch-photo estimate: 48;
3. retailer USSD confirmation: 45.

The deterministic guardrail marks a discrepancy, writes the exact differences,
and surfaces it in the same action inbox as a payment mismatch.

**Pause here. Say:** “Gemma converts the unstructured photo into a quantity.
Mizani then cross-checks three independent signals. We keep the final status
deterministic so an AI explanation can never hide a stock shortfall.”

## 2:35–3:00 — Close the loop

**Human:** Refresh **Goods** or **Pulse** to show the discrepancy and updated
business narrative.

**Say:** “Only the wholesaler took photos and approved an action; only the
retailer used a simple menu. Everything else happened automatically in one
ledger.”

## Hosting (production)

Repo: https://github.com/Nosh-thee-techy/mizani

### 1) API on Render (Docker)

1. Open https://dashboard.render.com/select-repo?type=blueprint
2. Connect `Nosh-thee-techy/mizani` and apply `render.yaml`
3. Set secrets: `GEMMA_API_KEY`, `AT_API_KEY`
4. Health check: `https://YOUR-SERVICE.onrender.com/health`

### 2) Expo web on Vercel

1. Import the same GitHub repo at https://vercel.com/new
2. Framework: Other (uses root `vercel.json`)
3. Env: `EXPO_PUBLIC_API_URL=https://YOUR-SERVICE.onrender.com`
4. Deploy — build runs `cd mobile && npm install && npm run build`

## Contingencies

- **Local Gemma is slow:** use the already-seeded Pulse narrative and continue
  with reconciliation/USSD; do not wait silently.
- **SMS simulator fails:** show `sms_sent: false` / the approved draft and explain
  the sandbox transport failure; the ledger action remains committed.
- **Camera recognition is uncertain:** use a prepared dispatch photo and state
  the confidence score.
- **USSD callback is unavailable:** POST the same callback form to `/ussd`, then
  refresh Goods. Explain that the payload is identical to Africa's Talking.

