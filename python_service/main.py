import re
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from openai import OpenAI
import json as _json
from fastapi import FastAPI
from pydantic import BaseModel
import os
from dotenv import load_dotenv
load_dotenv()  # loads python_service/.env

USE_LLM = os.getenv("USE_LLM", "false").lower() == "true"

app = FastAPI(title="Python LangChain-like Service (Stub)", version="0.2.0")

class ChatRequest(BaseModel):
    message: str
    user_id: Optional[str] = None
    session_id: Optional[str] = None

def has_token(text: str, vocab: set[str]) -> bool:
    """
    True if any vocab item appears as a whole token/phrase.
    Handles multi-word phrases like 'please book'.
    """
    for phrase in vocab:
        # word-boundary match across the whole phrase
        if re.search(rf"\b{re.escape(phrase)}\b", text):
            return True
    return False

def equals_any_trimmed(text: str, vals: set[str]) -> bool:
    t = text.strip()
    return t in vals

# In-memory session proposals (demo only)
LAST_PROPOSAL: Dict[str, str] = {}

AFFIRM = {'yes', 'yeah', 'yep', 'confirm', 'sure', 'ok', 'okay', 'please book', 'book it'}
NEGATE = {'no', 'nope', 'cancel', "don't", 'do not', 'not now', 'later'}
SHORT_YES = {'y'}
SHORT_NO  = {'n'}


def llm_extract_and_reply(user_text: str) -> Dict[str, Any]:
    """
    Use OpenAI directly (no LangChain). Returns:
      {"reply": str|None, "appointment_candidate": str|None}
    """
    try:
        from openai import OpenAI
        import json as _json
        import traceback
    except Exception as e:
        print("LLM import error:", repr(e))
        return {"reply": None, "appointment_candidate": None}

    try:
        client = OpenAI()

        system = (
            "You are a helpful dental clinic assistant. "
            "If the user asks to book an appointment, propose a single date/time in ISO8601 if you can. "
            "Respond briefly and helpfully."
        )

        # Enforce PURE JSON output from the model (no prose)
        prompt = f"""
Return ONLY a compact JSON object with exactly these keys:
  "reply": a short natural-language response for the user (string),
  "iso": an ISO8601 datetime for the requested appointment (string) or null if unknown.

User: {user_text}
""".strip()

        resp = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            response_format={"type": "json_object"},  # ← forces JSON-only output
        )

        # With response_format=json_object, the content is pure JSON text
        txt = resp.choices[0].message.content.strip()
        print("LLM raw JSON:", txt)

        payload = _json.loads(txt)
        reply = payload.get("reply")
        iso   = payload.get("iso")
        return {"reply": reply, "appointment_candidate": iso}

    except Exception as e:
        # Print the exact failure so we know what's wrong (auth, model, network, parse, etc.)
        print("LLM error:", repr(e))
        traceback.print_exc()
        return {"reply": None, "appointment_candidate": None}

def naive_extract_datetime(text: str) -> Optional[str]:
    text = text.lower()
    weekday_map = {
        'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3,
        'friday': 4, 'saturday': 5, 'sunday': 6
    }
    time_match = re.search(r'(\d{1,2})(?::(\d{2}))?\s*(am|pm)?', text)
    day_match = None
    for wd in weekday_map:
        if wd in text:
            day_match = wd
            break

    date_str = None
    if day_match:
        target_wd = weekday_map[day_match]
        today_wd = datetime.now().weekday()
        delta = (target_wd - today_wd) % 7
        if delta == 0:
            delta = 7
        target_date = datetime.now() + timedelta(days=delta)
        if time_match:
            hour = int(time_match.group(1))
            minute = int(time_match.group(2) or 0)
            ampm = time_match.group(3)
            if ampm == 'pm' and hour < 12:
                hour += 12
            if ampm == 'am' and hour == 12:
                hour = 0
            target_date = target_date.replace(hour=hour, minute=minute, second=0, microsecond=0)
        date_str = target_date.isoformat()

    return date_str

@app.get('/health')
def health():
    return {'status': 'ok', 'service': 'python_service', 'use_llm': USE_LLM}

@app.post('/simulate')
def simulate(req: ChatRequest) -> Dict[str, Any]:
    msg = (req.message or '').strip()
    low = msg.lower()
    sid = req.session_id or 'anon'

    # Confirming an existing proposal
    if sid in LAST_PROPOSAL and (
            equals_any_trimmed(low, SHORT_YES) or has_token(low, AFFIRM)
    ):
        dt = LAST_PROPOSAL[sid]
        return {
            'user_id': req.user_id or 'anonymous',
            'input': req.message,
            'reply': f'Confirming your appointment for {dt}.',
            'appointment_candidate': dt,
            'intent': 'confirm',
            'needs_confirmation': False
        }

    # Declining
    if sid in LAST_PROPOSAL and (
            equals_any_trimmed(low, SHORT_NO) or has_token(low, NEGATE)
    ):
        LAST_PROPOSAL.pop(sid, None)
        return {
            'user_id': req.user_id or 'anonymous',
            'input': req.message,
            'reply': 'Okay, I will not book that time. When works better?',
            'appointment_candidate': None,
            'intent': 'decline',
            'needs_confirmation': False
        }
    print("USE_LLM:", USE_LLM, "HAS_KEY:", bool(os.getenv("OPENAI_API_KEY")))

    # optional LLM path (only if enabled and key provided)
    if USE_LLM and os.getenv("OPENAI_API_KEY"):
        print("USE_LLM:", msg)
        llm_out = llm_extract_and_reply(msg)
        if llm_out.get("reply") or llm_out.get("appointment_candidate"):
            cand = llm_out.get("appointment_candidate")
            if cand:
                LAST_PROPOSAL[sid] = cand
                return {
                    'user_id': req.user_id or 'anonymous',
                    'input': req.message,
                    'reply': f'{llm_out["reply"]} Shall I confirm?',
                    'appointment_candidate': cand,
                    'intent': 'propose',
                    'needs_confirmation': True
                }
            else:
                return {
                    'user_id': req.user_id or 'anonymous',
                    'input': req.message,
                    'reply': llm_out['reply'],
                    'appointment_candidate': None,
                    'intent': 'chat',
                    'needs_confirmation': False
                }

    # Propose a new time if we can parse it
    appt_time = naive_extract_datetime(msg)
    if appt_time:
        LAST_PROPOSAL[sid] = appt_time
        return {
            'user_id': req.user_id or 'anonymous',
            'input': req.message,
            'reply': f'Great! I can tentatively book you for {appt_time}. Shall I confirm?',
            'appointment_candidate': appt_time,
            'intent': 'propose',
            'needs_confirmation': True
        }

    # Fallback
    return {
        'user_id': req.user_id or 'anonymous',
        'input': req.message,
        'reply': "I can help you book an appointment. When would you like to come in?",
        'appointment_candidate': None,
        'intent': 'chat',
        'needs_confirmation': False
    }
