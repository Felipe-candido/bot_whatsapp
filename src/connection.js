const fs    = require('fs')
const path  = require('path')
const pino  = require('pino')
const qrcode = require('qrcode')

const { handleIncomingMessages } = require('./messageHandler')

// Diretorio base das sessoes (um subdir por tenant)
const DATA_DIR      = process.env.DATA_DIR || path.resolve(__dirname, '..')
const SESSIONS_BASE = process.env.SESSIONS_DIR
  || path.resolve(DATA_DIR, '..', 'sessions')

const MAX_RECONNECT_ATTEMPTS = 10
const BASE_RECONNECT_DELAY   = 5000 // ms

// Estado por tenant
// Map<tenantId, { sock, status, currentQR, reconnectTimer, reconnectAttempts, connectPromise, suppressReconnectFor }>
const tenants = new Map()

function _getOrCreate(tenantId) {
  if (!tenants.has(tenantId)) {
    tenants.set(tenantId, {
      sock:              null,
      status:            'disconnected',
      currentQR:         null,
      reconnectTimer:    null,
      reconnectAttempts: 0,
      connectPromise:    null,
      suppressReconnectFor: null
    })
  }
  return tenants.get(tenantId)
}

function getStatus(tenantId) {
  return tenants.get(tenantId)?.status || 'disconnected'
}

function getQR(tenantId) {
  return tenants.get(tenantId)?.currentQR || null
}

function getAllStatuses() {
  const result = {}
  for (const [id, t] of tenants) {
    result[id] = { status: t.status, hasQR: !!t.currentQR }
  }
  return result
}

// ─── Sessao ───────────────────────────────────────────────────────────────────

function sessionDir(tenantId) {
  return path.join(SESSIONS_BASE, tenantId)
}

function ensureSessionDir(tenantId) {
  const dir = sessionDir(tenantId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function clearSessionFiles(tenantId) {
  const dir = sessionDir(tenantId)
  if (!fs.existsSync(dir)) return
  for (const file of fs.readdirSync(dir)) {
    try {
      fs.rmSync(path.join(dir, file), { recursive: true, force: true })
    } catch (err) {
      console.error(`[${tenantId}] Falha ao remover arquivo de sessao:`, err.message)
    }
  }
}

// ─── Baileys (carregado uma unica vez, compartilhado entre tenants) ───────────

let baileysPromise = null
function loadBaileys() {
  if (!baileysPromise) baileysPromise = import('@whiskeysockets/baileys')
  return baileysPromise
}

// ─── Conexao por tenant ───────────────────────────────────────────────────────

async function connectTenant(tenantId) {
  const t = _getOrCreate(tenantId)

  if (t.sock && t.status === 'open') return t.sock
  if (t.connectPromise) return t.connectPromise

  t.connectPromise = _createSocket(tenantId).finally(() => {
    t.connectPromise = null
  })

  return t.connectPromise
}

async function disconnectTenant(tenantId) {
  const t = tenants.get(tenantId)
  if (!t) return

  _clearReconnectTimer(tenantId)
  t.suppressReconnectFor = t.sock
  _closeSock(t.sock)

  t.sock      = null
  t.status    = 'disconnected'
  t.currentQR = null

  console.log(`[${tenantId}] Desconectado manualmente`)
}

async function reconnectTenant(tenantId, options = {}) {
  const { resetSession = false } = options
  const t = _getOrCreate(tenantId)
  const pendingConnection = t.connectPromise

  if (pendingConnection) {
    try {
      await pendingConnection
    } catch {
      // The next connection attempt below will surface any new error.
    }
  }

  await disconnectTenant(tenantId)

  t.reconnectAttempts = 0
  t.currentQR = null

  if (resetSession) {
    clearSessionFiles(tenantId)
    ensureSessionDir(tenantId)
  }

  return connectTenant(tenantId)
}

async function _createSocket(tenantId) {
  ensureSessionDir(tenantId)

  const t = _getOrCreate(tenantId)
  t.status    = 'connecting'
  t.currentQR = null

  const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
  } = await loadBaileys()

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir(tenantId))
  const { version, isLatest } = await fetchLatestBaileysVersion()

  console.log(`[${tenantId}] Baileys ${version.join('.')} | latest: ${isLatest}`)

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys:  makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    logger:              pino({ level: 'silent' }),
    browser:             ['Bot Credito', 'Chrome', '1.0.0'],
    syncFullHistory:     false,
    markOnlineOnConnect: false,
    getMessage:          async () => undefined
  })

  t.sock = sock
  _clearReconnectTimer(tenantId)

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      try {
        t.currentQR = await qrcode.toDataURL(qr)
        t.status    = 'connecting'
        console.log(`[${tenantId}] Novo QR Code gerado`)
      } catch (err) {
        console.error(`[${tenantId}] Erro ao gerar QR:`, err.message)
      }
    }

    if (connection === 'open') {
      t.status            = 'open'
      t.currentQR         = null
      t.reconnectAttempts = 0
      console.log(`[${tenantId}] Conectado com sucesso`)
      return
    }

    if (connection === 'connecting') {
      t.status = 'connecting'
      return
    }

    if (connection !== 'close') return

    const code =
      lastDisconnect?.error?.output?.statusCode ||
      lastDisconnect?.error?.statusCode

    const { loggedOut, badSession, timedOut } = DisconnectReason
    const isLoggedOut  = code === loggedOut
    const isBadSession = code === badSession

    console.log(`[${tenantId}] Conexao fechada — codigo: ${code}`)

    _closeSock(sock)
    if (t.sock === sock) t.sock = null
    t.status = 'disconnected'

    if (t.suppressReconnectFor === sock) {
      t.suppressReconnectFor = null
      return
    }

    if (isLoggedOut || isBadSession) {
      console.log(`[${tenantId}] Sessao invalida — limpando e gerando novo QR`)
      setTimeout(() => {
        clearSessionFiles(tenantId)
        ensureSessionDir(tenantId)
        t.reconnectAttempts = 0
        connectTenant(tenantId).catch(console.error)
      }, 2000)
      return
    }

    _scheduleReconnect(tenantId, code === timedOut ? 2000 : undefined)
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' && type !== 'append') return
    try {
      await handleIncomingMessages(tenantId, sock, messages, type)
    } catch (err) {
      console.error(`[${tenantId}] Erro ao processar mensagens:`, err)
    }
  })

  return sock
}

function _closeSock(sock) {
  if (!sock) return
  try {
    if (sock.ws && typeof sock.ws.close === 'function') sock.ws.close()
  } catch { /* ignora */ }
}

function _clearReconnectTimer(tenantId) {
  const t = tenants.get(tenantId)
  if (!t) return
  if (t.reconnectTimer) {
    clearTimeout(t.reconnectTimer)
    t.reconnectTimer = null
  }
}

function _scheduleReconnect(tenantId, forceDelay) {
  const t = tenants.get(tenantId)
  if (!t || t.reconnectTimer || t.connectPromise) return

  if (t.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(`[${tenantId}] Maximo de reconexoes atingido.`)
    return
  }

  const delay = forceDelay || Math.min(
    BASE_RECONNECT_DELAY * Math.pow(1.5, t.reconnectAttempts),
    60000
  )

  t.reconnectAttempts++
  console.log(`[${tenantId}] Reconectando em ${Math.round(delay / 1000)}s (tentativa ${t.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`)

  t.reconnectTimer = setTimeout(() => {
    t.reconnectTimer = null
    connectTenant(tenantId).catch(err => {
      console.error(`[${tenantId}] Falha na reconexao:`, err.message)
      _scheduleReconnect(tenantId)
    })
  }, delay)
}

// ─── Inicializacao de todos os tenants ativos ─────────────────────────────────

async function startAllTenants(activeTenants) {
  for (const tenant of activeTenants) {
    console.log(`[MANAGER] Iniciando tenant: ${tenant.id} (${tenant.label})`)
    connectTenant(tenant.id).catch(err => {
      console.error(`[${tenant.id}] Falha ao iniciar:`, err.message)
    })
    // Pequena pausa entre tenants para nao sobrecarregar a API do WhatsApp
    await new Promise(r => setTimeout(r, 1500))
  }
}

module.exports = {
  connectTenant,
  disconnectTenant,
  reconnectTenant,
  startAllTenants,
  getStatus,
  getQR,
  getAllStatuses
}
