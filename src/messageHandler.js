const { STATES, getState, setState } = require('./stateManager')
const { sendMsg, sendImage, normalize } = require('./helpers')
const { saveCity, saveFormField, markMessageProcessed } = require('./database')

// TRIGGER DO ANÚNCIO
function isAdTrigger(rawText) {
  const expected = normalize(
    'Olá! Tenho interesse e queria mais informações, por favor.'
  )
  return normalize(rawText) === expected
}

// Respostas positivas
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

/**
 * Extrai um ID único para deduplicação.
 * Combina o ID da mensagem com o JID do remetente para ser globalmente único.
 */
function getMessageId(msg) {
  const id  = msg?.key?.id || ''
  const jid = msg?.key?.remoteJid || ''
  return `${jid}:${id}`
}

async function handleIncomingMessages(sock, messages, type = 'notify') {
  for (const msg of messages) {
    const jid = msg?.key?.remoteJid

    // Filtros básicos
    if (!jid) continue
    if (msg.key.fromMe) continue
    if (jid.endsWith('@g.us')) continue
    if (jid === 'status@broadcast') continue

    const rawText = getMessageText(msg.message)
    if (!rawText.trim()) continue

    // Deduplicação: ignora mensagens que já foram processadas (replay após reconexão)
    const msgId = getMessageId(msg)
    const isNew = markMessageProcessed(msgId)
    if (!isNew) {
      console.log(`[DEDUP] Mensagem ignorada (ja processada): ${msgId}`)
      continue
    }

    // Para mensagens do histórico (append), só processa se o usuário já tem estado ativo
    // Evita responder a mensagens muito antigas do histórico de sync
    if (type === 'append') {
      const row = getState(jid)
      if (!row || row.state === STATES.IDLE) {
        console.log(`[APPEND] Mensagem historica ignorada para jid sem estado ativo: ${jid}`)
        continue
      }
    }

    const text = normalize(rawText)
    const row  = getState(jid)
    const state = row?.state || STATES.IDLE

    console.log(`[MSG] ${jid} | tipo: ${type} | estado: ${state} | texto: "${rawText.slice(0, 80)}"`)

    try {
      // Entrada do fluxo
      if (state === STATES.IDLE) {
        if (!isAdTrigger(rawText)) {
          console.log(`[IGNORADO] ${jid} - mensagem nao veio do anuncio`)
          continue
        }

        await sendWelcome(sock, jid)
        setState(jid, STATES.AWAITING_CITY)
        continue
      }

      if (state === STATES.AWAITING_CITY) {
        await handleCity(sock, jid, rawText)
        continue
      }

      if (state === STATES.AWAITING_FICHA) {
        await handleConfirm(sock, jid, text)
        continue
      }

      if (state === STATES.COMPLETED) {
        // Salva qualquer mensagem enviada após o formulário (fotos, dados extras)
        await saveFormField(jid, `ficha_${Date.now()}`, rawText)
        continue
      }

    } catch (err) {
      console.error(`[ERRO] Falha ao processar mensagem de ${jid}:`, err)
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

async function handleCity(sock, jid, text) {
  saveCity(jid, text)

  await sendImage(sock, jid, 'assets/tabela_precos.jpg', 'Tabela de valores')
  await sendMsg(sock, jid, { text: EXAMPLE_TEXT }, 800)

  setState(jid, STATES.AWAITING_FICHA)
}

async function handleConfirm(sock, jid, text) {
  if (!isPositive(text)) {
    await sendMsg(sock, jid, {
      text: 'Sem problemas. Qualquer duvida estamos a disposicao.'
    })
    setState(jid, STATES.IDLE)
    return
  }

  await sendMsg(sock, jid, { text: FULL_FORM })
  setState(jid, STATES.COMPLETED)
}

module.exports = { handleIncomingMessages }