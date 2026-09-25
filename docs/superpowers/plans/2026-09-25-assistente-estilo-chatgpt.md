# Assistente estilo ChatGPT + 10 conversas salvas — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Redesenhar `AssistantView` como o ChatGPT e guardar até 10 conversas por usuário.

**Architecture:** Coleção `assistant_chats` (por usuário) com 4 funções em `db.js` e 4 rotas em `server.js`; `AssistantView` é dividida em `ChatSidebar`, `ChatMessage` e o próprio container (estado + composer). `POST /api/assistant` não muda.

**Tech Stack:** Node `node:test` + Mongo real; React, Tailwind (tokens do design system), FontAwesome.

**Spec:** `docs/superpowers/specs/2026-09-25-assistente-estilo-chatgpt-design.md`

## Global Constraints
- Máx. 10 conversas por usuário; a 11ª apaga a de menor `updatedAt`.
- `messages`: 1..40 itens, `role` user|assistant, `content` 1..8000; pergunta nova ≤ 2000 (já validado em `/api/assistant`).
- Todas as rotas: `requireScreen(..., 'assistant')` + filtro por `userId` do logado; conversa alheia/inexistente/id inválido → 404.
- Título = primeira pergunta, ~40 caracteres.
- Textos em pt-BR; sem cores novas (tokens existentes).

## Review Focus
- Usuário B não lê/apaga conversa do usuário A (404).
- `PUT` com `id` alheio não cria nem altera nada.
- 11ª conversa: sobram exatamente 10 e a apagada é a mais antiga.
- `PUT` com `id` só atualiza (não cria duplicata, não muda título).
- Apagar a conversa ativa volta para "nova"; falha ao salvar não perde a conversa na tela.

---

### Task 1: Back-end
**Files:** Modify `db.js`, `lib/validators.js`, `server.js`; Test `test/server.test.js`, `test/auth.test.js`

**Interfaces (produzidas):**
- `db.js`: `listAssistantChats(userId) → [{id,title,updatedAt}]`, `getAssistantChat(userId,id) → {id,title,messages}|null`, `saveAssistantChat(userId,{id,messages}) → {id,title}|null` (null = `id` não é do usuário), `deleteAssistantChat(userId,id) → boolean`
- `validators.js`: `validateAssistantChatRequest(req) → { id: string|undefined, messages }`

- [ ] Testes: validator (unitário) e integração com 2 usuários (dono lista/lê/atualiza/apaga; alheio 404; 11ª apaga a mais antiga; validação 400).
- [ ] `node --test` → FAIL.
- [ ] Implementar db + validator + rotas (`/api/assistant/chats`, `/api/assistant/chats/:id`).
- [ ] `node --test` → PASS. Commit `Adiciona conversas salvas do assistente no back-end`.

### Task 2: Front-end
**Files:** Modify `web/src/lib/api.js`, `web/src/components/assistant/AssistantView.jsx`; Create `ChatSidebar.jsx`, `ChatMessage.jsx` (mesma pasta)

- [ ] `api.js`: `listAssistantChats()`, `getAssistantChat(id)`, `saveAssistantChat(id, messages)`, `deleteAssistantChat(id)`.
- [ ] `ChatSidebar`: botão "Nova conversa", lista (título, ativo destacado, lixeira ao passar o mouse).
- [ ] `ChatMessage`: usuário = balão `bg-secondary` à direita; IA = texto solto + ações copiar / gerar de novo (só na última) + botão "Criar orçamento…" quando houver linhas `- Nx`.
- [ ] `AssistantView`: layout 2 colunas (lista vira painel no mobile), tela vazia com exemplos, composer arredondado com auto-altura e botão redondo, indicador de 3 pontos, rolagem ao fim, salvar após cada resposta, carregar/apagar conversa, gerar de novo.
- [ ] `npm run build`; verificar no navegador; commit `Redesenha o assistente no estilo ChatGPT com conversas salvas`.

### Task 3: Verificação final
- [ ] `node --test` verde; reiniciar servidor; conferir no navegador (nova conversa, salvar, reabrir, apagar, limite).
