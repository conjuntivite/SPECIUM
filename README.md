<p align="center"><img src="web/public/brand/specium-lockup-light.svg" alt="Logo SPECIUM" width="320" /></p>

# SPECIUM

Ferramenta interna do comercial para montar e revisar orçamentos de segurança eletrônica (CFTV, alarme,
controle de acesso, rede e acabamento) sem esquecer equipamento.

Você monta o orçamento num canvas. A cada item, um **motor de regras** recalcula o que ainda falta para a
instalação funcionar: cabo, switch PoE, fonte, gravação, caixa Steck etc. Ele separa o que é essencial do que é
recomendado e confere capacidade (portas, canais, potência). O preço só é consultado quando o comercial pede.

> Arquitetura detalhada: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Decisões e racional: [`SPEC.md`](SPEC.md)
> · Aplicação do design system: [`design-system/specium/MASTER.md`](design-system/specium/MASTER.md)

## O que o sistema faz

| Tela | O que faz |
|---|---|
| **Orçamento** | Canvas (React Flow) com os itens e as ligações. Mostra as sugestões do motor de recursos e capacidade. Inclui o endereço do cliente (CEP via ViaCEP + geocodificação), o mapa (ruas, satélite ou planta baixa) com a cobertura das câmeras, o upload da planta baixa e a lista de orçamentos salvos. |
| **Busca avançada por item** | Busca ofertas em Intelbras, Amazon, Serper e SerpApi, com o filtro de "oferta exata" e a comparação da ficha técnica de 2 ou 3 produtos. |
| **Produtos** | Cadastro de marca e modelo por categoria. Importa por planilha CSV (padrão do Excel pt-BR). |
| **Categorias** | O catálogo que alimenta o motor. Cada categoria tem o que **fornece** (`provides`) e o que **exige** (`requirements`): presença de outra categoria, capacidade de um recurso ou alternativas. Também guarda os recursos e os grupos. |
| **Validar orçamento (PDF)** | Lê o PDF de um orçamento pronto. A IA classifica os itens nas categorias, o motor de regras aponta o que falta e, por último, a IA faz uma revisão técnica por cima. |
| **Assistente** | Chat com IA sobre os equipamentos. Quando a resposta traz um orçamento, ele é conferido pelo motor antes de aparecer na tela e pode virar um orçamento no canvas. |
| **Usuários / Instruções da IA / E-mail (SMTP)** | Só para administradores: permissões por tela, prompts da IA editáveis e o SMTP da recuperação de senha. |

O login é por e-mail e senha, com recuperação por e-mail. Cada usuário só vê as telas liberadas para ele, e o
servidor também barra o acesso.

## Stack

- **Backend:** Node.js 22+ com o módulo `http` puro, sem framework. MongoDB 7 (driver oficial), `pdf-parse`,
  `nodemailer` e `puppeteer` (só para a Amazon).
- **Frontend (`web/`):** React 19, Vite 8, Tailwind CSS v4, shadcn/ui (Radix), React Flow (`@xyflow/react`),
  Leaflet/MapLibre e FontAwesome.
- **Design system:** [Trade UI](design-system/specium/MASTER.md), com tema claro padrão e escuro por
  `data-theme="dark"`. A logo é o gato-fantasma com o olho limão.
- **IA:** OpenRouter (classificação, auditoria do PDF e assistente), com uma lista de modelos de reserva.
- **Mapas:** Nominatim e OpenFreeMap (OpenStreetMap, gratuitos). Satélite opcional pela Esri (ArcGIS).

## Requisitos

- Node.js **22+**
- Docker, para o MongoDB local (`docker-compose.yml`)
- Chrome/Chromium: o Puppeteer baixa sozinho no primeiro `npm install`

## Instalação

```bash
npm install                 # backend (raiz)
cd web && npm install       # frontend
cd .. && docker compose up -d mongodb
cp .env.example .env        # e preencha (tabela abaixo)
```

## Configuração (`.env`)

O `.env` nunca é commitado (está no `.gitignore`). O modelo é o `.env.example`.

| Variável | Obrigatória | Para quê |
|---|---|---|
| `APP_HOST` / `APP_PORT` | Não (`0.0.0.0` / `8000`) | Endereço e porta HTTP. |
| `MONGODB_URI` / `MONGODB_DB` | Não (`mongodb://localhost:27017` / `comprador_inviolavel`) | Banco. Para trocar de Mongo, basta mudar aqui. |
| `DEV_EMAIL` / `DEV_PASSWORD` | Recomendado | Conta admin de recuperação, recriada (upsert) a cada boot. |
| `SETTINGS_SECRET` | Para usar o SMTP | Chave de 32 bytes em hex que cifra a senha do SMTP no banco (AES-256-GCM). **Gere uma vez e não troque.** |
| `APP_URL` | Em produção | Endereço público, usado no link do e-mail de redefinição de senha. |
| `OPENROUTER_API_KEY` | Para as telas de IA | Validar orçamento (PDF) e Assistente. |
| `OPENROUTER_MODEL` (+ `_CLASSIFY`, `_AUDIT`) | Não | Força um modelo antes da lista de reserva, opcionalmente por etapa. |
| `SERPER_API_KEY` / `SERPAPI_API_KEY` | Não | Provedores pagos do Google Shopping. Sem a chave, o provedor é ignorado. |
| `ARCGIS_API_KEY` | Não | Ativa a visão "Satélite" do mapa. Sem ela, só o mapa de ruas. |

## Uso

```bash
# desenvolvimento: dois processos, com hot reload no front
npm run dev                 # API em http://localhost:8000 (node --watch)
cd web && npm run dev       # Vite em http://localhost:5173, com proxy de /api para a 8000

# produção: um processo, servindo o build do React
cd web && npm run build && cd ..
npm start                   # API + web/dist/ em http://localhost:8000

npm test                    # testes do backend (node --test, pasta test/)
```

### Catálogo versionado

Categorias, recursos, grupos, produtos e as instruções da IA ficam no Mongo. O `scripts/catalog-sync.js` os
guarda em `data/catalog-snapshot.json`, versionado no git:

```bash
node scripts/catalog-sync.js export                               # banco → arquivo
node scripts/catalog-sync.js import                               # SIMULA (não grava)
node scripts/catalog-sync.js import --apply [--with-instructions] # grava; nunca apaga nada
```

Ficam de fora: usuários, orçamentos, conversas do assistente, SMTP e a memória de classificação, que é um
cache e se reconstrói. Depois de mudar o catálogo pela tela, rode `export` e faça o commit do arquivo.

## Segurança

- **Credenciais:** as chaves de API só vêm de `process.env`. A senha do SMTP fica cifrada no banco
  (AES-256-GCM, chave fora do banco).
- **Senhas:** guardadas com `scrypt` (stdlib) e salt.
- **Sessões:** cookie `HttpOnly`, `SameSite=Lax`, com 30 dias de validade. Ao publicar atrás de HTTPS, acrescente
  `Secure` em `lib/auth.js`.
- **Permissões por tela:** checadas no servidor (`requireScreen`), não só na interface.
- **Proteção anti-bot:** nunca é contornada. O Mercado Livre só aparece de forma indireta, pelo Google Shopping
  (ver `SPEC.md`).
- **Dados:** nada de preço ou especificação inventada. Se um provedor falha, a resposta volta vazia e
  explica o motivo.
- **Entrada:** toda rota de escrita valida o corpo (`lib/validators.js`), e uploads têm tamanho máximo. Os
  arquivos estáticos e as plantas baixas são servidos com bloqueio de path traversal.

## Documentação

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): componentes, fluxos, modelo de dados e integrações.
- [`SPEC.md`](SPEC.md): decisões de produto e de engenharia em ordem cronológica (motor de regras, provedores,
  identidade).
- [`design-system/specium/MASTER.md`](design-system/specium/MASTER.md): como o Trade UI foi aplicado.
- `docs/superpowers/specs` e `docs/superpowers/plans`: specs e planos de funcionalidades (assistente,
  login e recuperação de senha).

## Licença

Projeto privado / uso interno.
