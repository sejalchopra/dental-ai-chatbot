# 🦷 Dental AI Chatbot — Full Stack Take-Home

This project implements an **AI-powered dental clinic assistant** that lets users book appointments through a chatbot interface.  
It consists of a **FastAPI Python microservice** for natural language understanding and a **Node.js/Express backend** with Postgres for persistence.

---

## 📁 Project Structure

```
dental-ai-chatbot/
├── backend/               # Node.js + Express server (API, DB persistence)
│   ├── server.js
│   ├── db.js
│   └── .env
├── python_service/        # FastAPI microservice (LLM or naive date parser)
│   ├── main.py
│   └── .env
├── docker-compose.yml     # Spins up Postgres & Adminer
└── README.md              # This file
```

---

## 🧰 Prerequisites

- **macOS / Linux** (tested)
- [Node.js](https://nodejs.org/) ≥ 18  
- [Python](https://www.python.org/) 3.11 (⚠️ not 3.13, due to `pydantic-core` build issues)
- [Docker](https://docs.docker.com/get-docker/)
- [npm](https://docs.npmjs.com/)
- An [OpenAI API Key](https://platform.openai.com/account/api-keys) if you want LLM mode

---

## 🐘 Step 1: Start Postgres + Adminer

```bash
docker-compose up -d
docker ps
```

You should see:
- `postgres_db` (or `dental_db`) running on **localhost:5432**
- `dental_adminer` running on **localhost:8080**

Adminer UI: [http://localhost:8080](http://localhost:8080)

---

## 🐍 Step 2: Python Service (FastAPI)

```bash
cd python_service
python3.11 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

Create `.env`:

```env
OPENAI_API_KEY=sk-...
USE_LLM=true
OPENAI_MODEL=gpt-4o-mini
```

Run the service:

```bash
uvicorn main:app --reload --port 8001
```

Health check:

```bash
curl http://localhost:8001/health
# {"status":"ok","service":"python_service","use_llm":true}
```

---

## 🌐 Step 3: Backend (Node.js)

```bash
cd backend
cp .env.example .env
npm install
```

Update `.env`:

```env
PORT=8000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
JWT_SECRET=dev_secret
PY_SERVICE_URL=http://localhost:8001
```

Run the backend:

```bash
npm run dev
```

Health checks:
- [http://localhost:8000/health](http://localhost:8000/health)
- [http://localhost:8000/health/python](http://localhost:8000/health/python)

---

## 📝 Step 4: Database Schema

```sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMP NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_appointments_time
ON appointments (scheduled_at) WHERE status = 'confirmed';
```

---

## 💬 How It Works

1. Frontend (or Postman) requests a JWT via `/api/chatbot/token`
2. Uses the token to post messages to `/api/chatbot/message`
3. Backend logs the message & forwards it to the Python service
4. Python either:
   - Uses GPT-4o-mini to extract reply + appointment time, OR
   - Falls back to regex parser if no key
5. On confirmation, appointment is persisted to DB

---

## 🧹 Extras

### Delete Session History
```bash
DELETE /api/chat_sessions/:session_id/messages
```

### Get Session History
```bash
GET /api/chat_sessions/:session_id/messages
```

---

## 🧪 Quick Test

```bash
# 1. Get a token
TOKEN=$(curl -s -X POST http://localhost:8000/api/chatbot/token | jq -r .token)

# 2. Start a new chat
SESSION_ID=$(uuidgen)
curl -s -X POST http://localhost:8000/api/chatbot/message \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"I want an appointment next Monday at 10am\", \"session_id\": \"$SESSION_ID\"}" | jq
```

---

## ✅ Summary

- ✅ Postgres via Docker  
- ✅ Python FastAPI service with LLM or fallback parser  
- ✅ Node backend for auth, persistence, confirmation  
- ✅ Appointment persistence + session history

---

## 🧠 Tips

- Use **Python 3.11**
- Downgrade `httpx` to `0.27.0` if you see `proxies` error
- Ensure `.env` is loaded in venv
- Restart Node after editing env vars

---

=
