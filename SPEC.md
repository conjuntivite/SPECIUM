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

## Próximos passos (fora de escopo por enquanto)

- **Importar orçamento existente**: ler um arquivo com um orçamento já montado, apontar o que está errado/faltando e sugerir os equipamentos corretos — reaproveitando a mesma engine de `RECIPES`, só trocando a origem dos itens (arquivo em vez de texto livre no formulário). Pedido explicitamente adiado pelo usuário ("mais para frente") — não implementar sem confirmação.
