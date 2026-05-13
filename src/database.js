const path = require('path')
const Database = require('better-sqlite3')

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '..')
const DB_PATH  = path.join(DATA_DIR, 'bot.db')

let db

function initDb() {
  if (db) return db

  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  db.pragma('synchronous = NORMAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id         TEXT PRIMARY KEY,
      label      TEXT NOT NULL DEFAULT '',
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_state (
      tenant_id  TEXT NOT NULL DEFAULT 'default',
      phone      TEXT NOT NULL,
      state      TEXT NOT NULL DEFAULT 'idle',
      form_step  INTEGER DEFAULT 0,
      updated_at TEXT,
      PRIMARY KEY (tenant_id, phone)
    );

    CREATE TABLE IF NOT EXISTS leads (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id  TEXT NOT NULL DEFAULT 'default',
      phone      TEXT NOT NULL,
      city_cnpj  TEXT,
      source     TEXT DEFAULT 'anuncio',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, phone)
    );

    CREATE TABLE IF NOT EXISTS form_fields (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id  TEXT NOT NULL DEFAULT 'default',
      phone      TEXT NOT NULL,
      field_name TEXT NOT NULL,
      value      TEXT,
      saved_at   TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, phone, field_name)
    );

    CREATE TABLE IF NOT EXISTS processed_messages (
      tenant_id    TEXT NOT NULL DEFAULT 'default',
      msg_id       TEXT NOT NULL,
      processed_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (tenant_id, msg_id)
    );

    CREATE INDEX IF NOT EXISTS idx_fields_tenant_phone
      ON form_fields(tenant_id, phone);
    CREATE INDEX IF NOT EXISTS idx_processed_at
      ON processed_messages(processed_at);
  `)

  _migrateAddColumn('user_state',  'tenant_id', "TEXT NOT NULL DEFAULT 'default'")
  _migrateAddColumn('leads',       'tenant_id', "TEXT NOT NULL DEFAULT 'default'")
  _migrateAddColumn('form_fields', 'tenant_id', "TEXT NOT NULL DEFAULT 'default'")

  db.prepare(
    "DELETE FROM processed_messages WHERE processed_at < datetime('now', '-1 day')"
  ).run()

  console.log(`[DB] Iniciado: ${DB_PATH}`)
  return db
}

function _migrateAddColumn(table, column, definition) {
  try {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run()
    console.log(`[DB] Migracao: ${table}.${column} adicionado`)
  } catch { /* coluna ja existe */ }
}

function getDb() {
  if (!db) throw new Error('DB nao inicializado. Chame initDb() primeiro.')
  return db
}

// ─── Tenants ──────────────────────────────────────────────────────────────────

function addTenant(id, label = '') {
  getDb().prepare(`
    INSERT INTO tenants (id, label) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET label = excluded.label, active = 1
  `).run(id, label)
}

function deactivateTenant(id) {
  getDb().prepare('UPDATE tenants SET active = 0 WHERE id = ?').run(id)
}

function getTenant(id) {
  return getDb().prepare('SELECT * FROM tenants WHERE id = ?').get(id)
}

function getAllTenants() {
  return getDb().prepare('SELECT * FROM tenants ORDER BY created_at ASC').all()
}

function getActiveTenants() {
  return getDb().prepare(
    'SELECT * FROM tenants WHERE active = 1 ORDER BY created_at ASC'
  ).all()
}

// ─── Deduplicacao ─────────────────────────────────────────────────────────────

function markMessageProcessed(tenantId, msgId) {
  try {
    getDb().prepare(
      'INSERT INTO processed_messages (tenant_id, msg_id) VALUES (?, ?)'
    ).run(tenantId, msgId)
    return true
  } catch {
    return false // ja processada
  }
}

// ─── Estado do usuario ────────────────────────────────────────────────────────

function getState(tenantId, phone) {
  return getDb().prepare(
    'SELECT * FROM user_state WHERE tenant_id = ? AND phone = ?'
  ).get(tenantId, phone)
}

function setState(tenantId, phone, state, formStep = 0) {
  getDb().prepare(`
    INSERT INTO user_state (tenant_id, phone, state, form_step, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(tenant_id, phone) DO UPDATE SET
      state      = excluded.state,
      form_step  = excluded.form_step,
      updated_at = excluded.updated_at
  `).run(tenantId, phone, state, formStep)
}

// ─── Leads e fichas ───────────────────────────────────────────────────────────

function saveCity(tenantId, phone, cityCnpj) {
  getDb().prepare(`
    INSERT INTO leads (tenant_id, phone, city_cnpj)
    VALUES (?, ?, ?)
    ON CONFLICT(tenant_id, phone) DO UPDATE SET city_cnpj = excluded.city_cnpj
  `).run(tenantId, phone, cityCnpj)
}

function saveFormField(tenantId, phone, field, value) {
  getDb().prepare(`
    INSERT INTO form_fields (tenant_id, phone, field_name, value)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(tenant_id, phone, field_name) DO UPDATE SET
      value    = excluded.value,
      saved_at = datetime('now')
  `).run(tenantId, phone, field, value)
}

function getFormData(tenantId, phone) {
  const rows = getDb().prepare(
    'SELECT field_name, value FROM form_fields WHERE tenant_id = ? AND phone = ?'
  ).all(tenantId, phone)
  return Object.fromEntries(rows.map(r => [r.field_name, r.value]))
}

function getAllLeads(tenantId) {
  if (tenantId) {
    return getDb().prepare(
      'SELECT * FROM leads WHERE tenant_id = ? ORDER BY created_at DESC'
    ).all(tenantId)
  }
  return getDb().prepare(
    'SELECT * FROM leads ORDER BY tenant_id, created_at DESC'
  ).all()
}

module.exports = {
  initDb, getDb,
  addTenant, deactivateTenant, getTenant, getAllTenants, getActiveTenants,
  markMessageProcessed,
  getState, setState,
  saveCity, saveFormField, getFormData, getAllLeads
}