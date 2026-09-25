const crypto = require('node:crypto');

// AES-256-GCM (stdlib) com chave derivada de SETTINGS_SECRET (.env, fora do banco). Formato
// armazenado "iv:tag:dados", tudo hex. Usado pra guardar a senha do SMTP no Mongo.
function getKey() {
  const secret = process.env.SETTINGS_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('Defina SETTINGS_SECRET (mínimo 16 caracteres) no .env e reinicie o servidor para salvar a senha do SMTP.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptSecret(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${data.toString('hex')}`;
}

function decryptSecret(stored) {
  const [iv, tag, data] = String(stored || '').split(':');
  if (!iv || !tag || !data) throw new Error('Senha do SMTP armazenada em formato inválido.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  try {
    return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Não foi possível decifrar a senha do SMTP (SETTINGS_SECRET mudou?). Salve a senha novamente.');
  }
}

module.exports = { encryptSecret, decryptSecret };
