import { useEffect, useMemo, useRef, useState } from "react"

// Read API base from .env
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000"

// Generate or load a persistent session id
function useSessionId() {
  const [sid, setSid] = useState(() => {
    const existing = localStorage.getItem("session_id")
    if (existing) return existing
    const fresh = crypto.randomUUID()
    localStorage.setItem("session_id", fresh)
    return fresh
  })
  return [sid, setSid]
}

export default function App() {
  const [sessionId] = useSessionId()
  const [token, setToken] = useState("")
  const [messages, setMessages] = useState([]) // {role, content, meta?}
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [useLLM, setUseLLM] = useState(true) // optional toggle
  const scrollerRef = useRef(null)

  // Auto-scroll chat to latest
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  // 1) Get a token on first load
  useEffect(() => {
    async function getToken() {
      const r = await fetch(`${API_BASE}/api/chatbot/token`, { method: "POST" })
      const j = await r.json()
      setToken(j.token)
    }
    getToken()
  }, [])

  // 2) Fetch server-side history when we have token + sessionId
  useEffect(() => {
    if (!token || !sessionId) return
    async function loadHistory() {
      try {
        const r = await fetch(`${API_BASE}/api/chat_sessions/${sessionId}/messages`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!r.ok) {
          console.warn("History fetch failed:", r.status)
          return
        }
        const j = await r.json()
        const hist = (j.messages || []).map((m) => ({
          role: m.role,
          content: m.content,
          meta: m.meta || null,
          created_at: m.created_at
        }))
        setMessages(hist)
      } catch (e) {
        console.error("History fetch error:", e)
      }
    }
    loadHistory()
  }, [token, sessionId])

  // 3) Send a message
  async function sendMessage() {
    const text = input.trim()
    if (!text || !token) return
    setInput("")

    // optimistic append
    setMessages((prev) => [...prev, { role: "user", content: text }])

    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/chatbot/message?use_llm=${useLLM ? "1" : "0"}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ message: text, session_id: sessionId })
      })
      const j = await r.json()
      if (!r.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong." }])
        return
      }

      const data = j.data || {}
      const reply = data.reply || "…"
      setMessages((prev) => [...prev, { role: "assistant", content: reply, meta: data }])
    } catch (e) {
      console.error(e)
      setMessages((prev) => [...prev, { role: "assistant", content: "Network error." }])
    } finally {
      setLoading(false)
    }
  }

  // 4) Confirm an appointment candidate
  async function confirmAppointment() {
    if (!token) return
    // Find last assistant message that includes an appointment_candidate
    const last = [...messages].reverse().find((m) => m.role === "assistant" && m.meta?.appointment_candidate)
    if (!last) return alert("No proposed appointment to confirm.")
    const scheduled_at = last.meta.appointment_candidate

    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/chatbot/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ session_id: sessionId, scheduled_at, confirm: true })
      })
      const j = await r.json()

      if (r.status === 409) {
        // Conflict (already booked)
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: j.message || "That time is already booked. Please pick another slot." }
        ])
        return
      }

      if (!r.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, could not confirm the appointment." }])
        return
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Confirmed your appointment for ${scheduled_at}.` }
      ])
    } catch (e) {
      console.error(e)
      setMessages((prev) => [...prev, { role: "assistant", content: "Network error during confirm." }])
    } finally {
      setLoading(false)
    }
  }

  // 5) Decline the proposed time
  async function declineAppointment() {
    if (!token) return
    const last = [...messages].reverse().find((m) => m.role === "assistant" && m.meta?.appointment_candidate)
    if (!last) return alert("No proposed appointment to decline.")
    const scheduled_at = last.meta.appointment_candidate

    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/chatbot/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ session_id: sessionId, scheduled_at, confirm: false })
      })
      const j = await r.json()
      if (!r.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, could not update the request." }])
        return
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Okay, I will not book that time. When works better?" }
      ])
    } catch (e) {
      console.error(e)
      setMessages((prev) => [...prev, { role: "assistant", content: "Network error during decline." }])
    } finally {
      setLoading(false)
    }
  }

  // Helper: shows confirm/decline only if last message needs_confirmation
  const showConfirmBar = useMemo(() => {
    const last = messages[messages.length - 1]
    return last?.meta?.needs_confirmation && last?.meta?.appointment_candidate
  }, [messages])

  return (
    <div className="min-h-screen flex flex-col items-center p-4" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="w-full max-w-2xl">
        <header className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-semibold">Dental Chatbot</h1>
          <div className="text-xs opacity-70">
            Session: <code>{sessionId.slice(0, 8)}…</code> &nbsp;|&nbsp; API: <code>{API_BASE}</code>
          </div>
        </header>

        <div className="flex items-center gap-2 mb-3">
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={useLLM}
              onChange={(e) => setUseLLM(e.target.checked)}
            />
            Use LLM
          </label>
        </div>

        <div
          ref={scrollerRef}
          className="border rounded-md p-3 h-[60vh] overflow-auto bg-white"
          style={{ boxShadow: "0 0 0 1px #eee inset" }}
        >
          {messages.length === 0 && (
            <div className="text-sm opacity-60">Say hi to start. I can help you book an appointment.</div>
          )}
          {messages.map((m, i) => (
            <div key={i} className="mb-3">
              <div className="text-xs opacity-60 mb-1">{m.role === "user" ? "You" : "Assistant"}</div>
              <div
                className={`rounded-md px-3 py-2 text-sm ${
                  m.role === "user" ? "bg-blue-50" : "bg-gray-50"
                }`}
              >
                {m.content}
                {m.meta?.appointment_candidate && (
                  <div className="text-[11px] opacity-70 mt-1">
                    candidate: <code>{m.meta.appointment_candidate}</code>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {showConfirmBar && (
          <div className="flex items-center justify-between gap-2 mt-3">
            <div className="text-sm">
              Confirm this time?
            </div>
            <div className="flex gap-2">
              <button
                className="px-3 py-2 rounded-md bg-green-600 text-white text-sm"
                onClick={confirmAppointment}
                disabled={loading}
              >
                Confirm
              </button>
              <button
                className="px-3 py-2 rounded-md bg-gray-200 text-sm"
                onClick={declineAppointment}
                disabled={loading}
              >
                Pick another
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
          <input
            className="flex-1 border rounded-md px-3 py-2 text-sm"
            placeholder="Type a message… e.g., next Monday at 10am"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" ? sendMessage() : null}
            disabled={loading}
          />
          <button
            className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm"
            onClick={sendMessage}
            disabled={loading}
          >
            {loading ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  )
}
