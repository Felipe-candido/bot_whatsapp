const path = require('path')
const Database = require('better-sqlite3')

const DB_PATH = path.resolve(__dirname, '..', 'bot.db')

let db

function initDb() {
  if (db) {
    return db
  }

  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_state (
      phone       TEXT PRIMARY KEY,
      state       TEXT NOT NULL DEFAULT 'idle',
      form_step   INTEGER DEFAULT 0,
      updated_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS leads (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      phone       TEXT UNIQUE NOT NULL,
      city_cnpj   TEXT,
      source      TEXT DEFAULT 'anuncio',
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS form_fields (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      phone       TEXT NOT NULL,
      field_name  TEXT NOT NULL,
      value       TEXT,
      saved_at    TEXT DEFAULT (datetime('now')),
      UNIQUE(phone, field_name)
    );

    CREATE INDEX IF NOT EXISTS idx_fields_phone ON form_fields(phone);
  `)

  console.log(`Banco de dados iniciado (${DB_PATH})`)
  return db
}

function getDb() {
  if (!db) {
    throw new Error('DB nao inicializado. Chame initDb() primeiro.')
  }

  return db
}

function saveCity(phone, cityCnpj) {
  getDb().prepare(`
    INSERT INTO leads (phone, city_cnpj)
    VALUES (?, ?)
    ON CONFLICT(phone) DO UPDATE SET city_cnpj = excluded.city_cnpj
  `).run(phone, cityCnpj)
}

function saveFormField(phone, field, value) {
  getDb().prepare(`
    INSERT INTO form_fields (phone, field_name, value)
    VALUES (?, ?, ?)
    ON CONFLICT(phone, field_name) DO UPDATE SET value = excluded.value
  `).run(phone, field, value)
}

function getFormData(phone) {
  const rows = getDb().prepare(
    'SELECT field_name, value FROM form_fields WHERE phone = ?'
  ).all(phone)

  return Object.fromEntries(rows.map(row => [row.field_name, row.value]))
}

function getAllLeads() {
  return getDb().prepare(
    'SELECT * FROM leads ORDER BY created_at DESC'
  ).all()
}

module.exports = { initDb, getDb, saveCity, saveFormField, getFormData, getAllLeads }
