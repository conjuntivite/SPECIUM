const nodemailer = require('nodemailer');

// Transporte injetável (testes trocam por um fake, como setAmazonBrowserLauncher em lib/providers/amazon).
let transport = null;
function setMailTransport(t) { transport = t; }

function getTransport() {
  if (transport) return transport;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  // 587 + STARTTLS (Outlook/Microsoft 365: smtp.office365.com).
  transport = nodemailer.createTransport({
    host: SMTP_HOST, port: Number(SMTP_PORT || 587), secure: false, requireTLS: true, auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transport;
}

async function sendResetEmail(to, link) {
  const t = getTransport();
  if (!t) {
    console.log(`[mailer] SMTP não configurado. Link de redefinição para ${to}: ${link}`);
    return;
  }
  await t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'SPECIUM — redefinição de senha',
    text: `Recebemos um pedido para redefinir sua senha.\n\nAbra o link (válido por 1 hora):\n${link}\n\nSe não foi você, ignore este e-mail.`,
    html: `<p>Recebemos um pedido para redefinir sua senha.</p><p><a href="${link}">Redefinir senha</a> (válido por 1 hora)</p><p>Se não foi você, ignore este e-mail.</p>`,
  });
}

module.exports = { sendResetEmail, setMailTransport };
