# Spec: buscador de segurança eletrônica

## Origem

Este projeto reaproveita a arquitetura de um buscador de hardware de PC anterior (`BUSCADOR-V1`): servidor Node.js puro, provedores de busca combináveis, normalização de ofertas, filtro de "oferta exata" e comparação de ficha técnica de até 3 produtos. O domínio muda de hardware de PC para segurança eletrônica e infraestrutura de instalação (DVR/NVR, reconhecimento facial, vídeo porteiro, switch, fonte, cabeamento, Mikrotik, roteador, acabamento).

## Por que o Mercado Livre não é acessado diretamente

O pedido original era usar o Mercado Livre como site principal de busca. Isso não é viável sem violar proteção anti-bot:

- Teste ao vivo (03/09/2026): `curl https://api.mercadolibre.com/sites/MLB/search?q=...` → `HTTP 403 {"message":"forbidden"}`.
- Esse bloqueio no endpoint `/sites/MLB/search` afeta até aplicativos com token OAuth autenticado — é um problema amplo e atual, reportado por múltiplos desenvolvedores (Reclame Aqui), não um bloqueio de "scraping sem chave" contornável com autenticação.
- Contornar isso (resolver desafios, falsificar impressão digital de navegador, rotacionar IP) não é implementado, por decisão de projeto — mesmo racional do `BUSCADOR-V1` em relação a Terabyte/Pichau/Magalu.

**Solução adotada**: cobertura indireta via Google Shopping (Serper/SerpApi). Quando o Google indexa um anúncio do Mercado Livre, ele aparece nos resultados combinados normalmente — sem o servidor jamais acessar `mercadolivre.com.br` ou `api.mercadolibre.com` diretamente.

## Por que a Intelbras é o provedor gratuito padrão

Testada e confirmada sem bloqueio anti-bot e sem necessidade de chave: `loja.intelbras.com.br/api/catalog_system/pub/products/search` (API pública padrão de lojas VTEX). Além do preço, cada produto já vem com ficha técnica estruturada oficial do fabricante (`allSpecifications` + campos como "Tipo de câmera de vigilância", "Fabricante", "Modelo do produto"), muito mais confiável do que extração de texto ou benchmark externo. Como a Intelbras cobre boa parte das categorias pedidas (CFTV, vídeo porteiro, controle de acesso, switch PoE, fonte), ela substitui o KaBuM! como provedor padrão gratuito.

Limitação conhecida: é uma loja única (mono-marca), então `distinctStores: false` — mesmo tratamento dado à Amazon no projeto original. Preço de fabricante não é necessariamente o mais barato do mercado; a cobertura multi-loja continua vindo de Amazon + Serper/SerpApi.

## Pivô: de comparador de preço para receita de orçamento (2026-09-03)

O foco original era 100% preço (buscar e comparar). O pedido do usuário mudou o centro do produto: o comercial monta um orçamento adicionando equipamentos em texto livre, e o sistema sugere em tempo real os complementos **essenciais** para a instalação funcionar (ex.: câmera IP pede cabo de rede, switch PoE, caixa Steck, canaleta e gravação — NVR ou cartão de memória). Preço deixou de ser o ponto de partida: só é consultado quando o comercial pede explicitamente, item por item (`POST /api/recipe/prices`), reaproveitando o motor de busca que já existia (`searchAllProviders`).

A engine de receita (`RECIPES`, `computeMissingEssentials`, `detectRecipeCategory` em `server.js`) é pura e sem estado: dado o conjunto de títulos do orçamento, detecta a categoria-âncora de cada um (reaproveita `detectSecurityCategory`, com uma distinção adicional para câmera IP vs. analógica) e junta os requisitos de todas as âncoras encontradas, marcando como satisfeito qualquer requisito cujo padrão já bata em **qualquer** item do orçamento — não importa se o item foi digitado livremente ou adicionado a partir de uma sugestão. O orçamento em si vive só no `localStorage` do navegador; o servidor não guarda nada entre requisições.

Categoria nova: `camera` (IP vs. analógica) não existia na busca de preço original — foi adicionada porque é o item mais vendido pelo comercial e não tinha extrator próprio. Por padrão, uma câmera sem "IP" explícito no texto é tratada como analógica (`camera_analogica`), já que é o caso mais comum/barato no mercado de CFTV nacional — evita marcar "Tipo: Analógica" por padrão no casamento de oferta exata (`matchesRequestedModel`), que rejeitaria ofertas IP numa busca genérica por "câmera".

## Casamento de oferta exata (`matchesRequestedModel`)

Cada categoria tem um extrator de atributos (`extractDvrNvrSpecs`, `extractSwitchSpecs` etc.) que lê canais/resolução, portas/PoE, tipo de cabo, modelo Mikrotik etc. tanto da query quanto do título da oferta. Uma oferta só é considerada "modelo exato" se:

1. Pertencer à **mesma categoria** da query (ex.: uma busca por "DVR" não aceita um produto que não seja DVR/NVR pelo próprio título) — achado em teste manual: a busca "DVR 16 canais" na Intelbras também retornava um rádio comunicador de 16 canais, que tem o mesmo atributo numérico mas é um produto completamente diferente.
2. Bater em todo atributo que a query especificou (se a query pede "PoE", a oferta precisa mencionar PoE).

## Comparação de ficha técnica (`/api/compare`)

1. **Oferta da Intelbras** (URL em `loja.intelbras.com.br`): reconsulta o produto pelo `linkText` extraído da URL (`/api/catalog_system/pub/products/search/<linkText>/p`) e monta a ficha a partir de `allSpecifications`, descartando campos de marketing (imagens de bloco, clusters, "segmento" etc.).
2. **Qualquer outra oferta**: extração leve por regex no título, mesma função usada no casamento de oferta exata. Sem dado reconhecido → Loja/Preço apenas, com nota explicando o motivo.

## Limites

- Sempre: validar entrada, nunca fabricar preço ou especificação.
- Perguntar antes: adicionar uma API paga ou chave de terceiros nova.
- Nunca: contornar proteção anti-bot (Mercado Livre incluído), armazenar credenciais de terceiros.

## Critérios de sucesso

- `provider=intelbras` retorna ofertas com ficha técnica estruturada sem chave configurada.
- `provider=all` sem `SERPER_API_KEY`/`SERPAPI_API_KEY` configuradas não quebra — apenas ignora esses provedores.
- Falhas externas exibem fallback seguro, sem erro 500.
- Nenhuma requisição do servidor é feita para `mercadolivre.com.br` ou `api.mercadolibre.com`.
- `POST /api/recipe/suggestions` não faz nenhuma chamada de rede — é regra pura sobre o orçamento recebido.
- Adicionar um item ao orçamento que satisfaça um requisito já sugerido faz esse requisito sumir da próxima chamada de `/api/recipe/suggestions`, mesmo que o item tenha sido digitado livremente (não precisa vir do botão de sugestão).

## Regras impeditivas de venda (2026-09-03)

Fonte: `comprador inviolavel regras de mercado.txt` (fora do repo, enviado pelo usuário) — lista os produtos que "não podem ser vendidos separados" para funcionar. Isso já mapeia direto para `essential: true` em `RECIPES`, que já existia; a mudança foi tornar as regras corretas tecnicamente, não criar um novo mecanismo:

- **Câmera IP** sem "PoE" explícito no título é tratada como não-PoE (mesmo critério de default já usado para IP x Analógica — a variante mais restritiva): passa a exigir `fonte_12v` própria (essencial), já que não liga só com o cabo de rede.
- **Câmera IP com "PoE" no título** vira categoria própria (`camera_ip_poe`): a alimentação é satisfeita por switch PoE **ou** fonte 12V avulsa (`alimentacao_poe_ou_fonte`, requisito único com padrão OR — qualquer um dos dois itens no orçamento resolve).
- **Toda câmera IP** (PoE ou não) passa a exigir `switch_giga` (essencial) — regra do usuário: câmera IP sem switch Gigabit trava.
- **Câmera analógica** ganhou `baluns` como requisito essencial, ao lado de coaxial/BNC-P4/fonte/DVR já existentes.
- **AcuSense (Hikvision)** é um *overlay*, não uma categoria substituta: `detectOverlayCategories` soma `camera_acusense` (exige `central_alarme`) por cima da categoria base de câmera (IP ou analógica) quando o título contém "acusense" — a câmera continua precisando do kit normal, só ganha esse requisito extra. A exceção do usuário (cliente quer monitorar só pelo app Hikvision, sem central) fica só no texto do `reason`, não é modelável por regex — decisão fica com o comercial.
- **Canaleta** deixou de ser essencial (era o default implícito de `requirement()`) e virou `essential: false`, com o padrão ampliado para cobrir todo o "kit de acabamento" que o usuário listou como recomendado (não impeditivo): corrugado, caixa de passagem, cotovelos, abraçadeiras, eletroduto, adaptadores.
- **DVR/NVR precisa de HD** e **cabo de rede/coaxial são essenciais para as câmeras** já eram `essential: true` antes desta mudança — nenhum código novo, só confirma que já estava certo.

Fora de escopo: nada no app hoje bloqueia de fato o fechamento de um orçamento (não existe ação de "finalizar"/exportar) — `essential: true` continua sendo só o sinal mais forte na listinha lateral de sugestões (◆ Essencial vs ◇ Recomendado), a decisão final é sempre do comercial.

## Requisito alternativo: switch PoE ou fonte 12V (2026-09-03)

A câmera IP PoE precisa de energia por um dos dois caminhos, não dos dois — `alternativeRequirement` (`server.js`) modela isso como duas opções, não um requisito combinado único:

- Nenhuma das duas no orçamento: as duas aparecem na listinha lateral em **vermelho** (`severity: 'critical'`, ⛔ "Sem isso não liga").
- Uma delas é adicionada: ela vira nó real no canvas (some da listinha); a outra passa para **laranja** (`severity: 'optional'`) — ainda pode ser arrastada, mas deixou de ser obrigatória.

`fonte_poe_alt` é uma chave própria (mesmo padrão regex de `fonte_12v`) para não colidir com o requisito `fonte_12v` "obrigatório sozinho" usado por outras âncoras (câmera IP não-PoE, analógica, facial, porteiro, Mikrotik) — evita que a alternância de severidade de uma vaze pra outra quando as duas âncoras coexistem no mesmo orçamento.

Isso substituiu a primeira versão desta regra (endpoint `switch_upgrade`, um botão único "trocar o switch por PoE"): o usuário pediu explicitamente as duas opções lado a lado, não uma troca automática de item.

## NVR e Cartão de Memória: caixas separadas, cartão só pra AcuSense (2026-09-03)

O requisito combinado `gravacao` ("NVR ou cartão de memória") virou dois: `nvr` (câmera IP/IP PoE, obrigatório, só DVR/NVR/gravador satisfazem) e `cartao_memoria` (existe só dentro do overlay `camera_acusense`, nunca na câmera IP/analógica comum). Isso corrige uma liberdade que eu tinha tomado antes: a regra original (`comprador inviolavel regras de mercado.txt`) só permite cartão de memória como gravação pra AcuSense especificamente — não pra qualquer câmera IP.

`camera_acusense` modela isso como `alternativeRequirement` reaproveitando a chave `nvr` (mesmo padrão da câmera base) ao lado de `cartao_memoria` — as duas ficam vermelhas até uma ser escolhida, a outra vira laranja depois. Como isso duplicaria a chave `nvr` (uma vez fixa na câmera base, outra dentro do par alternativo do overlay), `computeMissingEssentials` remove o `nvr` isolado da câmera base sempre que `camera_acusense` está nos `detected_categories` — sem essa remoção, o cartão de memória satisfaria o par alternativo mas o `nvr` obrigatório da câmera base continuaria pendente, contradizendo a regra ("AcuSense pode ser vendida sem DVR quando... aceita cartão de memória").

## Bug: remover nó pelo Delete do teclado não atualizava as sugestões (2026-09-03)

O Drawflow tem exclusão nativa (selecionar um nó + `Delete`/`Backspace`) que remove o nó direto do canvas chamando `removeNodeId` internamente — esse caminho nunca passa pelo botão "✕" (`.flow-node-remove`) que é o único lugar que atualizava `budgetItems`. Resultado: o nó sumia visualmente mas continuava no orçamento pro motor de sugestões, então uma "Fonte 12V" apagada assim não fazia o par Switch PoE/Fonte 12V voltar a ficar vermelho.

Fix em `static/app.js`: `editor.on('nodeRemoved', ...)` (evento que o Drawflow dispara em toda remoção nativa, `removeNodeId` dispatcha `"nodeRemoved"` com o id) agora também tira o item de `budgetItems` e re-renderiza. Como o elemento HTML já foi removido do DOM quando esse evento dispara, a busca do item usa um mapa próprio (`itemIdByDrawflowId`, id do Drawflow → id do item) preenchido a cada `renderFlow()` — não dá pra ler `dataset.flowKey` do nó como o handler de `nodeMoved` faz, porque o nó já não existe mais.

## Rotina de testes: itens em combinações aleatórias (2026-09-03)

Pedido do usuário: validar a regra "acessório sozinho nunca obriga nada, âncora sozinha sempre obriga algo" (ex.: Fonte 12V sozinha não força adicionar câmera; câmera sozinha força). `test/server.test.js` ganhou 4 testes no fim do arquivo: os 12 itens-âncora do catálogo (câmeras, DVR, NVR, switch, switch PoE, Mikrotik, roteador, facial, porteiro) cada um sozinho, os 19 acessórios cada um sozinho, 50 combinações aleatórias só de acessórios, e 200 orçamentos aleatórios misturando os dois — com um PRNG determinístico (não `Math.random`) pra rodar sempre igual. As combinações verificam consistência interna (toda categoria com sugestão está em `detected_categories`, todo `satisfied_by` aponta pra um item que realmente está no carrinho) além da regra de negócio em si.

**Bug pego por essa rotina**: a opção "HD para DVR/NVR" do `<select>` (adicionada 2 rodadas atrás) continha as palavras-gatilho "DVR"/"NVR" no próprio rótulo — selecioná-la sozinha era **detectada como um DVR/NVR** (âncora própria: `detectSecurityCategory` casa por palavra solta, não por contexto), disparando a receita inteira de gravador por engano. Renomeado pra "HD Interno (armazenamento)" (mesmo texto já usado no `label` do requisito `hd_interno`) — continua satisfazendo `REQUIREMENT_PATTERNS.hd_interno` (bate em "HD"), só não contém mais palavra de categoria nenhuma.

## DVR vira câmera analógica, NVR vira câmera IP: receitas separadas (2026-09-03)

`RECIPES.dvr_nvr` (uma receita combinada) virou `RECIPES.dvr` e `RECIPES.nvr` — na prática pedem cabeamento diferente (DVR é coaxial/câmera analógica, NVR é rede/câmera IP), misturar os dois numa receita só estava errado. `detectRecipeCategory` agora refina a categoria `dvr_nvr` (que `detectSecurityCategory` ainda devolve — a busca/comparação de preço continua tratando os dois como um produto só, isso não muda) em `dvr` ou `nvr`: sem "NVR" explícito no título, o default é DVR (mesmo critério de "variante mais comum" já usado pra câmera IP x analógica — DVR é o mais tradicional em CFTV nacional).

`dvr` sugere `cabo_coaxial` + rótulo "Câmeras analógicas compatíveis"; `nvr` sugere `cabo_rede` + rótulo "Câmeras IP compatíveis". HD continua crítico (vermelho) e primeiro da lista nas duas.

Cuidado de nomenclatura: a categoria nova `nvr` (chave em `RECIPES`) e a chave de requisito `nvr` (usada em `REQUIREMENT_PATTERNS`/dentro de `camera_ip`, `camera_ip_poe` e `camera_acusense` pra saber se um NVR já está no orçamento) são a mesma string em objetos diferentes — não colidem porque vivem em namespaces separados (`RECIPES['nvr']` vs. `item.key === 'nvr'` dentro de um array), mas é fácil confundir lendo o código rápido.

## Bug: HD do DVR/NVR "satisfeito" por engano por uma câmera Full HD (2026-09-03)

Reportado pelo usuário: a sugestão de HD só aparecia quando o DVR era o primeiro item do orçamento — adicionando outros itens antes, sumia. Causa: `REQUIREMENT_PATTERNS.hd_interno` casava a palavra solta "HD", que em título de câmera/DVR quase sempre é **resolução** ("Multi HD", "Full HD"), não armazenamento. Uma "Câmera Intelbras Multi HD" já no carrinho "satisfazia" o HD de armazenamento do DVR/NVR por coincidência de palavra — não é sobre ordem de adição, é sobre qual produto está no orçamento (`computeMissingEssentials` é puro/sem estado, recalcula do zero sempre; a ordem em si nunca importou).

Fix: o padrão só conta como storage com contexto inequívoco — `HDD`/`SSD`/`disco rígido`, `"HD interno"`, `"HD para DVR/NVR"`, ou uma capacidade em TB/GB (câmera nunca é anunciada em TB/GB). Pego pela mesma rotina de combinações aleatórias de duas rodadas atrás? Não — essa rotina não usa nenhum item com "HD" no nome, então não cobria esse caso; adicionei um teste de regressão específico pra isso.

**De onde veio "Câmera Intelbras Multi HD"**: não veio do `<select>` do orçamento — é um título de fixture reaproveitado dos testes originais da busca/comparação de preço (`/api/search`, `/api/compare`), que existiam antes do `<select>` e usavam texto livre. Não é algo que o comercial consiga digitar/selecionar hoje: o campo de adicionar item virou `<select>` fechado (ajuste de duas rodadas atrás), sem caixa de texto livre, e nada na tela "Busca avançada" alimenta o orçamento — `addBudgetItem` só é chamado a partir do `<select>` ou de um arraste de sugestão da própria listinha lateral (rótulos controlados, vindos de `RECIPES`). Ou seja: o motor nunca "pegou" esse título de lugar nenhum em produção, foi só o exemplo que usei pra reproduzir e testar o bug do regex.

O fix do regex continua valendo (é uma correção real e não custa nada manter), mas pra garantir que a rotina de testes só valida contra o que existe de verdade pra selecionar, adicionei um teste de sincronismo: ele lê o `<select id="budget-item-input">` direto de `static/index.html` e compara com o catálogo (`ANCHOR_ITEMS`/`ACCESSORY_ITEMS`) usado pela rotina — se o `<select>` mudar sem atualizar esse catálogo (item novo, removido ou renomeado), o teste falha e avisa, em vez de deixar a rotina validar (ou parar de validar) algo que não existe mais pra selecionar.

## Kit de acabamento: uma caixa por item (2026-09-03)

Primeira tentativa foi manter uma sugestão combinada ("Canaleta / acabamento de cabeamento") e resolver o produto específico só depois, com um seletor dentro do nó — o usuário pediu explicitamente o oposto: cada item do kit de acabamento (Canaleta, Cano corrugado, Caixa de passagem, Cotovelo, Abraçadeira, Eletroduto, Adaptador) vira sua própria sugestão/caixa na listinha lateral desde o início, cada uma arrastável pro canvas separadamente. `FINISHING_KIT_REQUIREMENTS` (`server.js`) é a lista compartilhada pelas 3 recipes de câmera (IP, IP PoE, analógica) — evita repetir as 7 linhas em cada uma. Todas continuam `essential: false` (recomendadas, não impeditivas).

## Bug: condição de corrida deixava a listinha de sugestões desatualizada (2026-09-03)

Usuário reportou (com print) um caso em que o NVR já estava no quadro e o HD não aparecia na listinha — via `curl` direto no servidor, com o mesmo carrinho exato do print, a resposta veio certa (HD crítico, não satisfeito). O motor de regras nunca esteve errado aqui; o bug era no `static/app.js`.

Causa: `renderFlow()` dispara seu próprio `fetch('/api/recipe/suggestions')` a cada chamada, sem cancelar nem ignorar chamadas anteriores. Adicionar itens rápido (arrastar uma sugestão e, antes da resposta voltar, escolher outro produto no `<select>`) dispara duas chamadas de `renderFlow()` sobrepostas — se a resposta da mais antiga (carrinho menor, sem o item novo ainda) voltar DEPOIS da mais nova, ela sobrescreve a listinha lateral com sugestões de um carrinho já desatualizado. Os nós do quadro nunca ficam errados nesse cenário (são sempre redesenhados a partir do `budgetItems` atual, não da resposta da API) — só a sidebar, que é montada a partir da resposta de CADA chamada individualmente.

Fix: contador `renderGeneration` incrementado no início de cada `renderFlow()`; depois do `await fetch`, se uma chamada mais nova já tiver assumido (`generation !== renderGeneration`), a chamada atual descarta o resultado sem tocar no DOM — só a resposta da chamada mais recente pode atualizar a tela.

## Próximos passos (fora de escopo por enquanto)

- **Importar orçamento existente**: ler um arquivo com um orçamento já montado, apontar o que está errado/faltando e sugerir os equipamentos corretos — reaproveitando a mesma engine de `RECIPES`, só trocando a origem dos itens (arquivo em vez de texto livre no formulário). Pedido explicitamente adiado pelo usuário ("mais para frente") — não implementar sem confirmação.
