// backend/server.js
import 'dotenv/config'                   // ✅ load env first

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import { query } from './db.js'

const app = express()
const PORT = process.env.PORT || 8000
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'
const PY_SERVICE_URL = process.env.PY_SERVICE_URL || 'http://localhost:8001'

app.use(helmet())
app.use(cors())
app.use(express.json())
app.use(morgan('dev'))

// tighter default rate limit (per IP)
const limiter = rateLimit({ windowMs: 60 * 1000, max: 60 })
app.use(limiter)

/* ---------- DB helpers ---------- */
async function upsertUser(sub){
  const email = `${sub}@demo.local`
  const name = 'Demo User'
  const res = await query(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, 'hash_demo', $2)
     ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name
     RETURNING id`,
    [email, name]
  )
  return res.rows[0].id
}

async function ensureSession(userId, sessionToken){
  if(!sessionToken) return null
  const found = await query(`SELECT id FROM chat_sessions WHERE session_token=$1`, [sessionToken])
  if(found.rowCount > 0) return found.rows[0].id
  const ins = await query(
    `INSERT INTO chat_sessions (user_id, session_token) VALUES ($1, $2) RETURNING id`,
    [userId, sessionToken]
  )
  return ins.rows[0].id
}

async function logMessage({ userId, sessionToken, role, content, meta={} }){
  await query(
    `INSERT INTO chat_messages (user_id, session_token, role, content, meta)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, sessionToken, role, content, meta]
  )
}

/* ---------- Health ---------- */
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'backend' }))

app.get('/health/python', async (_req, res) => {
  try {
    const r = await fetch(`${PY_SERVICE_URL}/health`)
    const data = await r.json()
    return res.json({ status: data.status || 'unknown' })
  } catch (e){
    return res.status(503).json({ status: 'down' })
  }
})

/* ---------- Token ---------- */
app.post('/api/chatbot/token', async (_req, res) => {
  const payload = { sub: 'user_1', role: 'user' }
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '5m' })
  try { await upsertUser(payload.sub) } catch (e){ console.warn('Upsert user failed:', e?.message) }
  res.json({ token, expires_in: 300 })
})

/* ---------- Auth ---------- */
function auth(req, res, next){
  const hdr = req.headers['authorization'] || ''
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null
  if(!token) return res.status(401).json({ error: 'missing token'})
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (e){
    return res.status(401).json({ error: 'invalid token'})
  }
}

/* ---------- Chat message ---------- */
app.post('/api/chatbot/message', auth, async (req, res) => {
  try {
    const { message, session_id } = req.body || {}
    if (!message) return res.status(400).json({ error: 'missing message' })

    const userId = await upsertUser(req.user?.sub || 'user_1')
    await ensureSession(userId, session_id)

    // log user input
    await logMessage({ userId, sessionToken: session_id, role: 'user', content: message })

    const r = await fetch(`${PY_SERVICE_URL}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, user_id: req.user?.sub || 'user_1', session_id })
    })
    const data = await r.json()

    // log assistant output
    await logMessage({
      userId,
      sessionToken: session_id,
      role: 'assistant',
      content: data?.reply || data?.data?.reply || '',
      meta: data?.appointment_candidate || data?.data?.appointment_candidate
        ? {
            appointment_candidate: data?.appointment_candidate || data?.data?.appointment_candidate,
            intent: data?.intent || data?.data?.intent,
            needs_confirmation: data?.needs_confirmation ?? data?.data?.needs_confirmation ?? false
          }
        : { intent: data?.intent || data?.data?.intent || 'chat' }
    })

    return res.json({ ok: true, data })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'failed to reach python service' })
  }
})

/* ---------- Confirm (DB persist) ---------- */
app.post('/api/chatbot/confirm', auth, async (req, res) => {
  try {
    const { session_id, scheduled_at, confirm } = req.body || {}
    if (!session_id || !scheduled_at) {
      return res.status(400).json({ ok: false, error: 'bad_request', message: 'missing session_id or scheduled_at' })
    }

    // Validate scheduled_at
    const ts = Date.parse(scheduled_at)
    if (Number.isNaN(ts)) {
      return res.status(400).json({ ok: false, error: 'bad_request', message: 'scheduled_at must be ISO8601' })
    }

    const userId = await upsertUser(req.user?.sub || 'user_1')
    await ensureSession(userId, session_id)

    // If user declined, just acknowledge
    if (!confirm) {
      return res.json({ ok: true, status: 'declined' })
    }

    // 🔒 Conflict check (prevent double-booking)
    const conflict = await query(
      `SELECT 1 FROM appointments
       WHERE scheduled_at = $1 AND status = 'confirmed'
       LIMIT 1`,
      [scheduled_at]
    )
    if (conflict.rowCount > 0) {
      return res.status(409).json({
        ok: false,
        error: 'conflict',
        message: 'That time is already booked. Please pick another slot.'
      })
    }

    // Insert appointment
    const ins = await query(
      `INSERT INTO appointments (user_id, scheduled_at, status, notes)
       VALUES ($1, $2, 'confirmed', 'Booked via chatbot')
       RETURNING id, scheduled_at, status, created_at`,
      [userId, scheduled_at]
    )

    // Optional: log confirmation to chat history
    try {
      await logMessage({
        userId,
        sessionToken: session_id,
        role: 'assistant',
        content: `Confirmed your appointment for ${scheduled_at}.`,
        meta: { appointment_id: ins.rows[0].id, status: 'confirmed' }
      })
    } catch {}

    return res.json({ ok: true, status: 'confirmed', appointment: ins.rows[0] })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ ok: false, error: 'server_error', message: 'failed to confirm appointment' })
  }
})

/* ---------- History for a session (single definition) ---------- */
app.get('/api/chat_sessions/:session_id/messages', auth, async (req, res) => {
  try {
    const sessionId = req.params.session_id
    const userId = await upsertUser(req.user?.sub || 'user_1')
    const result = await query(
      `SELECT role, content, meta, created_at
       FROM chat_messages
       WHERE user_id = $1 AND session_token = $2
       ORDER BY created_at ASC`,
      [userId, sessionId]
    )
    res.json({ ok: true, messages: result.rows })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: 'failed_to_fetch_messages' })
  }
})

/* ---------- Delete all messages for a session ---------- */
app.delete('/api/chat_sessions/:session_id/messages', auth, async (req, res) => {
  try {
    const sessionId = req.params.session_id
    const userId = await upsertUser(req.user?.sub || 'user_1')
    await query(
      `DELETE FROM chat_messages WHERE user_id = $1 AND session_token = $2`,
      [userId, sessionId]
    )
    res.json({ ok: true, deleted: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: 'failed_to_delete_messages' })
  }
})

/* ---------- Error ---------- */
app.use((err, _req, res, _next) => {
  console.error('Unexpected error:', err)
  res.status(500).json({ error: 'server error' })
})

app.listen(PORT, () => console.log(`Backend listening on http://localhost:${PORT}`))
