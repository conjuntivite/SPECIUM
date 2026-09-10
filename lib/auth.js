const crypto = require('node:crypto');

// scrypt (stdlib, sem bcrypt) — formato armazenado "salt:hash", ambos hex.
const SCRYPT_KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, 'hex');
  const candidateBuffer = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return hashBuffer.length === candidateBuffer.length && crypto.timingSafeEqual(hashBuffer, candidateBuffer);
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

const SESSION_COOKIE_NAME = 'session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

// Sem `Secure`: dev roda em HTTP. Ao publicar atrás de HTTPS, adicionar a flag.
function serializeSessionCookie(token) {
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

function serializeClearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  serializeSessionCookie,
  serializeClearSessionCookie,
};
