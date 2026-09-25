# Confirmar senha + recuperação de senha por e-mail — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Cadastro com senha + confirmação; recuperação de senha por e-mail (SMTP Outlook).

**Architecture:** Lógica pura (token, rate limit) em `lib/passwordReset.js`; envio em `lib/mailer.js` com transporte injetável (mesmo padrão de `setAmazonBrowserLauncher`); coleção `password_resets` em `db.js`; duas rotas em `server.js`; novos modos (`forgot`, `reset`) na `LoginView`.

**Tech Stack:** Node ≥22 (`node:test`), MongoDB, `nodemailer` (única dep nova), React + Vite.

**Spec:** `docs/superpowers/specs/2026-09-25-login-confirmacao-e-recuperacao-senha-design.md`

## Global Constraints
- Token 32 bytes hex; no banco só SHA-256; validade 1 h; uso único.
- Rate limit: 3 pedidos / e-mail / 15 min.
- `/api/auth/forgot` responde sempre 200 `{ sent: true }`.
- Reset apaga todas as sessões do usuário e cria sessão nova.
- SMTP só via `.env`: `SMTP_HOST`, `SMTP_PORT`(587), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `APP_URL`(default `http://localhost:${PORT}`).
- Sem SMTP configurado: imprime o link no console.
- Textos em pt-BR.

## Review Focus
- Token reutilizado / expirado / inexistente → "Link inválido ou expirado."
- E-mail sem conta → 200 e nenhum e-mail enviado.
- 4º pedido em 15 min → 200 sem enviar.
- Senha nova < 8 chars no reset → recusada, token não consumido... (validação roda antes de consumir).
- Sessão antiga deixa de funcionar após reset.

---

### Task 1: Confirmar senha no cadastro (front)
**Files:** Modify `web/src/components/auth/LoginView.jsx`

- [ ] Adicionar `const [confirm, setConfirm] = useState('')`; `const mismatch = !isLogin && confirm !== '' && confirm !== password`.
- [ ] Após o bloco do campo Senha, quando `mode === 'register'`, renderizar campo `id="login-confirm"` "Confirmar senha" (`type` segue `showPassword`, `autoComplete="new-password"`, `required minLength={8}`), e `{mismatch ? <p role="alert">As senhas não coincidem.</p> : null}`.
- [ ] Botão submit: `disabled={submitting || (mode === 'register' && password !== confirm)}`.
- [ ] `setConfirm('')` ao trocar de aba.
- [ ] Verificar no navegador; commit `Pede confirmacao de senha ao criar conta`.

### Task 2: Backend de recuperação
**Files:** Create `lib/passwordReset.js`, `lib/mailer.js`; Modify `lib/env.js`, `lib/validators.js`, `db.js`, `server.js`, `package.json`, `.env.example`; Test `test/auth.test.js`, `test/server.test.js`

**Interfaces (produzidas):**
- `passwordReset.js`: `RESET_TTL_MS`, `generateResetToken() → { token, tokenHash }`, `hashResetToken(token) → hex`, `allowResetRequest(email, now?) → boolean`
- `mailer.js`: `sendResetEmail(to, link) → Promise`, `setMailTransport(t)`
- `db.js`: `createPasswordReset(userId, tokenHash, expiresAt)`, `consumePasswordReset(tokenHash) → userId|null`, `resetUserPassword(userId, passwordHash) → publicUser`
- `validators.js`: `validateEmailRequest(req) → { email }`, `validateResetRequest(req) → { token, password }`

- [ ] **Testes unitários** em `test/auth.test.js`: token tem 64 hex e `tokenHash === hashResetToken(token)`; `allowResetRequest` permite 3 e bloqueia a 4ª, libera após 15 min; `validateResetRequest` recusa senha curta/token malformado; `sendResetEmail` chama o transporte fake com `to` e o link no corpo.
- [ ] **Teste de integração** em `test/server.test.js` (padrão Mongo existente, transporte fake): registra conta → `forgot` envia 1 e-mail com link `?reset=<token>` → `reset` com token troca senha e devolve cookie → login com senha nova OK, senha antiga falha, cookie antigo dá 401 → reusar token falha → e-mail inexistente responde 200 sem enviar → token expirado (update direto em `password_resets`) falha.
- [ ] Rodar: `node --test` → FAIL.
- [ ] Implementar `lib/passwordReset.js`, `lib/mailer.js` (`nodemailer`, `requireTLS: true`, porta 587), `APP_URL` em `lib/env.js`, validators, helpers em `db.js` (índice TTL em `expiresAt`), rotas em `server.js`, `npm i nodemailer`, variáveis em `.env.example`.
- [ ] Rodar `node --test` → PASS. Commit `Adiciona recuperacao de senha por e-mail no back-end`.

### Task 3: Telas forgot/reset (front)
**Files:** Modify `web/src/lib/api.js`, `web/src/hooks/useAuth.js`, `LoginView.jsx`

- [ ] `api.js`: `forgotPassword(email)` → POST `/api/auth/forgot`; `resetPassword(token, password)` → POST `/api/auth/reset`.
- [ ] `useAuth`: `forgot(email)` (retorna true/false, seta `error`) e `reset(token, password)` (seta `user` como login).
- [ ] `LoginView`: modo inicial `reset` se `?reset=` na URL; link "Esqueci minha senha" (modo login) → modo `forgot` (só e-mail; ao enviar mostra aviso "Se o e-mail existir, enviamos o link."); modo `reset` (nova senha + confirmar); após sucesso `history.replaceState(null, '', '/')`. Abas Entrar/Criar conta ficam ocultas em `forgot`/`reset`; há botão "Voltar ao login".
- [ ] `npm run build` em `web/`; testar no navegador; commit `Adiciona telas de recuperacao de senha`.

### Task 4: Verificação final
- [ ] `node --test` verde; reiniciar servidor; fluxo manual com link no console (SMTP vazio).
- [ ] Atualizar README se citar variáveis de ambiente.
