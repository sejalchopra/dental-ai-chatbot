
import React, { useEffect, useMemo, useRef, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

function genSessionId(){
  let s = localStorage.getItem('session_id')
  if(!s){
    if (typeof crypto !== 'undefined' && crypto.randomUUID){
      s = crypto.randomUUID()
    } else {
      s = 'sess-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    }
    localStorage.setItem('session_id', s)
  }
  return s
}

function MessageBubble({ role, text }){
  const isUser = role === 'user'
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 8
    }}>
      <div style={{
        background: isUser ? '#111827' : '#eef2ff',
        color: isUser ? 'white' : '#111827',
        padding: '10px 12px',
        borderRadius: 12,
        maxWidth: '75%',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word'
      }}>
        {text}
      </div>
    </div>
  )
}

export default function App(){
  const [backendStatus, setBackendStatus] = useState('unknown')
  const [pyStatus, setPyStatus] = useState('unknown')
  const [token, setToken] = useState('')
  const [input, setInput] = useState('I need an appointment next Monday at 10am')
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hi! I can help you book an appointment. When would you like to come in?' }
  ])
  const [loading, setLoading] = useState(false)
  const [proposal, setProposal] = useState(null) // { scheduled_at }
  const sessionId = useMemo(() => genSessionId(), [])
  const endRef = useRef(null)

  useEffect(() => {
    fetch(`${API_BASE}/health`).then(r => r.json()).then(d => setBackendStatus(d.status || 'ok')).catch(()=>setBackendStatus('down'))
    fetch(`${API_BASE}/health/python`).then(r => r.json()).then(d => setPyStatus(d.status || 'ok')).catch(()=>setPyStatus('down'))
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, proposal])

  const getToken = async () => {
    const res = await fetch(`${API_BASE}/api/chatbot/token`, { method: 'POST' })
    const data = await res.json()
    setToken(data.token)
  }

  const sendMessage = async () => {
    if(!input.trim()) return
    setLoading(true)
    const userMsg = input
    setMessages(m => [...m, { role: 'user', text: userMsg }])
    setInput('')
    try {
      const res = await fetch(`${API_BASE}/api/chatbot/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: userMsg, session_id: sessionId })
      })
      const data = await res.json()
      if(!data?.ok){
        setMessages(m => [...m, { role: 'assistant', text: 'Sorry, something went wrong.' }])
      } else {
        const reply = data.data?.reply || '...'
        setMessages(m => [...m, { role: 'assistant', text: reply }])
        const cand = data.data?.appointment_candidate
        if(cand){
          setProposal({ scheduled_at: cand })
        } else {
          setProposal(null)
        }
      }
    } catch (e){
      setMessages(m => [...m, { role: 'assistant', text: 'Network error. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  const confirmAppointment = async (confirm=true) => {
    if(!proposal) return
    try {
      const res = await fetch(`${API_BASE}/api/chatbot/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ session_id: sessionId, scheduled_at: proposal.scheduled_at, confirm })
      })
      const data = await res.json()
      if(data?.ok && confirm){
        setMessages(m => [...m, { role: 'assistant', text: `✅ Confirmed your appointment for ${proposal.scheduled_at}.` }])
      } else if(data?.ok && !confirm){
        setMessages(m => [...m, { role: 'assistant', text: 'Okay, I will not book that time. When works better?' }])
      } else {
        setMessages(m => [...m, { role: 'assistant', text: 'Sorry, could not process your confirmation.' }])
      }
    } catch (e){
      setMessages(m => [...m, { role: 'assistant', text: 'Network error while confirming.' }])
    } finally {
      setProposal(null)
    }
  }

  const onKeyDown = (e) => {
    if(e.key === 'Enter' && !e.shiftKey){
      e.preventDefault()
      if(!loading) sendMessage()
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Dental AI Chatbot (Step 2)</h1>
        <p className="small">Session: <span className="badge">{sessionId.slice(0,8)}</span> &nbsp; Backend: <span className="badge">{backendStatus}</span> &nbsp; Python: <span className="badge">{pyStatus}</span></p>

        <div className="row">
          <button onClick={getToken}>Get Token</button>
          <input type="text" readOnly placeholder="JWT will appear here" value={token} style={{ flex: 1 }} />
        </div>

        <div style={{ minHeight: 240, border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: 'white', marginTop: 8, marginBottom: 8 }}>
          {messages.map((m, i) => <MessageBubble key={i} role={m.role} text={m.text} />)}
          {proposal && (
            <div style={{ marginTop: 10 }}>
              <div className="small" style={{ marginBottom: 8 }}>
                Proposed time: <strong>{proposal.scheduled_at}</strong>
              </div>
              <div className="row">
                <button onClick={()=>confirmAppointment(true)}>Confirm</button>
                <button onClick={()=>confirmAppointment(false)}>Cancel</button>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="row">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder="Type your message…"
            style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #d1d5db' }}
          />
          <button onClick={sendMessage} disabled={!token || loading} style={{ alignSelf: 'flex-end' }}>
            {loading ? 'Sending…' : 'Send'}
          </button>
        </div>

        <p className="small">API Base: {API_BASE}</p>
      </div>
    </div>
  )
}
