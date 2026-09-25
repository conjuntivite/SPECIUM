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

test('token de redefinição: 64 hex, só o hash vai pro banco; pedido tem intervalo mínimo de 60 s e limite de 3 por 15 min', () => {
  const { generateResetToken, hashResetToken, allowResetRequest } = require('../lib/passwordReset');
  const { token, tokenHash } = generateResetToken();
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(tokenHash, hashResetToken(token));
  assert.notEqual(tokenHash, token);
  const t0 = 1_000_000;
  const s = 1000;
  assert.equal(allowResetRequest('a@x.com', t0), true);
  assert.equal(allowResetRequest('a@x.com', t0), false); // duplo clique
  assert.equal(allowResetRequest('a@x.com', t0 + 59 * s), false);
  assert.equal(allowResetRequest('a@x.com', t0 + 60 * s), true);
  assert.equal(allowResetRequest('a@x.com', t0 + 120 * s), true);
  assert.equal(allowResetRequest('a@x.com', t0 + 180 * s), false); // 4º na janela de 15 min
  assert.equal(allowResetRequest('b@x.com', t0), true);
  assert.equal(allowResetRequest('a@x.com', t0 + 15 * 60 * s + 1), true);
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

test('secretBox: criptografa e decifra a senha do SMTP; sem SETTINGS_SECRET (ou adulterada) falha', () => {
  const { encryptSecret, decryptSecret } = require('../lib/secretBox');
  const previous = process.env.SETTINGS_SECRET;
  process.env.SETTINGS_SECRET = 'segredo-de-teste-com-16+';
  try {
    const stored = encryptSecret('minha-senha-smtp');
    assert.doesNotMatch(stored, /minha-senha-smtp/);
    assert.notEqual(stored, encryptSecret('minha-senha-smtp'));
    assert.equal(decryptSecret(stored), 'minha-senha-smtp');
    const [iv, tag, data] = stored.split(':');
    assert.throws(() => decryptSecret(`${iv}:${tag}:${data.replace(/.$/, (c) => (c === '0' ? '1' : '0'))}`));
    process.env.SETTINGS_SECRET = 'outro-segredo-de-16-chars';
    assert.throws(() => decryptSecret(stored));
    delete process.env.SETTINGS_SECRET;
    assert.throws(() => encryptSecret('x'), /SETTINGS_SECRET/);
  } finally {
    if (previous === undefined) delete process.env.SETTINGS_SECRET; else process.env.SETTINGS_SECRET = previous;
  }
});

test('validateSmtpSettingsRequest: host, porta, segurança e remetente; senha é opcional (vazia mantém a anterior)', () => {
  const { validateSmtpSettingsRequest } = require('../lib/validators');
  const base = { host: ' mail.invicco.com.br ', port: '465', security: 'ssl', user: 'sistema@invicco.com.br', from: '', password: '' };
  assert.deepEqual(validateSmtpSettingsRequest(base), { host: 'mail.invicco.com.br', port: 465, security: 'ssl', user: 'sistema@invicco.com.br', from: 'sistema@invicco.com.br', password: '' });
  assert.equal(validateSmtpSettingsRequest({ ...base, security: 'starttls', port: 587, password: 'abc' }).password, 'abc');
  assert.throws(() => validateSmtpSettingsRequest({ ...base, host: '' }));
  assert.throws(() => validateSmtpSettingsRequest({ ...base, host: 'com espaço' }));
  assert.throws(() => validateSmtpSettingsRequest({ ...base, port: 70000 }));
  assert.throws(() => validateSmtpSettingsRequest({ ...base, security: 'nenhuma' }));
  assert.throws(() => validateSmtpSettingsRequest({ ...base, user: '' }));
  assert.throws(() => validateSmtpSettingsRequest({ ...base, from: 'sem-arroba' }));
});
