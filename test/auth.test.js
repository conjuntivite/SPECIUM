const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hashPassword, verifyPassword, generateSessionToken,
  serializeSessionCookie, serializeClearSessionCookie,
} = require('../lib/auth');

test('hashes a password with a random salt and verifies it back correctly', () => {
  const stored = hashPassword('correct horse battery staple');
  assert.match(stored, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.equal(verifyPassword('correct horse battery staple', stored), true);
  assert.equal(verifyPassword('wrong password', stored), false);
});

test('two hashes of the same password use different salts', () => {
  const first = hashPassword('same-password');
  const second = hashPassword('same-password');
  assert.notEqual(first, second);
});

test('rejects a malformed stored hash instead of throwing', () => {
  assert.equal(verifyPassword('anything', 'not-a-valid-hash'), false);
  assert.equal(verifyPassword('anything', ''), false);
});

test('generates a session token as 64 hex characters', () => {
  const token = generateSessionToken();
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.notEqual(token, generateSessionToken());
});

test('serializes the session cookie as HttpOnly and SameSite=Lax', () => {
  const cookie = serializeSessionCookie('abc123');
  assert.match(cookie, /^session=abc123;/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
});

test('clears the session cookie with Max-Age=0', () => {
  assert.match(serializeClearSessionCookie(), /^session=;.*Max-Age=0/);
});

test('validateUserUpdateRequest: foto aceita data URL png/jpeg/webp, null remove, recusa SVG/URL/arquivo grande', () => {
  const { validateUserUpdateRequest } = require('../lib/validators');
  assert.deepEqual(validateUserUpdateRequest({ avatar: 'data:image/jpeg;base64,/9j/4AAQ==' }), { avatar: 'data:image/jpeg;base64,/9j/4AAQ==' });
  assert.deepEqual(validateUserUpdateRequest({ avatar: null }), { avatar: null });
  assert.throws(() => validateUserUpdateRequest({ avatar: 'data:image/svg+xml;base64,PHN2Zz4=' }));
  assert.throws(() => validateUserUpdateRequest({ avatar: 'https://exemplo.com/foto.png' }));
  assert.throws(() => validateUserUpdateRequest({ avatar: `data:image/png;base64,${'A'.repeat(200_001)}` }));
});

test('permissão por tela: admin e conta sem lista acessam tudo; lista restringe; validação só aceita telas conhecidas', () => {
  const { canAccessScreen } = require('../lib/auth');
  const { validateUserUpdateRequest } = require('../lib/validators');
  assert.equal(canAccessScreen(null, 'budget'), false);
  assert.equal(canAccessScreen({ role: 'admin', screens: [] }, 'products'), true);
  assert.equal(canAccessScreen({ role: 'user', screens: null }, 'products'), true);
  assert.equal(canAccessScreen({ role: 'user', screens: ['budget'] }, 'products'), false);
  assert.equal(canAccessScreen({ role: 'user', screens: ['quote-audit'] }, 'products', 'quote-audit'), true);
  assert.deepEqual(validateUserUpdateRequest({ screens: ['budget', 'budget', 'search'] }), { screens: ['budget', 'search'] });
  assert.deepEqual(validateUserUpdateRequest({ screens: [] }), { screens: [] });
  assert.throws(() => validateUserUpdateRequest({ screens: ['users'] }));
  assert.throws(() => validateUserUpdateRequest({ screens: 'budget' }));
});

test('token de redefinição: 64 hex, só o hash vai pro banco, e o pedido é limitado a 3 por e-mail a cada 15 min', () => {
  const { generateResetToken, hashResetToken, allowResetRequest } = require('../lib/passwordReset');
  const { token, tokenHash } = generateResetToken();
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(tokenHash, hashResetToken(token));
  assert.notEqual(tokenHash, token);
  const t0 = 1_000_000;
  assert.deepEqual([1, 2, 3, 4].map(() => allowResetRequest('a@x.com', t0)), [true, true, true, false]);
  assert.equal(allowResetRequest('b@x.com', t0), true);
  assert.equal(allowResetRequest('a@x.com', t0 + 15 * 60 * 1000 + 1), true);
});

test('validateResetRequest exige token de 64 hex e senha de 8+ caracteres', () => {
  const { validateResetRequest, validateEmailRequest } = require('../lib/validators');
  const token = 'a'.repeat(64);
  assert.deepEqual(validateResetRequest({ token, password: 'senha12345' }), { token, password: 'senha12345' });
  assert.throws(() => validateResetRequest({ token, password: 'curta' }));
  assert.throws(() => validateResetRequest({ token: 'xyz', password: 'senha12345' }));
  assert.deepEqual(validateEmailRequest({ email: ' Ana@Exemplo.com ' }), { email: 'ana@exemplo.com' });
  assert.throws(() => validateEmailRequest({ email: 'sem-arroba' }));
});

test('sendResetEmail entrega o link ao transporte configurado', async () => {
  const { sendResetEmail, setMailTransport } = require('../lib/mailer');
  const sent = [];
  setMailTransport({ sendMail: async (m) => sent.push(m) });
  await sendResetEmail('ana@exemplo.com', 'http://x/?reset=abc');
  setMailTransport(null);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'ana@exemplo.com');
  assert.match(sent[0].text, /http:\/\/x\/\?reset=abc/);
});
