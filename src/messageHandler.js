const { STATES } = require('./stateManager')
const {
  getState, setState,
  saveCity, saveFormField,
  markMessageProcessed
} = require('./database')
const { sendMsg, sendImage, normalize } = require('./helpers')

function isAdTrigger(rawText) {
  const expected = normalize(
    'Olá! Tenho interesse e queria mais informações, por favor.'
  )
  return normalize(rawText) === expected
}

function isPositive(text) {
  return /^(sim+|ss+|ok+|quero+|bora+|claro+|pode)/i.test(text)
}

const EXAMPLE_TEXT =
`*Exemplo de funcionamento do credito*

Trabalhamos com emprestimos para CNPJ/MEI com pagamentos diarios via PIX.

Valor: R$ 1.000,00
Opcoes de pagamento:
- 20 dias (seg. a sex.) - R$ 65,00/dia
- 24 dias (seg. a sab.) - R$ 55,00/dia
- 28 dias (seg. a sex.) - R$ 50,00/dia

Sem burocracia
Liberacao rapida
Possibilidade de renovacao

Vamos prosseguir? (responda sim ou nao)`

const FULL_FORM =
`*Ficha cadastral - PAULO VENDEDOR*

Preencha as informacoes abaixo:

Nome:
Telefone:
E-mail:
Endereco residencial com CEP:
Endereco comercial com CEP:
RG:
CPF:
CNPJ:
Valor desejado:
Quantidade de parcelas:
Conta juridica (banco, agencia, conta):
Telefone de referencia:

———— FOTOS —————

CNH ou RG (frente e verso):
Comprovante residencial e comercial:
Selfie segurando o documento:
Video do comercio falando sobre atividade e data atual:
Instagram:`

function getMessageText(message = {}) {
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    ''
  )
}

function getMessageId(msg) {
  return `${msg?.key?.remoteJid}:${msg?.key?.id}`
}

/**
 * Processa mensagens recebidas para um tenant especifico.
 * @param {string}  tenantId  - identificador do numero WhatsApp
 * @param {object}  sock      - socket Baileys do tenant
 * @param {Array}   messages  - lista de mensagens
 * @param {string}  type      - 'notify' | 'append'
 */
async function handleIncomingMessages(tenantId, sock, messages, type = 'notify') {
  for (const msg of messages) {
    const jid = msg?.key?.remoteJid

    if (!jid) continue
    if (msg.key.fromMe) continue
    if (jid.endsWith('@g.us')) continue
    if (jid === 'status@broadcast') continue

    const rawText = getMessageText(msg.message)
    if (!rawText.trim()) continue

    // Deduplicacao: ignora replays pos-reconexao
    const isNew = markMessageProcessed(tenantId, getMessageId(msg))
    if (!isNew) {
      console.log(`[${tenantId}] [DEDUP] Mensagem ignorada (ja processada)`)
      continue
    }

    // Para mensagens do historico (append), so processa usuarios com estado ativo
    if (type === 'append') {
      const row = getState(tenantId, jid)
      if (!row || row.state === STATES.IDLE) {
        console.log(`[${tenantId}] [APPEND] Historico ignorado para estado idle: ${jid}`)
        continue
      }
    }

    const text  = normalize(rawText)
    const row   = getState(tenantId, jid)
    const state = row?.state || STATES.IDLE

    console.log(`[${tenantId}] ${jid} | estado: ${state} | "${rawText.slice(0, 80)}"`)

    try {
      if (state === STATES.IDLE) {
        if (!isAdTrigger(rawText)) {
          console.log(`[${tenantId}] [IGNORADO] nao veio do anuncio: ${jid}`)
          continue
        }
        await sendWelcome(sock, jid)
        setState(tenantId, jid, STATES.AWAITING_CITY)
        continue
      }

      if (state === STATES.AWAITING_CITY) {
        await handleCity(tenantId, sock, jid, rawText)
        continue
      }

      if (state === STATES.AWAITING_FICHA) {
        await handleConfirm(tenantId, sock, jid, text)
        continue
      }

      if (state === STATES.COMPLETED) {
        await saveFormField(tenantId, jid, `ficha_${Date.now()}`, rawText)
        continue
      }

    } catch (err) {
      console.error(`[${tenantId}] Erro ao processar msg de ${jid}:`, err)
    }
  }
}

async function sendWelcome(sock, jid) {
  await sendMsg(sock, jid, {
    text:
      'Ola, tudo bem?\n\n' +
      'Somos uma empresa de credito e estamos aqui para auxiliar com seu capital de giro.\n\n' +
      'Para comecar, informe em qual cidade voce possui comercio e qual o seu CNPJ.'
  })
}

async function handleCity(tenantId, sock, jid, text) {
  saveCity(tenantId, jid, text)
  await sendImage(sock, jid, 'assets/tabela_precos.jpg', 'Tabela de valores')
  await sendMsg(sock, jid, { text: EXAMPLE_TEXT }, 800)
  setState(tenantId, jid, STATES.AWAITING_FICHA)
}

async function handleConfirm(tenantId, sock, jid, text) {
  if (!isPositive(text)) {
    await sendMsg(sock, jid, {
      text: 'Qualquer duvida estamos a disposicao.'
    })
    setState(tenantId, jid, STATES.IDLE)
    return
  }
  await sendMsg(sock, jid, { text: FULL_FORM })
  setState(tenantId, jid, STATES.COMPLETED)
}

module.exports = { handleIncomingMessages }