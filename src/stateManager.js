// Todos os estados possiveis
const STATES = {
  IDLE:           'idle',
  AWAITING_CITY:  'awaiting_city',
  AWAITING_FICHA: 'awaiting_ficha',
  FILLING_FORM:   'filling_form',
  COMPLETED:      'completed'
}

// getState e setState agora recebem tenantId como primeiro parametro
// e estao implementados diretamente em database.js para evitar
// dependencias circulares — este arquivo so exporta as constantes.

module.exports = { STATES }