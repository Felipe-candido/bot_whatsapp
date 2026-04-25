require('dotenv').config()

const express = require('express')

const { initDb, getAllLeads, getFormData } = require('./src/database')
const { connectToWhatsApp } = require('./src/connection')

const PORT = Number(process.env.PORT) || 3000

function createServer() {
  const app = express()

  app.use(express.json())

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
