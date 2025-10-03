
# Dental AI Chatbot – Step 3 (PostgreSQL + Persistence)

This bundle includes Steps 1–2 plus **Step 3**:
- Dockerized **PostgreSQL** (with Adminer UI), auto-initialized from `database/schema.sql`
- Backend persists:
  - **Users** (upsert by JWT `sub` → email like `sub@demo.local`)
  - **Chat sessions** (by `session_id` from frontend)
  - **Appointments** (confirmed bookings saved to DB)
- New endpoint: `GET /api/appointments` to list recent appointments for the current user

## Prereqs
- Docker Desktop installed and running
- Node 18+ (with npm)
- Python 3.11 (recommended)

## 0) Start PostgreSQL via Docker
From the repo root:
```bash
docker compose up -d
# or: docker-compose up -d
```

- DB runs on `localhost:5432`
- Adminer UI at http://localhost:8080 (server: `db` or `localhost`, user: `postgres`, pass: `postgres`, db: `dental`)

## 1) Python service
```bash
cd python_service
python3.11 -m venv .venv && source .venv/bin/activate
python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```
Health: http://localhost:8001/health

## 2) Backend (configure DB)
```bash
cd backend
cp .env.example .env
# Ensure DATABASE_URL is set (already set in .env.example)
npm install
npm run dev
```
Health: http://localhost:8000/health

**Endpoints**
- `POST /api/chatbot/token` → returns short-lived JWT
- `POST /api/chatbot/message` → forwards to Python, **ensures user + session in DB**
- `POST /api/chatbot/confirm` → saves a **confirmed appointment** to DB
- `GET  /api/appointments` → lists up to 20 recent appointments (for current JWT user)

## 3) Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```
Visit: http://localhost:5173

## Verify Persistence
1. Chat → get a proposal → Confirm.
2. Call: `GET http://localhost:8000/api/appointments` (with Authorization: Bearer <token>)  
   You should see your confirmed appointment record(s) from Postgres.

---

### Notes
- DB is initialized automatically on the first `docker compose up -d` using `database/schema.sql`.
- To reset DB: `docker compose down -v` (removes volume), then `docker compose up -d`.
- In a real system, you'd add migrations, proper auth, and a real LLM via LangChain in the Python service.
