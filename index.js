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
      res.json({ ok: true, status: getStatus() })
    } catch (err) {
      console.error('[ERRO] /reconnect:', err.message)
      res.status(500).json({ error: 'Erro ao reconectar', detail: err.message })
    }
  })

  app.get('/qr-image', (_req, res) => {
    const qr = getQR()
    if (!qr) return res.send('<p>Sem QR Code disponivel. Bot ja conectado ou aguardando conexao.</p>')
    res.send(`<img src="${qr}" width="300" />`)
  })

  app.get('/qr', (_req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="pt-br">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Painel WhatsApp Bot</title>
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              gap: 16px;
              background: #f5f5f5;
              margin: 0;
              padding: 20px;
            }
            h1 { margin: 0; font-size: 1.4rem; color: #333; }
            .buttons { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
            button {
              padding: 10px 20px;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-size: 1rem;
              background: #25D366;
              color: white;
              transition: opacity .2s;
            }
            button:hover { opacity: .85; }
            button.secondary { background: #555; }
            #status-box {
              font-size: 1.2rem;
              font-weight: bold;
              padding: 12px 24px;
              border-radius: 8px;
              background: white;
              box-shadow: 0 2px 8px rgba(0,0,0,.1);
            }
            #qr-container img { border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
            #instructions { color: #666; font-size: .9rem; text-align: center; }
          </style>
        </head>
        <body>
          <h1>📱 Painel WhatsApp Bot</h1>
          <div class="buttons">
            <button onclick="loadQR()">QR Code</button>
            <button class="secondary" onclick="loadStatus()">Status</button>
            <button class="secondary" onclick="reconnect()">Reconectar</button>
          </div>
          <div id="status-box">Carregando...</div>
          <div id="qr-container"></div>
          <p id="instructions"></p>

          <script>
            let pollInterval = null

            async function loadStatus() {
              clearInterval(pollInterval)
              const res = await fetch('/status')
              const data = await res.json()
              const statusEl = document.getElementById('status-box')
              const qrEl = document.getElementById('qr-container')
              const instrEl = document.getElementById('instructions')
              qrEl.innerHTML = ''
              if (data.status === 'open') {
                statusEl.innerText = '✅ Conectado'
                instrEl.innerText = 'Bot funcionando normalmente'
              } else if (data.status === 'connecting') {
                statusEl.innerText = '⏳ Conectando...'
                instrEl.innerText = data.hasQR ? 'QR disponivel — clique em "QR Code"' : 'Aguardando QR Code...'
              } else {
                statusEl.innerText = '❌ Desconectado'
                instrEl.innerText = 'Clique em "Reconectar" para tentar novamente'
              }
            }

            async function loadQR() {
              const statusEl = document.getElementById('status-box')
              const qrEl = document.getElementById('qr-container')
              const instrEl = document.getElementById('instructions')

              const qrRes = await fetch('/qr-image')
              const html = await qrRes.text()
              qrEl.innerHTML = html

              if (html.includes('<img')) {
                statusEl.innerText = '📲 Escaneie o QR Code'
                instrEl.innerText = 'WhatsApp → Aparelhos conectados → Conectar dispositivo'
                // Atualiza QR automaticamente a cada 20s (expira em 60s)
                clearInterval(pollInterval)
                pollInterval = setInterval(loadQR, 20000)
              } else {
                loadStatus()
              }
            }

            async function reconnect() {
              document.getElementById('status-box').innerText = '⏳ Reconectando...'
              document.getElementById('qr-container').innerHTML = ''
              try {
                await fetch('/reconnect')
                setTimeout(loadStatus, 2000)
              } catch {
                document.getElementById('status-box').innerText = '❌ Erro ao reconectar'
              }
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
    const data = getFormData(req.params.phone)
    if (!data || Object.keys(data).length === 0) {
      return res.status(404).json({ error: 'Ficha nao encontrada' })
    }
    res.json(data)
  })

  app.get('/', (_req, res) => {
    res.json({ status: 'Bot rodando', connectionStatus: getStatus() })
  })

  return app
}

async function main() {
  initDb()
  await connectToWhatsApp()

  const app = createServer()
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Painel disponivel em http://localhost:${PORT}/qr`)
    console.log(`Leads:   http://localhost:${PORT}/leads`)
    console.log(`Status:  http://localhost:${PORT}/status`)
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