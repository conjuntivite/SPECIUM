<p align="center"><img src="web/public/logo-light.png" alt="Logo SPECIUM" width="220" /></p>

# SPECIUM

Ferramenta para o comercial montar o orçamento de uma instalação de segurança eletrônica sem esquecer equipamento. Você vai adicionando os itens que o cliente vai levar (câmera IP, DVR, switch...); a cada item, o sistema recalcula quais complementos ainda faltam para a instalação funcionar de verdade (cabo, switch PoE, caixa Steck, gravação etc.), separando o que é essencial do que é só recomendado. Preço não é mais o ponto de partida — só é consultado quando o comercial pede, item por item, contra Intelbras/Amazon/Google Shopping.

Também compara a ficha técnica de até 3 produtos selecionados: quando a oferta é da Intelbras, usa a ficha técnica oficial do fabricante; nos demais casos, extrai atributos reconhecíveis do próprio título.

## Identidade visual

O sistema se chama **SPECIUM** ("Intelligent System Design"), wordmark em negrito com "SPEC" na cor primária. O estilo segue o [shadcn/ui](https://ui.shadcn.com/): tokens semânticos em `web/src/index.css` com base neutra (zinc) e cor primária vermelha (`--primary: #dc2626`, mantida do rebrand anterior), tema escuro por padrão e tema claro pelo botão de tema. O componente `web/src/components/layout/Brand.jsx` renderiza o wordmark (com o olho da logo à esquerda na tela inicial). Arquivos em `web/public/`: `logo.png` (logo completa, usada no login e aqui), `logo-eye.png` (só o olho) e `favicon.png`; todos com fundo transparente, gerados a partir das artes originais em fundo branco.

## Categorias cobertas

Câmeras (IP e analógica), gravadores de vídeo (DVR/NVR), terminais de reconhecimento facial, vídeo porteiros, switches (PoE/normais/gerenciáveis), fontes (chaveadas/12V), cabeamento (CAT5, CAT5e, CCI, cabo paralelo etc.), Mikrotik/RouterBoard, roteadores e soluções de acabamento (canaletas, tubulação, caixas Steck, quadros de comando, rack).

## Como funciona

```
Navegador (web/, React) ──▶ POST /api/recipe/suggestions ──▶ server.js ──▶ RECIPES (regras internas)
                        │                                          │
                        │                                          └──▶ detecta categoria de cada item do
                        │                                               orçamento e devolve o que falta
                        │
                        └──▶ POST /api/recipe/prices (sob demanda) ──▶ Intelbras, Amazon, Serper, SerpApi
                                                                             │
                                                                             └──▶ preço médio + melhor oferta
                                                                                  por item do orçamento
```

- **`server.js`** — servidor HTTP em Node.js puro (sem framework): motor de receita (orçamento → essenciais faltando), busca de ofertas, normalização e comparação de especificações. Também serve o build do front-end (`web/dist/`).
- **`web/`** — front-end em React + Vite + Tailwind CSS + shadcn/ui (componentes sobre Radix UI). O canvas de orçamento usa React Flow (`@xyflow/react`) para o quadro estilo n8n de itens e sugestões.
- **`test/`** — testes unitários e de integração HTTP (`node --test`) para `server.js`.

### Orçamento e receita de essenciais

O comercial adiciona itens em texto livre (ex: "Câmera IP", "DVR 16 canais"). A cada item adicionado ou removido, o front-end chama `POST /api/recipe/suggestions` com a lista completa do orçamento; o servidor:

1. Detecta a categoria de cada item (`detectRecipeCategory` — reaproveita o mesmo detector de categoria usado na busca de preço, com uma distinção extra para câmera IP vs. analógica).
2. Para cada categoria-âncora encontrada, busca os complementos definidos em `RECIPES` (ex.: câmera IP pede cabo de rede, switch PoE, caixa Steck, canaleta e gravação — NVR **ou** cartão de memória).
3. Marca como satisfeito qualquer complemento cujo padrão já bata em algum item do próprio orçamento (não depende de já ter sido "sugerido" — um item digitado livremente resolve o requisito do mesmo jeito).
4. Devolve só o que falta, marcado como essencial ou recomendado.

Preço não faz parte desse cálculo — `POST /api/recipe/prices` é uma ação separada, disparada só quando o comercial clica em "Verificar preço médio": busca cada item do orçamento nos provedores de sempre e devolve a melhor oferta + o preço médio das ofertas encontradas.

**Próximo passo (ainda não implementado):** importar um orçamento já pronto (arquivo) e o sistema apontar o que está errado/faltando, sugerindo os equipamentos corretos — mesma engine de `RECIPES`, entrada diferente.

### Provedores de busca

| Provedor | Custo | Como funciona |
|---|---|---|
| **Intelbras** (padrão) | Gratuito | Consulta a API pública da loja oficial (`loja.intelbras.com.br`, VTEX), sem chave. Devolve preço e ficha técnica estruturada do fabricante. |
| **Amazon** | Gratuito | Renderiza a busca com Chrome headless (Puppeteer), pois a Amazon não serve HTML utilizável para `fetch` simples. |
| **Serper** | Pago | Consulta `google.serper.dev/shopping`. Requer `SERPER_API_KEY`. |
| **SerpApi** | Pago | Consulta `serpapi.com` (`engine=google_shopping`). Requer `SERPAPI_API_KEY`. |

Por padrão a busca combina todos os provedores disponíveis (`provider=all`); é possível restringir a um único provedor pela interface ou pelo corpo da requisição.

**Sobre o Mercado Livre:** o ML bloqueia deliberadamente tráfego automatizado (HTTP 403), inclusive na API pública oficial mesmo com aplicativo autenticado — testado ao vivo e confirmado como problema atual e generalizado (ver [`SPEC.md`](./SPEC.md)). Por isso o ML não é acessado diretamente; ele aparece nos resultados de forma indireta quando o Google Shopping (via Serper/SerpApi) indexa um anúncio dele.

### Comparação de ficha técnica

`POST /api/compare` recebe 2–3 ofertas selecionadas e devolve as especificações de cada uma:

- **Ofertas da Intelbras**: a própria loja já devolve ficha técnica estruturada (fabricante, modelo, características técnicas etc.) — sem scraping, é a API oficial do fabricante.
- **Ofertas de qualquer outro provedor**: extração leve de atributos reconhecíveis diretamente do título da oferta (canais e resolução para DVR/NVR, portas/PoE para switch, tipo e metragem para cabo, modelo para Mikrotik etc.). Quando nada é reconhecido, mostra só Loja/Preço com uma nota explicando o motivo — nunca inventa dado.

## Requisitos

- Node.js **22+** (o backend usa apenas módulos nativos: `http`, `fetch`, `node:test`)
- Chrome/Chromium (instalado automaticamente pelo Puppeteer na primeira `npm install`)

## Instalação

```bash
npm install          # dependências do backend (raiz)
cd web && npm install # dependências do frontend (React/Vite/Tailwind/shadcn)
```

## Configuração (variáveis de ambiente)

O servidor lê variáveis de um arquivo `.env` na raiz do projeto — **esse arquivo nunca deve ser commitado** (já está listado em `.gitignore`). Use `.env.example` como modelo:

```bash
cp .env.example .env
```

| Variável | Obrigatória | Descrição |
|---|---|---|
| `APP_HOST` | Não (padrão `0.0.0.0`) | Endereço em que o servidor escuta. |
| `APP_PORT` | Não (padrão `8000`) | Porta HTTP. |
| `SERPER_API_KEY` | Não | Chave da API do [Serper](https://serper.dev). Sem ela, esse provedor fica indisponível e é ignorado silenciosamente na busca combinada. |
| `SERPAPI_API_KEY` | Não | Chave da API do [SerpApi](https://serpapi.com). Mesmo comportamento acima. |

As chaves só são necessárias se você quiser usar Serper/SerpApi como provedor de busca — Intelbras e Amazon funcionam sem nenhuma configuração.

## Uso

### Produção (um processo só, servindo o build do React)

```bash
cd web && npm run build   # gera web/dist/
cd ..
npm start                 # serve API + web/dist/ em http://localhost:8000
```

### Desenvolvimento (dois processos, com hot reload no front)

```bash
npm run dev            # backend com --watch, em http://localhost:8000
cd web && npm run dev   # Vite dev server em http://localhost:5173, com proxy de /api pro backend
```

Durante o desenvolvimento, acesse `http://localhost:5173` (o Vite recarrega o front na hora; as
chamadas a `/api/*` são encaminhadas automaticamente pro backend na porta 8000).

```bash
npm test                    # suíte de testes do backend
node --check server.js      # checagem rápida de sintaxe
```

### Endpoints

- `GET /health` — status do servidor e quais provedores têm chave configurada.
- `POST /api/recipe/suggestions` — dado o orçamento atual, devolve os complementos essenciais/recomendados que ainda faltam. Corpo: `{ items: [{ title }] }`. Não faz nenhuma chamada externa (regra pura, em memória).
- `POST /api/recipe/prices` — verifica preço de cada item do orçamento sob demanda. Corpo: `{ items: [{ label, search_term }] }`. Devolve, por item, a melhor oferta e o preço médio das ofertas encontradas.
- `POST /api/search` — busca ofertas de um item específico. Corpo: `{ item_name, brand, model, provider? }`.
- `POST /api/compare` — compara ficha técnica de 2–3 ofertas. Corpo: `{ items: [{ url, title }] }`.

## Segurança

- **Chaves de API nunca ficam no código**: são lidas exclusivamente de `process.env` (via `.env`, ignorado pelo Git). Nenhuma chave real está commitada — `.env.example` só traz os nomes das variáveis, vazios.
- **Sem armazenamento de credenciais de terceiros**: o servidor não guarda login/senha de nenhuma loja; toda busca é anônima.
- **Sem scraping de sites com proteção anti-bot ativa**: por decisão de projeto, nenhum mecanismo de contorno de CAPTCHA/bloqueio anti-bot é implementado — inclusive para o Mercado Livre (ver [`SPEC.md`](./SPEC.md)).
- **Path traversal bloqueado**: o servidor de arquivos estáticos resolve o caminho pedido e rejeita qualquer requisição que escape do diretório `web/dist/`.
- **Sem preços inventados**: quando um provedor falha, é bloqueado ou não retorna resultados utilizáveis, a API responde com uma lista vazia e uma mensagem explicativa — nunca com dados fabricados.
- **Sem persistência no servidor**: o orçamento vive só no navegador do comercial (`localStorage`), o servidor não guarda estado entre requisições.
- **Validação de entrada**: todas as rotas `POST` validam o corpo antes de qualquer chamada externa; entradas inválidas retornam HTTP 400.

Se você fizer fork deste projeto, gere suas próprias chaves em [serper.dev](https://serper.dev) e [serpapi.com](https://serpapi.com) e nunca as commite — se uma chave vazar, revogue-a imediatamente no painel do provedor e gere uma nova.

## Estrutura do projeto

```
.
├── server.js                       # servidor HTTP + lógica de busca/comparação
├── web/                            # front-end (React + Vite + Tailwind CSS + shadcn/ui)
│   ├── src/
│   │   ├── components/             # search/ (busca avançada), budget/ (canvas React Flow), ui/ (shadcn)
│   │   ├── hooks/                  # useBudget (orçamento/canvas), useCompareSelection
│   │   └── data/                   # catalog.json (catálogo do <select> de itens do orçamento)
│   └── dist/                       # build de produção (gerado, servido por server.js — não versionado)
├── test/server.test.js             # testes unitários e de integração
├── .env.example                    # modelo de variáveis de ambiente (sem valores reais)
├── SPEC.md                         # decisões de escopo e racional técnico
└── package.json
```

## Licença

Projeto privado / uso pessoal.
