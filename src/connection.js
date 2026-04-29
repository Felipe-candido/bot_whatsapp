const fs = require('fs')
const path = require('path')
const pino = require('pino')
const qrcode = require('qrcode')

const { handleIncomingMessages } = require('./messageHandler')

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '..')
const SESSION_DIR = path.resolve(DATA_DIR, '..', 'sessions')

// SESSION_DIR aponta para o volume: /app/sessions (via Docker) ou ../sessions (local)
const SESSION_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, '..', 'sessions')
  : path.resolve(__dirname, '..', 'sessions')

const RECONNECT_DELAY_MS = 5000
const MAX_RECONNECT_ATTEMPTS = 10

let sock = null
let connectPromise = null
let reconnectTimer = null
let reconnectAttempts = 0
let baileysModulePromise = null
let currentQR = null
let connectionStatus = 'disconnected'

function getStatus() { return connectionStatus }
function getQR() { return currentQR }

function ensureSessionDir() {
  if (!fs.existsSync(SESSION_PATH)) {
    fs.mkdirSync(SESSION_PATH, { recursive: true })
  }
}

function clearSessionFiles() {
  if (!fs.existsSync(SESSION_PATH)) return
  for (const file of fs.readdirSync(SESSION_PATH)) {
    const filePath = path.join(SESSION_PATH, file)
    try {
      fs.rmSync(filePath, { recursive: true, force: true })
    } catch (err) {
      console.error('[ERRO] Falha ao remover arquivo de sessao:', filePath, err.message)
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

function scheduleReconnect(forceDelay) {
  // Não agenda se já há tentativa em andamento
  if (reconnectTimer || connectPromise) return

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[ERRO] Numero maximo de tentativas de reconexao atingido. Reinicie o servico.')
    connectionStatus = 'disconnected'
    return
  }

  // Backoff exponencial com limite de 60s
  const delay = forceDelay || Math.min(
    RECONNECT_DELAY_MS * Math.pow(1.5, reconnectAttempts),
    60000
  )

  reconnectAttempts++
  console.log(`[RECONEXAO] Tentativa ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} em ${Math.round(delay / 1000)}s...`)

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectToWhatsApp().catch(err => {
      console.error('[ERRO] Falha na reconexao:', err.message)
      scheduleReconnect()
    })
  }, delay)
}

/**
 * Fecha o socket atual de forma segura, sem lançar exceções.
 */
function closeSockSafely(s) {
  if (!s) return
  try {
    // Baileys expõe ws como WebSocket — fecha só se ainda estiver aberto
    if (s.ws && typeof s.ws.close === 'function') {
      s.ws.close()
    }
  } catch {
    // ignora
  }
}

async function connectToWhatsApp() {
  // Se já existe um socket ABERTO, retorna ele
  if (sock && connectionStatus === 'open') return sock

  // Se há uma promessa de conexão em andamento, aguarda ela
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
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
  } = baileys

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH)
  const { version, isLatest } = await fetchLatestBaileysVersion()

  console.log(`[BAILEYS] Versao: ${version.join('.')} | Ultima: ${isLatest}`)

  connectionStatus = 'connecting'
  currentQR = null

  const nextSock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    logger: pino({ level: 'silent' }),
    browser: ['Bot Credito', 'Chrome', '1.0.0'],
    // Necessário para Baileys reenviar mensagens que precisam de retry
    getMessage: async key => {
      // Retorna undefined é válido — significa que não temos o histórico da mensagem
      // Baileys vai pedir para o remetente reenviar se necessário
      return undefined
    },
    // Recebe mensagens em modo offline (enviadas enquanto desconectado)
    syncFullHistory: false,
    markOnlineOnConnect: false
  })

  sock = nextSock
  clearReconnectTimer()

  nextSock.ev.on('creds.update', saveCreds)

  nextSock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      try {
        currentQR = await qrcode.toDataURL(qr)
        connectionStatus = 'connecting'
        console.log('[QR] Novo QR Code gerado — escaneie pelo WhatsApp')
      } catch (err) {
        console.error('[ERRO] Falha ao gerar QR Code:', err.message)
      }
    }

    if (connection === 'open') {
      connectionStatus = 'open'
      currentQR = null
      reconnectAttempts = 0 // reset contador ao conectar com sucesso
      console.log('[CONEXAO] WhatsApp conectado com sucesso')
      return
    }

    if (connection === 'connecting') {
      connectionStatus = 'connecting'
      return
    }

    if (connection !== 'close') return

    const statusCode =
      lastDisconnect?.error?.output?.statusCode ||
      lastDisconnect?.error?.statusCode

    const { loggedOut, connectionClosed, timedOut, badSession } = DisconnectReason

    const isLoggedOut  = statusCode === loggedOut
    const isBadSession = statusCode === badSession
    const isTimedOut   = statusCode === timedOut

    console.log(`[CONEXAO] Fechada — codigo: ${statusCode}`)

    closeSockSafely(nextSock)

    // Só zera sock se ainda aponta para este socket
    if (sock === nextSock) sock = null

    connectionStatus = 'disconnected'

    if (isLoggedOut || isBadSession) {
      console.log('[SESSAO] Sessao invalida ou deslogada — limpando arquivos e gerando novo QR')

      setTimeout(() => {
        clearSessionFiles()
        ensureSessionDir()
        currentQR = null
        reconnectAttempts = 0
        connectionStatus = 'connecting'
        connectToWhatsApp().catch(console.error)
      }, 2000)

      return
    }

    // Para qualquer outro erro, reagenda com backoff
    scheduleReconnect(isTimedOut ? 2000 : undefined)
  })

  nextSock.ev.on('messages.upsert', async ({ messages, type }) => {
    // 'notify'  = mensagens novas recebidas em tempo real
    // 'append'  = mensagens sincronizadas do histórico após reconexão
    // Processamos ambos, mas a deduplicação no DB evita responder duas vezes
    if (type !== 'notify' && type !== 'append') return

    try {
      await handleIncomingMessages(nextSock, messages, type)
    } catch (err) {
      console.error('[ERRO] Falha ao processar mensagens:', err)
    }
  })

  return nextSock
}

function getSock() { return sock }

module.exports = { connectToWhatsApp, getSock, getQR, getStatus }