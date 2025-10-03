// backend/db.js
import pkg from 'pg'
const { Pool } = pkg

let pool = null

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      console.warn('DATABASE_URL not set. Please configure backend/.env')
    }
    pool = new Pool({ connectionString, max: 10 })
  }
  return pool
}

export async function query(text, params) {
  return getPool().query(text, params)
}

export async function getClient() {
  return getPool().connect()
}
