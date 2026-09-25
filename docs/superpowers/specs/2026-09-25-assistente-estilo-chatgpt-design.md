# Assistente estilo ChatGPT + 10 conversas salvas

## Objetivo
Redesenhar a tela do Assistente (`AssistantView`) para se parecer ao máximo com o ChatGPT (visual e uso) e guardar até 10 conversas por usuário, para consultar depois.

## Decisões
- Conversas ficam no **Mongo, por usuário** (acompanham a conta em qualquer navegador). Coleção `assistant_chats`.
- Limite de **10 por usuário**. Ao salvar a 11ª, a **mais antiga (menor `updatedAt`) é apagada automaticamente**.
- Título = primeiros ~40 caracteres da primeira pergunta.
- Fora do escopo: streaming da resposta, editar pergunta enviada, anexos, busca nas conversas, renomear.
- Mantém: resposta da IA continua sendo `POST /api/assistant` (histórico vai no corpo); botão "Criar orçamento com estes itens" e o aviso de itens não importados.

## Back-end
Coleção `assistant_chats`: `{ _id: ObjectId, userId, title, messages: [{role, content}], createdAt, updatedAt }`, índice em `{ userId, updatedAt }`.

Rotas (todas exigem `requireScreen(..., 'assistant')` e só enxergam conversas do próprio `userId`):
- `GET /api/assistant/chats` → lista `[{ id, title, updatedAt }]` (sem mensagens), mais recente primeiro.
- `GET /api/assistant/chats/:id` → `{ id, title, messages }`.
- `PUT /api/assistant/chats` `{ id?, messages }` → cria (sem `id`) ou atualiza; devolve `{ id, title }`. Ao criar, se o usuário já tem 10, apaga a de menor `updatedAt`. Valida `messages`: 1..40 itens, `role` user/assistant, `content` string 1..8000.
- `DELETE /api/assistant/chats/:id` → apaga (só se for do usuário; id inválido/alheio → 404).

`db.js`: `listAssistantChats(userId)`, `getAssistantChat(userId, id)`, `saveAssistantChat(userId, {id, messages})`, `deleteAssistantChat(userId, id)`. `MAX_ASSISTANT_CHATS = 10`.
`lib/validators.js`: `validateAssistantChatRequest`.

## Front-end (`web/src/components/assistant/`)
- Layout de duas colunas: **barra lateral de conversas** (botão "+ Nova conversa", lista com título, lixeira ao passar o mouse, item ativo destacado) + **área do chat** centralizada (max ~768px).
- Mensagem do usuário: balão cinza à direita. Da IA: texto solto sem balão, com ações **copiar** e **gerar de novo** (refaz a última resposta) embaixo.
- Tela vazia: saudação + cartões com os exemplos (`EXAMPLES`).
- Composer fixo no rodapé: caixa arredondada que cresce (até ~8 linhas), botão de enviar redondo; Enter envia, Shift+Enter quebra linha; limite 2000 na pergunta.
- Estado "pensando" com indicador animado de três pontos; rolagem automática até o fim.
- Salva (`PUT`) após cada resposta recebida; guarda o `id` devolvido na primeira vez. Abrir conversa da lista carrega via `GET`. Apagar a conversa ativa volta para "nova".
- Responsivo: no celular a lista vira um painel que abre por botão.
- Tema: usa os tokens do design system existentes (claro/escuro), sem cores novas.

## Testes
- Back (com Mongo real, padrão `test/server.test.js`): só o dono lista/lê/apaga; 11ª conversa apaga a mais antiga; `PUT` com `id` atualiza sem criar; validação rejeita `role` inválido e lista vazia; outro usuário recebe 404.
- Validator unitário.
- Front: verificação manual no navegador (não há testes de componente no projeto).
