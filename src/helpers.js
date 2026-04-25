const fs = require('fs')
const path = require('path')

const IMAGE_DIRS = [
  __dirname,
  path.resolve(__dirname, '..'),
  path.resolve(__dirname, '..', 'assets')
]

function normalize(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\w\s.,!?@-]/g, '')
    .trim()
    .toLowerCase()
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function sendMsg(sock, jid, message, delay = 0) {
  if (delay) {
    await sleep(delay)
  }

  return sock.sendMessage(jid, message)
}

function findImagePath(fileName) {
  return IMAGE_DIRS
    .map(dir => path.join(dir, fileName))
    .find(candidate => fs.existsSync(candidate))
}

async function sendImage(sock, jid, fileName, caption = '') {
  const filePath = findImagePath(fileName)

  if (!filePath) {
    console.warn(`[WARN] Imagem nao encontrada: ${fileName}`)
    return sendMsg(sock, jid, {
      text: caption || 'Imagem indisponivel no momento.'
    })
  }

  const imageBuffer = fs.readFileSync(filePath)
  return sock.sendMessage(jid, { image: imageBuffer, caption })
}

module.exports = { sendMsg, sendImage, normalize }
