
# Dental AI Chatbot – Step 1 (Scaffold + Minimal Working Servers)

This is **Step 1** of the take-home: a minimal but **working** scaffold for a full‑stack chatbot system.

It includes:
- **frontend/** (React + Vite) – minimal UI with health checks and basic token request
- **backend/** (Node.js + Express) – `/health`, `/api/chatbot/token`, `/api/chatbot/message` (stub proxy)
- **python_service/** (FastAPI) – `/health`, `/simulate` (stub LangChain-like response)
- **database/schema.sql** – initial tables + sample inserts + indexes

> In Step 2+, we’ll flesh out the full chat flow, authentication/session handling, LangChain logic, and appointment scheduling.

---

## Quick Start (Local Dev)

### 0) Prereqs
- Node 18+
- Python 3.9+
- (Optional) PostgreSQL 14+ if you want to load the schema now

### 1) Start Python microservice
```bash
cd python_service
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```
- Health check: http://localhost:8001/health
- Simulate endpoint (POST JSON): http://localhost:8001/simulate

### 2) Start backend
Open a new terminal:
```bash
cd backend
npm install
npm run dev
```
- Health check: http://localhost:8000/health

### 3) Start frontend
Open a new terminal:
```bash
cd frontend
npm install
npm run dev
```
Visit: http://localhost:5173

> The frontend calls the backend at `http://localhost:8000` and the backend calls the Python service at `http://localhost:8001` by default.

---

## Env Vars (Optional for Step 1)
- Backend:
  - `JWT_SECRET` (default: `dev_secret`)
  - `PY_SERVICE_URL` (default: `http://localhost:8001`)
- Python service:
  - `USE_STUB=1` to use the built-in stub (default). Future steps can support real LLM APIs.

---

## What Works Now
- Minimal **/simulate** echoes back a reply and detects a naive date/time.
- Backend issues a short-lived JWT and forwards chat messages to the Python microservice.
- Frontend performs health checks, gets a token, and sends a sample message.

## Next Steps (Step 2)
- Build full chatbot UI/UX with message history and session handling.
- Implement LangChain graph/chain with appointment scheduling logic.
- Connect to PostgreSQL (save users/appointments/chat sessions).
- Add logging, rate limiting, and tests.

