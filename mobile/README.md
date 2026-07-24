# Mizani — Wholesaler (Expo)

React Native app for wholesalers. Talks to the FastAPI backend in the parent folder. Retailers stay on USSD/SMS.

## Setup

1. Start the API (from repo root):

```powershell
.\.venv\Scripts\uvicorn main:app --host 0.0.0.0 --port 8000
```

2. Point the app at that API in `mobile/.env`:

```env
EXPO_PUBLIC_API_URL=https://YOUR_NGROK_HOST.ngrok-free.dev
```

Use the same ngrok host as the USSD callback (no `/ussd` path). For iOS Simulator you can use `http://localhost:8000`; Android emulator often needs `http://10.0.2.2:8000`.

3. Seed demo data (recommended):

```powershell
cd ..
.\.venv\Scripts\python sample_data\seed_demo_for_app.py
```

4. Run the app:

```powershell
cd mobile
npm start
```

Then press `a` (Android), `i` (iOS), or scan the QR with Expo Go.

## Tabs

| Tab | Purpose |
|---|---|
| **Pulse** | Gemma business narrative + money in/out + open flags |
| **Money** | Connect M-PESA (sandbox sync) + photo/file upload |
| **People** | Buyers & suppliers ranked by volume |
| **Goods** | Stock Trail deliveries + dispatch camera |
| **Inbox** | Mismatches + approve drafts (SMS on reminder approve) |
