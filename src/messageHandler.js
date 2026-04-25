const { STATES, getState, setState } = require('./stateManager')
const { sendMsg, sendImage, normalize } = require('./helpers')
const { saveCity, saveFormField } = require('./database')

const AD_TRIGGERS = [
  'ss', 'sim', 'oi', 'ola', 'tenho interesse',
  'interesse', 'quero', 'quero saber',
  'mais info', 'informacao'
]

function isAdTrigger(text) {
  return AD_TRIGGERS.some(t => text.includes(t))
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
    ''
  )
}

async function handleIncomingMessages(sock, messages) {
  for (const msg of messages) {
    const jid = msg?.key?.remoteJid

    if (!jid) continue
    if (msg.key.fromMe) continue
    if (jid.endsWith('@g.us')) continue
    if (jid === 'status@broadcast') continue

    const rawText = getMessageText(msg.message)
    const text = normalize(rawText)
    const row = getState(jid)
    const state = row?.state || STATES.IDLE

    console.log(`[MSG] ${jid} | estado: ${state} | texto: "${rawText}"`)

    if (state === STATES.IDLE) {
      if (!isAdTrigger(text)) {
        console.log(`[IGNORADO] ${jid} - mensagem nao veio do anuncio`)
        continue
      }

      await sendWelcome(sock, jid)
      continue
    }

    if (state === STATES.COMPLETED) {
      await saveFormField(jid, 'ficha_bruta', rawText)
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

  }
}

async function sendWelcome(sock, jid) {
  await sendMsg(sock, jid, {
    text:
      'Ola, tudo bem?\n\n' +
      'Somos uma empresa de credito e estamos aqui para auxiliar com seu capital de giro.\n\n' +
      'Para comecar, informe em qual cidade voce possui comercio e qual o seu CNPJ.'
  })

  setState(jid, STATES.AWAITING_CITY)
}

async function handleCity(sock, jid, text) {
  saveCity(jid, text)
  await sendImage(sock, jid, 'assets/tabela_precos.jpg', 'Tabela de valores')
  await sendMsg(sock, jid, { text: EXAMPLE_TEXT }, 800)
  setState(jid, STATES.AWAITING_FICHA)
}

async function handleConfirm(sock, jid, text) {
  const { STATES, getState, setState } = require('./stateManager')
const { sendMsg, sendImage, normalize } = require('./helpers')
const { saveCity, saveFormField } = require('./database')

function isAdTrigger(text) {
  return AD_TRIGGERS.some(t => text.includes(t))
}

function isPositive(text) {
  return /^(sim+|ss+|ok+|quero+|bora+|claro+|pode)/i.test(text)
}

const positive = isPositive(text)

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
    ''
  )
}

async function handleIncomingMessages(sock, messages) {
  for (const msg of messages) {
    const jid = msg?.key?.remoteJid

    if (!jid) continue
    if (msg.key.fromMe) continue
    if (jid.endsWith('@g.us')) continue
    if (jid === 'status@broadcast') continue

    const rawText = getMessageText(msg.message)
    const text = normalize(rawText)
    const row = getState(jid)
    const state = row?.state || STATES.IDLE

    console.log(`[MSG] ${jid} | estado: ${state} | texto: "${rawText}"`)

    if (state === STATES.IDLE) {
      if (!isAdTrigger(text)) {
        console.log(`[IGNORADO] ${jid} - mensagem nao veio do anuncio`)
        continue
      }

      await sendWelcome(sock, jid)
      continue
    }

    if (state === STATES.COMPLETED) {
      await saveFormField(jid, 'ficha_bruta', rawText)
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

  }
}

async function sendWelcome(sock, jid) {
  await sendMsg(sock, jid, {
    text:
      'Ola, tudo bem?\n\n' +
      'Somos uma empresa de credito e estamos aqui para auxiliar com seu capital de giro.\n\n' +
      'Para comecar, informe em qual cidade voce possui comercio e qual o seu CNPJ.'
  })

  setState(jid, STATES.AWAITING_CITY)
}

async function handleCity(sock, jid, text) {
  saveCity(jid, text)
  await sendImage(sock, jid, 'assets/tabela_precos.jpg', 'Tabela de valores')
  await sendMsg(sock, jid, { text: EXAMPLE_TEXT }, 800)
  setState(jid, STATES.AWAITING_FICHA)
}

async function handleConfirm(sock, jid, text) {
  const positive = POSITIVE.some(word => text.includes(word))

  if (!positive) {
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


  if (!positive) {
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
