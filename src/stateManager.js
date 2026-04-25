const { getDb } = require('./database')

// Todos os estados possíveis
const STATES = {
  IDLE:           'idle',
  AWAITING_CITY:  'awaiting_city',
  AWAITING_FICHA: 'awaiting_ficha',
  FILLING_FORM:   'filling_form',
  COMPLETED:      'completed'
}

// Campos da ficha em ordem (cada índice = uma pergunta)
const FORM_STEPS = [
  'nome', 'telefone', 'email',
  'end_residencial', 'end_comercial',
  'rg', 'cpf', 'cnpj',
  'valor', 'parcelas', 'conta_juridica',
  'tel_referencia',
  'fotos_cnh', 'comp_residencial',
  'selfie', 'video_comercio', 'instagram'
]

// Lê o estado atual do usuário
function getState(phone) {
  const db = getDb()
  return db.prepare(
    'SELECT * FROM user_state WHERE phone = ?'
  ).get(phone)
}

// Atualiza ou cria o estado do usuário
function setState(phone, state, formStep = 0) {
  const db = getDb()
  db.prepare(`
    INSERT INTO user_state (phone, state, form_step, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(phone) DO UPDATE SET
      state     = excluded.state,
      form_step = excluded.form_step,
      updated_at = excluded.updated_at
  `).run(phone, state, formStep)
}

module.exports = { STATES, FORM_STEPS, getState, setState }