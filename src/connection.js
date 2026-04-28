const fs = require('fs')
const path = require('path')
const pino = require('pino')
const qrcode = require('qrcode')

const { handleIncomingMessages } = require('./messageHandler')

const SESSION_DIR = path.resolve(__dirname, '..', 'sessions')
const RECONNECT_DELAY_MS = 3000

let sock = null
let connectPromise = null
let reconnectTimer = null
let baileysModulePromise = null
let currentQR = null
let connectionStatus = 'connecting'

function getStatus() {
  return connectionStatus
}

// garante pasta
function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true })
  }
}

// limpa arquivos (sem deletar a pasta)
function clearSessionFiles() {
  if (!fs.existsSync(SESSION_DIR)) return

  for (const file of fs.readdirSync(SESSION_DIR)) {
    const filePath = path.join(SESSION_DIR, file)

    try {
      fs.rmSync(filePath, { recursive: true, force: true })
    } catch (err) {
      console.error('[ERRO] Falha ao remover arquivo:', filePath)
    }
  }
}

async function loadBaileys() {
  if (!baileysModulePromise) {
    baileysModulePromise = import('@whiskeysockets/baileys')
  }
  return baileysModulePromise
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function scheduleReconnect() {
  if (reconnectTimer || connectPromise || sock) return

  console.log(`Reconectando em ${RECONNECT_DELAY_MS / 1000}s...`)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectToWhatsApp().catch(console.error)
  }, RECONNECT_DELAY_MS)
}

async function connectToWhatsApp() {
  if (sock) return sock
  if (connectPromise) return connectPromise

  connectPromise = createSocketConnection().finally(() => {
    connectPromise = null
  })

  return connectPromise
}

async function createSocketConnection() {
  ensureSessionDir()

  const baileys = await loadBaileys()
  const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
  } = baileys

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)
  const { version } = await fetchLatestBaileysVersion()

  console.log(`Usando Baileys versao: ${version.join('.')}`)

  const nextSock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Bot Credito', 'Chrome', '1.0.0'],
    getMessage: async () => undefined
  })

  sock = nextSock
  clearReconnectTimer()

  nextSock.ev.on('creds.update', saveCreds)

  nextSock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {

    if (qr) {
      currentQR = await qrcode.toDataURL(qr)
      connectionStatus = 'connecting'
      console.log('QR atualizado')
    }

    if (connection === 'open') {
      connectionStatus = 'open'
      currentQR = null
      console.log('WhatsApp conectado')
      return
    }

    if (connection !== 'close') return

    const code =
      lastDisconnect?.error?.output?.statusCode ||
      lastDisconnect?.error?.statusCode

    const loggedOut = code === DisconnectReason.loggedOut

    console.log(`Conexao fechada (${code})`)

    // mata socket antes de mexer em arquivo
    try {
      nextSock.ws.close()
    } catch {}

    sock = null

    if (loggedOut) {
      console.log('Sessao invalida → resetando arquivos')

      // espera um pouco pro Windows largar o lock
      setTimeout(() => {
        clearSessionFiles()
        ensureSessionDir()

        currentQR = null
        connectionStatus = 'connecting'

        connectToWhatsApp().catch(console.error)
      }, 1500)

      return
    }

    scheduleReconnect()
  })

  nextSock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    try {
      await handleIncomingMessages(nextSock, messages)
    } catch (err) {
      console.error('[ERRO] mensagens:', err)
    }
  })

  return nextSock
}

function getSock() {
  return sock
}

function getQR() {
  return currentQR
}

module.exports = {
  connectToWhatsApp,
  getSock,
  getQR,
  getStatus
}