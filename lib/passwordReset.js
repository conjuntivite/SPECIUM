const crypto = require('node:crypto');

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hora
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 3;

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// O token vai no link do e-mail; só o hash é gravado (vazamento do banco não entrega links válidos).
function generateResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: hashResetToken(token) };
}

// ponytail: contador em memória (zera ao reiniciar; uma instância só). Se hospedar com várias, mover pro Mongo.
const hits = new Map();
function allowResetRequest(email, now = Date.now()) {
  const recent = (hits.get(email) || []).filter((t) => now - t < RATE_WINDOW_MS);
  const allowed = recent.length < RATE_MAX;
  if (allowed) recent.push(now);
  hits.set(email, recent);
  return allowed;
}

module.exports = { RESET_TTL_MS, hashResetToken, generateResetToken, allowResetRequest };
