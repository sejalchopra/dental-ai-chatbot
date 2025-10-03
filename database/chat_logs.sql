-- database/step4_chat_logs.sql
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL,               -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  meta JSONB,                               -- optional data (e.g., {appointment_candidate, intent})
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_time
  ON chat_messages (session_token, created_at DESC);
