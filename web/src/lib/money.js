// Portado de static/app.js:456-463.

export function parseBRL(text) {
  const match = String(text || '').match(/[\d.]+,\d{2}/)
  return match ? Number(match[0].replace(/\./g, '').replace(',', '.')) : null
}

export function formatBRL(value) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
