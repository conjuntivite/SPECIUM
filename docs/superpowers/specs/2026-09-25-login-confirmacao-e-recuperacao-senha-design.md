# Login: confirmar senha + recuperação de senha por e-mail

## Objetivo
1. No cadastro, pedir a senha duas vezes (senha + confirmar senha).
2. Permitir recuperar a senha por e-mail (SMTP Outlook/Microsoft 365).

## Decisões
- Sistema ainda não hospedado: `APP_URL` default `http://localhost:8000`; trocar no `.env` ao publicar.
- Credenciais SMTP só no `.env` (fora do git). `SMTP_FROM` deve ser o mesmo e-mail de `SMTP_USER` (limitação do Outlook).
- Única dependência nova: `nodemailer` (o Node não tem cliente SMTP na stdlib).
- Fora do escopo: troca de senha logado, verificação de e-mail no cadastro.

## 1. Confirmar senha (front)
`web/src/components/auth/LoginView.jsx`, modo "Criar conta":
- Segundo campo "Confirmar senha" (mesmo padrão do campo de senha, com mostrar/ocultar; ausente no modo login).
- Senhas diferentes: aviso "As senhas não coincidem" e botão desabilitado.
- Servidor inalterado (continua recebendo só `password`).

## 2. Recuperação de senha
### Telas (mesma `LoginView`, novos modos)
- `forgot`: link "Esqueci minha senha" (modo login) → campo e-mail. Resposta sempre igual: "Se o e-mail existir, enviamos o link" (não revela contas).
- `reset`: aberto por `APP_URL/?reset=<token>` → nova senha + confirmar (mín. 8). Sucesso → login automático.

### API
- `POST /api/auth/forgot` `{ email }` → 200 sempre. Se o usuário existe: gera token e envia e-mail.
- `POST /api/auth/reset` `{ token, password }` → valida token, troca o hash, apaga todas as sessões do usuário, cria sessão nova (cookie) e devolve o usuário. Token inválido/expirado/usado → erro "Link inválido ou expirado."

### Token
- 32 bytes aleatórios (hex) enviados no link; no banco só o SHA-256.
- Coleção `password_resets`: `{ _id: hash, userId, expiresAt }`, índice TTL em `expiresAt`. Validade 1 h, uso único (removido ao usar). Novo pedido apaga os anteriores do usuário.
- Limite em memória: 3 pedidos por e-mail / 15 min (excedente responde 200 sem enviar).

### E-mail (`lib/mailer.js`)
- `nodemailer`, `smtp.office365.com:587` STARTTLS. Env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `APP_URL`.
- Sem SMTP configurado: imprime o link no console (dev) em vez de falhar.
- Falha de envio: loga o erro no servidor; a resposta ao cliente continua genérica.
- Observação Microsoft 365: "SMTP autenticado" precisa estar habilitado na caixa (e senha de app se houver MFA); erro típico `535 5.7.139`.

## Arquivos
`lib/mailer.js` (novo), `server.js` (2 rotas), `db.js` (helpers de `password_resets` + trocar senha + apagar sessões do usuário), `lib/validators.js` (validar reset), `web/src/hooks/useAuth.js` + `web/src/lib/api.js` (forgot/reset), `LoginView.jsx`, `.env.example`, `package.json`.

## Testes (`test/auth.test.js`, mailer fake)
Token válido troca a senha; expirado e reutilizado falham; e-mail inexistente responde 200 sem enviar; sessões antigas são apagadas após o reset; rate limit.
