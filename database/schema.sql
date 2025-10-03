
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255),
    started_at TIMESTAMP DEFAULT NOW(),
    ended_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    scheduled_at TIMESTAMP NOT NULL,
    status VARCHAR(32) DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_appts_user_time ON appointments (user_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_chats_user ON chat_sessions (user_id);

INSERT INTO users (email, password_hash, name) VALUES
('alice@example.com', 'hash_demo', 'Alice'),
('bob@example.com', 'hash_demo', 'Bob')
ON CONFLICT (email) DO NOTHING;
