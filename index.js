require('dotenv').config()

const express = require('express')

const { initDb, getAllLeads, getFormData } = require('./src/database')
const { connectToWhatsApp, getQR, getStatus } = require('./src/connection')


const PORT = Number(process.env.PORT) || 3000

function createServer() {
  const app = express()

  app.use(express.json())


  app.get('/status', (_req, res) => {
    res.json({
      status: getStatus(),
      hasQR: !!getQR()
    })
  })


  app.get('/reconnect', async (_req, res) => {
    try {
      await connectToWhatsApp()
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: 'Erro ao reconectar' })
    }
  })


  app.get('/qr-image', (_req, res) => {
    const qr = getQR()

    if (!qr) {
      return res.send('')
    }

    res.send(`<img src="${qr}" width="300" />`)
  })


  app.get('/qr', (_req, res) => {
    res.send(`
      <html>
        <head>
          <title>Painel WhatsApp</title>
        </head>
        <body style="font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:20px;">
          
          <div>
            <button onclick="goQR()">QR Code</button>
            <button onclick="goStatus()">Status</button>
            <button onclick="reconnect()">Reconectar</button>
          </div>

          <h2 id="status">Carregando...</h2>
          <div id="qr-container"></div>
          <p id="instructions"></p>

          <script>
            function goQR() {
              loadQR()
            }

            function goStatus() {
              loadStatus()
            }

            async function reconnect() {
              await fetch('/reconnect')
              alert('Tentando reconectar...')
            }

            async function loadStatus() {
              const res = await fetch('/status')
              const data = await res.json()

              const statusEl = document.getElementById('status')
              const qrContainer = document.getElementById('qr-container')
              const instructions = document.getElementById('instructions')

              qrContainer.innerHTML = ''

              if (data.status === 'open') {
                statusEl.innerText = '✅ Conectado'
                instructions.innerText = 'Bot funcionando normalmente'
              } else if (data.status === 'connecting') {
                statusEl.innerText = '⏳ Conectando...'
                instructions.innerText = 'Aguarde ou vá para QR Code'
              } else {
                statusEl.innerText = '❌ Desconectado'
                instructions.innerText = 'Clique em QR Code para reconectar'
              }
            }

            async function loadQR() {
              const qrRes = await fetch('/qr-image')
              const html = await qrRes.text()

              document.getElementById('qr-container').innerHTML = html
              document.getElementById('status').innerText = '📲 Escaneie o QR Code'
              document.getElementById('instructions').innerText =
                'WhatsApp > Aparelhos conectados > Conectar dispositivo'
            }

            loadStatus()
          </script>
        </body>
      </html>
    `)
  })

  app.get('/leads', (_req, res) => {
    res.json(getAllLeads())
  })

  app.get('/ficha/:phone', (req, res) => {
    res.json(getFormData(req.params.phone))
  })

  app.get('/', (_req, res) => {
    res.json({ status: 'Bot rodando' })
  })

  return app
}

async function main() {
  initDb()
  await connectToWhatsApp()

  const app = createServer()
  app.listen(PORT, () => {
    console.log(`Painel disponivel em http://localhost:${PORT}`)
    console.log(`Leads: http://localhost:${PORT}/leads`)
  })
}

process.on('unhandledRejection', err => {
  console.error('[ERRO] Rejeicao nao tratada:', err)
})

process.on('uncaughtException', err => {
  console.error('[ERRO] Excecao nao tratada:', err)
})

main().catch(err => {
  console.error('[ERRO] Falha ao iniciar a aplicacao:', err)
  process.exitCode = 1
})
