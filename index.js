require('dotenv').config()

const express = require('express')

const {
  initDb,
  addTenant, deactivateTenant, getTenant,
  getAllTenants, getActiveTenants,
  getAllLeads, getFormData
} = require('./src/database')

const {
  connectTenant,
  disconnectTenant,
  reconnectTenant,
  startAllTenants,
  getStatus,
  getQR,
  getAllStatuses
} = require('./src/connection')

const PORT = Number(process.env.PORT) || 3000

function tenantPayload(tenant, statuses) {
  const runtime = statuses[tenant.id] || {}
  return {
    ...tenant,
    active: Boolean(tenant.active),
    status: runtime.status || 'disconnected',
    hasQR: Boolean(runtime.hasQR),
    qrUrl: runtime.hasQR ? `/api/tenants/${encodeURIComponent(tenant.id)}/qr-image` : null
  }
}

function assertTenant(id, res) {
  const tenant = getTenant(id)
  if (!tenant) {
    res.status(404).json({ error: 'Numero nao encontrado.' })
    return null
  }
  return tenant
}

function dashboardHtml() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dashboard WhatsApp Bot</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f6f8;
      --surface: #ffffff;
      --surface-soft: #eef4f2;
      --line: #dce3e6;
      --text: #172026;
      --muted: #60707a;
      --green: #178c55;
      --blue: #176fb8;
      --red: #bd3225;
      --gray: #59656d;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font-family: Arial, Helvetica, sans-serif; }
    button, input { font: inherit; }
    button { border: 0; border-radius: 6px; color: #fff; cursor: pointer; min-height: 36px; padding: 0 12px; white-space: nowrap; }
    button:disabled { cursor: wait; opacity: .62; }
    input { border: 1px solid var(--line); border-radius: 6px; min-height: 38px; min-width: 160px; padding: 0 11px; width: 100%; }
    .page { margin: 0 auto; max-width: 1180px; padding: 24px; }
    .topbar { align-items: center; display: flex; gap: 16px; justify-content: space-between; margin-bottom: 18px; }
    h1 { font-size: 1.45rem; font-weight: 700; line-height: 1.2; margin: 0; }
    .subtitle { color: var(--muted); font-size: .92rem; margin-top: 5px; }
    .grid { display: grid; gap: 14px; grid-template-columns: 1fr; }
    .panel { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 18px; }
    .panel-head { align-items: center; display: flex; gap: 12px; justify-content: space-between; margin-bottom: 14px; }
    h2 { font-size: 1rem; margin: 0; }
    .form-row { display: grid; gap: 10px; grid-template-columns: minmax(170px, 240px) minmax(200px, 1fr) auto; }
    .summary { display: grid; gap: 10px; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 14px; }
    .metric { background: var(--surface-soft); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
    .metric strong { display: block; font-size: 1.45rem; line-height: 1.1; }
    .metric span { color: var(--muted); display: block; font-size: .82rem; margin-top: 4px; }
    .table-wrap { overflow-x: auto; }
    table { border-collapse: collapse; min-width: 700px; width: 100%; }
    th, td { border-bottom: 1px solid var(--line); padding: 10px; text-align: left; vertical-align: middle; }
    th { color: var(--muted); font-size: .78rem; font-weight: 700; text-transform: uppercase; }
    code { background: #edf1f2; border-radius: 5px; padding: 2px 5px; }
    .actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .badge { border-radius: 999px; display: inline-flex; font-size: .78rem; font-weight: 700; line-height: 1; padding: 6px 9px; }
    .badge-open { background: #dff4e9; color: #0b6f3f; }
    .badge-connecting { background: #fff1cf; color: #7b4b00; }
    .badge-disconnected { background: #f6e2df; color: #8f261d; }
    .badge-paused { background: #e9eef1; color: #45525a; }
    .btn-green { background: var(--green); }
    .btn-blue { background: var(--blue); }
    .btn-red { background: var(--red); }
    .btn-gray { background: var(--gray); }
    .empty, .message { color: var(--muted); margin: 0; padding: 12px 0; }
    .message { min-height: 24px; padding: 10px 0 0; }
    .modal { align-items: center; background: rgba(10,16,20,.56); display: none; inset: 0; justify-content: center; padding: 20px; position: fixed; z-index: 10; }
    .modal.open { display: flex; }
    .modal-box { background: #fff; border-radius: 8px; max-width: 390px; padding: 22px; text-align: center; width: 100%; }
    .qr-frame { align-items: center; background: #f6f8f9; border: 1px solid var(--line); border-radius: 8px; display: flex; height: 300px; justify-content: center; margin: 16px auto 12px; width: 300px; }
    .qr-frame img { border-radius: 6px; height: 280px; width: 280px; }
    .muted { color: var(--muted); font-size: .88rem; }
    @media (max-width: 760px) {
      .page { padding: 16px; }
      .topbar, .panel-head { align-items: stretch; flex-direction: column; }
      .form-row, .summary { grid-template-columns: 1fr; }
      button { width: 100%; }
      .actions { display: grid; grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="topbar">
      <div>
        <h1>Dashboard WhatsApp Bot</h1>
        <div class="subtitle">Controle de conexao, QR Code e numeros cadastrados.</div>
      </div>
      <button class="btn-gray" id="refresh-btn" type="button">Atualizar</button>
    </header>

    <section class="summary" aria-label="Resumo das conexoes">
      <div class="metric"><strong id="metric-total">0</strong><span>Total</span></div>
      <div class="metric"><strong id="metric-open">0</strong><span>Conectados</span></div>
      <div class="metric"><strong id="metric-connecting">0</strong><span>Conectando</span></div>
      <div class="metric"><strong id="metric-paused">0</strong><span>Inativos</span></div>
    </section>

    <div class="grid">
      <section class="panel">
        <div class="panel-head"><h2>Adicionar numero</h2></div>
        <form class="form-row" id="tenant-form">
          <input id="tenant-id" name="id" autocomplete="off" placeholder="ID: vendas-sp" required pattern="[A-Za-z0-9_-]+" />
          <input id="tenant-label" name="label" autocomplete="off" placeholder="Nome: Vendas SP" />
          <button class="btn-green" type="submit">Adicionar e conectar</button>
        </form>
        <p class="message" id="form-message"></p>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Numeros</h2>
          <span class="muted" id="last-update">Aguardando dados</span>
        </div>
        <div id="tenants-list" class="table-wrap">
          <p class="empty">Carregando numeros...</p>
        </div>
      </section>


    </div>
  </main>

  <div class="modal" id="qr-modal" role="dialog" aria-modal="true" aria-labelledby="qr-title">
    <div class="modal-box">
      <h2 id="qr-title">QR Code</h2>
      <div class="qr-frame" id="qr-content">
        <span class="muted">Aguardando QR Code...</span>
      </div>
      <p class="muted">Abra o WhatsApp, entre em aparelhos conectados e leia este codigo.</p>
      <button class="btn-gray" id="close-qr" type="button">Fechar</button>
    </div>
  </div>

  <script>
    const state = { tenants: [], qrTenantId: null, qrTimer: null, busy: false }
    const $ = selector => document.querySelector(selector)

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
    }

    function statusLabel(status, active) {
      if (!active) return 'inativo'
      if (status === 'open') return 'conectado'
      if (status === 'connecting') return 'conectando'
      return 'desconectado'
    }

    function statusClass(status, active) {
      if (!active) return 'badge-paused'
      if (status === 'open') return 'badge-open'
      if (status === 'connecting') return 'badge-connecting'
      return 'badge-disconnected'
    }

    function setMessage(text, isError = false) {
      const el = $('#form-message')
      el.textContent = text || ''
      el.style.color = isError ? '#bd3225' : '#60707a'
    }

    async function requestJson(url, options = {}) {
      const response = await fetch(url, options)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Falha na requisicao.')
      return payload
    }

    async function loadTenants() {
      const data = await requestJson('/api/tenants')
      state.tenants = data
      renderTenants(data)
      renderSummary(data)
      $('#last-update').textContent = 'Atualizado agora'
    }

    function renderSummary(tenants) {
      $('#metric-total').textContent = tenants.length
      $('#metric-open').textContent = tenants.filter(t => t.active && t.status === 'open').length
      $('#metric-connecting').textContent = tenants.filter(t => t.active && t.status === 'connecting').length
      $('#metric-paused').textContent = tenants.filter(t => !t.active).length
    }

    function renderTenants(tenants) {
      const host = $('#tenants-list')
      if (!tenants.length) {
        host.innerHTML = '<p class="empty">Nenhum numero cadastrado.</p>'
        return
      }

      host.innerHTML = '<table><thead><tr>' +
        '<th>ID</th><th>Nome</th><th>Status</th><th>QR Code</th><th>Acoes</th>' +
        '</tr></thead><tbody>' +
        tenants.map(t => {
          const id = escapeHtml(t.id)
          const label = escapeHtml(t.label || '-')
          const badge = '<span class="badge ' + statusClass(t.status, t.active) + '">' + statusLabel(t.status, t.active) + '</span>'
          const qrBtn = t.hasQR
            ? '<button class="btn-blue" data-action="qr" data-id="' + id + '">Ver QR</button>'
            : '<span class="muted">—</span>'
          const connectText = t.active ? 'Conectar' : 'Reativar'

          return '<tr>' +
            '<td><code>' + id + '</code></td>' +
            '<td>' + label + '</td>' +
            '<td>' + badge + '</td>' +
            '<td>' + qrBtn + '</td>' +
            '<td><div class="actions">' +
              '<button class="btn-green" data-action="connect" data-id="' + id + '">' + connectText + '</button>' +
              '<button class="btn-blue" data-action="reset" data-id="' + id + '">Novo QR</button>' +
              '<button class="btn-red" data-action="remove" data-id="' + id + '">Desativar</button>' +
            '</div></td>' +
          '</tr>'
        }).join('') +
        '</tbody></table>'
    }

    async function refreshAll() {
      if (state.busy) return
      state.busy = true
      $('#refresh-btn').disabled = true
      try {
        await loadTenants()
      } catch (err) {
        setMessage(err.message, true)
      } finally {
        state.busy = false
        $('#refresh-btn').disabled = false
      }
    }

    async function addTenant(event) {
      event.preventDefault()
      const id = $('#tenant-id').value.trim()
      const label = $('#tenant-label').value.trim()
      if (!id) { setMessage('Informe um ID para o numero.', true); return }
      try {
        await requestJson('/api/tenants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, label })
        })
        $('#tenant-id').value = ''
        $('#tenant-label').value = ''
        setMessage('Numero cadastrado. Aguarde o QR Code aparecer na lista.')
        await refreshAll()
      } catch (err) {
        setMessage(err.message, true)
      }
    }

    async function runAction(action, id) {
      const encoded = encodeURIComponent(id)
      if (action === 'remove' && !confirm('Desativar "' + id + '"? A conexao sera encerrada.')) return
      if (action === 'reset' && !confirm('Gerar um novo QR para "' + id + '"? A sessao atual sera limpa.')) return

      const routes = {
        connect: ['/api/tenants/' + encoded + '/connect', 'POST'],
        reset:   ['/api/tenants/' + encoded + '/reset-session', 'POST'],
        remove:  ['/api/tenants/' + encoded, 'DELETE']
      }

      const route = routes[action]
      if (!route) return

      try {
        await requestJson(route[0], { method: route[1] })
        await refreshAll()
        if (action === 'reset' || action === 'connect') setTimeout(refreshAll, 2500)
      } catch (err) {
        setMessage(err.message, true)
      }
    }

    async function openQR(id) {
      state.qrTenantId = id
      $('#qr-title').textContent = 'QR Code - ' + id
      $('#qr-modal').classList.add('open')
      await refreshQR()
      clearInterval(state.qrTimer)
      state.qrTimer = setInterval(refreshQR, 5000)
    }

    async function refreshQR() {
      if (!state.qrTenantId) return
      const response = await fetch('/api/tenants/' + encodeURIComponent(state.qrTenantId) + '/qr-image')
      const html = await response.text()
      $('#qr-content').innerHTML = html || '<span class="muted">QR indisponivel. Clique em Novo QR para gerar.</span>'
    }

    function closeQR() {
      clearInterval(state.qrTimer)
      state.qrTimer = null
      state.qrTenantId = null
      $('#qr-modal').classList.remove('open')
    }

    $('#tenant-form').addEventListener('submit', addTenant)
    $('#refresh-btn').addEventListener('click', refreshAll)
    $('#close-qr').addEventListener('click', closeQR)
    $('#qr-modal').addEventListener('click', event => {
      if (event.target === event.currentTarget) closeQR()
    })

    $('#tenants-list').addEventListener('click', event => {
      const button = event.target.closest('button[data-action]')
      if (!button) return
      const action = button.dataset.action
      const id = button.dataset.id
      if (action === 'qr') { openQR(id); return }
      runAction(action, id)
    })

    refreshAll()
    setInterval(loadTenants, 12000)
  </script>
</body>
</html>`
}

function createServer() {
  const app = express()
  app.use(express.json())

  app.get('/', (_req, res) => res.redirect('/dashboard'))

  app.get('/dashboard', (_req, res) => {
    res.type('html').send(dashboardHtml())
  })

  app.get('/api/tenants', (_req, res) => {
    const statuses = getAllStatuses()
    res.json(getAllTenants().map(tenant => tenantPayload(tenant, statuses)))
  })

  app.post('/api/tenants', async (req, res) => {
    const { id, label } = req.body
    const tenantId = String(id || '').trim()
    if (!tenantId || !/^[A-Za-z0-9_-]+$/.test(tenantId)) {
      return res.status(400).json({ error: 'ID invalido. Use apenas letras, numeros, _ ou -.' })
    }
    addTenant(tenantId, String(label || '').trim())
    connectTenant(tenantId).catch(err => {
      console.error(`[${tenantId}] Erro ao conectar apos cadastro:`, err.message)
    })
    res.status(201).json({ ok: true, id: tenantId })
  })

  app.post('/api/tenants/:id/connect', async (req, res) => {
    const tenant = assertTenant(req.params.id, res)
    if (!tenant) return
    addTenant(tenant.id, tenant.label || '')
    try {
      await connectTenant(tenant.id)
      res.json({ ok: true, status: getStatus(tenant.id) })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.post('/api/tenants/:id/disconnect', async (req, res) => {
    const tenant = assertTenant(req.params.id, res)
    if (!tenant) return
    try {
      await disconnectTenant(tenant.id)
      res.json({ ok: true, status: getStatus(tenant.id) })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.post('/api/tenants/:id/reconnect', async (req, res) => {
    const tenant = assertTenant(req.params.id, res)
    if (!tenant) return
    addTenant(tenant.id, tenant.label || '')
    try {
      await reconnectTenant(tenant.id)
      res.json({ ok: true, status: getStatus(tenant.id) })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.post('/api/tenants/:id/reset-session', async (req, res) => {
    const tenant = assertTenant(req.params.id, res)
    if (!tenant) return
    addTenant(tenant.id, tenant.label || '')
    try {
      await reconnectTenant(tenant.id, { resetSession: true })
      res.json({ ok: true, status: getStatus(tenant.id) })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.delete('/api/tenants/:id', async (req, res) => {
    const tenant = assertTenant(req.params.id, res)
    if (!tenant) return
    deactivateTenant(tenant.id)
    await disconnectTenant(tenant.id)
    res.json({ ok: true })
  })

  app.get('/api/tenants/:id/status', (req, res) => {
    const tenant = assertTenant(req.params.id, res)
    if (!tenant) return
    res.json({ id: tenant.id, active: Boolean(tenant.active), status: getStatus(tenant.id), hasQR: Boolean(getQR(tenant.id)) })
  })

  app.get('/api/tenants/:id/qr-image', (req, res) => {
    const qr = getQR(req.params.id)
    if (!qr) return res.type('html').send('')
    res.type('html').send(`<img src="${qr}" width="280" height="280" alt="QR Code WhatsApp" />`)
  })

  app.get('/api/leads', (req, res) => {
    res.json(getAllLeads(req.query.tenant || null))
  })

  app.get('/api/tenants/:id/ficha/:phone', (req, res) => {
    const data = getFormData(req.params.id, req.params.phone)
    if (!Object.keys(data).length) {
      return res.status(404).json({ error: 'Ficha nao encontrada.' })
    }
    res.json(data)
  })

  app.get('/leads', (_req, res) => res.redirect('/api/leads'))

  return app
}

async function main() {
  initDb()
  const active = getActiveTenants()
  if (active.length === 0) {
    console.log('[MANAGER] Nenhum numero ativo. Acesse o dashboard para adicionar numeros.')
  } else {
    console.log(`[MANAGER] Iniciando ${active.length} tenant(s)...`)
    await startAllTenants(active)
  }
  const app = createServer()
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  Dashboard: http://localhost:${PORT}/dashboard`)
    console.log(`  API:       http://localhost:${PORT}/api/tenants`)
    console.log(`  Leads:     http://localhost:${PORT}/api/leads\n`)
  })
}

process.on('unhandledRejection', err => { console.error('[ERRO] Rejeicao nao tratada:', err) })
process.on('uncaughtException', err => { console.error('[ERRO] Excecao nao tratada:', err) })

main().catch(err => {
  console.error('[ERRO] Falha ao iniciar:', err)
  process.exitCode = 1
})
