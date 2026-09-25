const nodemailer = require('nodemailer');
const { getSmtpSettings } = require('../db');
const { decryptSecret } = require('./secretBox');

// Transporte injetável (testes trocam por um fake, como setAmazonBrowserLauncher em lib/providers/amazon).
let injected = null;
function setMailTransport(t) { injected = t; }

// Lê a configuração salva na tela "E-mail (SMTP)" a cada envio (mudar lá vale na hora, sem reiniciar).
// null = SMTP ainda não configurado.
async function loadTransport() {
  if (injected) return { transport: injected, from: 'teste@localhost' };
  const cfg = await getSmtpSettings();
  if (!cfg) return null;
  const transport = nodemailer.createTransport({
    host: cfg.host, port: cfg.port, secure: cfg.security === 'ssl', requireTLS: cfg.security === 'starttls',
    auth: { user: cfg.user, pass: decryptSecret(cfg.pass) },
  });
  return { transport, from: cfg.from || cfg.user };
}

async function sendResetEmail(to, link) {
  const loaded = await loadTransport();
  if (!loaded) {
    console.log(`[mailer] SMTP não configurado. Link de redefinição para ${to}: ${link}`);
    return;
  }
  await loaded.transport.sendMail({
    from: loaded.from,
    to,
    subject: 'SPECIUM — redefinição de senha',
    text: `Recebemos um pedido para redefinir sua senha.\n\nAbra o link (válido por 1 hora):\n${link}\n\nSe não foi você, ignore este e-mail.`,
    html: `<p>Recebemos um pedido para redefinir sua senha.</p><p><a href="${link}">Redefinir senha</a> (válido por 1 hora)</p><p>Se não foi você, ignore este e-mail.</p>`,
  });
}

// Botão "Enviar e-mail de teste" da tela de SMTP: diferente do reset, não engole o erro — o admin precisa ver o motivo.
async function sendTestEmail(to) {
  const loaded = await loadTransport();
  if (!loaded) throw new Error('Configure e salve o SMTP antes de enviar um teste.');
  await loaded.transport.sendMail({
    from: loaded.from,
    to,
    subject: 'SPECIUM — teste de e-mail',
    text: 'Se você recebeu esta mensagem, o envio de e-mails do SPECIUM está funcionando.',
  });
}

module.exports = { sendResetEmail, sendTestEmail, setMailTransport };
