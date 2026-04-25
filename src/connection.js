const fs = require('fs')
const path = require('path')
const pino = require('pino')
const qrcode = require('qrcode-terminal')

const { handleIncomingMessages } = require('./messageHandler')

const SESSION_DIR = path.resolve(__dirname, '..', 'sessions')
const RECONNECT_DELAY_MS = 3000

let sock = null
let connectPromise = null
let reconnectTimer = null
let baileysModulePromise = null

function ensureSessionDir() {
  fs.mkdirSync(SESSION_DIR, { recursive: true })
}

async function loadBaileys() {
  if (!baileysModulePromise) {
    baileysModulePromise = import('@whiskeysockets/baileys')
  }

  return baileysModulePromise
}

function clearReconnectTimer() {
  if (!reconnectTimer) {
    return
  }

  clearTimeout(reconnectTimer)
  reconnectTimer = null
}

function scheduleReconnect() {
  if (reconnectTimer || connectPromise || sock) {
    return
  }

  console.log(`Tentando reconectar em ${RECONNECT_DELAY_MS / 1000} segundos...`)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectToWhatsApp().catch(err => {
      console.error('[ERRO] Falha ao reconectar ao WhatsApp:', err)
    })
  }, RECONNECT_DELAY_MS)
}

async function connectToWhatsApp() {
  if (sock) {
    console.log('Ja existe uma conexao ativa.')
    return sock
  }

  if (connectPromise) {
    console.log('Conexao com WhatsApp em andamento...')
    return connectPromise
  }

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

  nextSock.ev.on('creds.update', async () => {
    try {
      await saveCreds()
    } catch (err) {
      console.error('[ERRO] Falha ao salvar credenciais:', err)
    }
  })

  nextSock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\nEscaneie o QR Code abaixo:\n')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
      clearReconnectTimer()
      console.log('WhatsApp conectado com sucesso')
      return
    }

    if (connection !== 'close') {
      return
    }

    const code =
      lastDisconnect?.error?.output?.statusCode ||
      lastDisconnect?.error?.statusCode
    const loggedOut = code === DisconnectReason.loggedOut

    console.log(`Conexao fechada (codigo: ${code || 'desconhecido'})`)

    if (sock === nextSock) {
      sock = null
    }

    if (loggedOut) {
      clearReconnectTimer()
      console.log('Sessao invalida. Apague a pasta sessions/ e rode novamente.')
      return
    }

    scheduleReconnect()
  })

  nextSock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') {
      return
    }

    try {
      await handleIncomingMessages(nextSock, messages)
    } catch (err) {
      console.error('[ERRO] Falha ao processar mensagens:', err)
    }
  })

  return nextSock
}

function getSock() {
  return sock
}

module.exports = { connectToWhatsApp, getSock }
