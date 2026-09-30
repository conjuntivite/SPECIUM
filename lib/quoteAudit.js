const { PDFParse } = require('pdf-parse');
const { callOpenRouter, candidateModels } = require('./openrouter');
const { relevantKnowledge } = require('./equipmentKnowledge');
const { normalize } = require('./text');
const { parseQuoteRows, buildMemoryIndex, rowKey, chunkQuoteText, INSTALLATION_NAME } = require('./classificationMemory');

const MAX_PDF_TEXT_CHARS = 20000; // orçamento real cabe folgado nisso; corta pra não estourar contexto do modelo grátis
const PDF_AUDIT_MAX_BYTES = 15 * 1024 * 1024; // mesmo teto da planta baixa (lib/floorPlan.js)
// Classificar e auditar não precisam de "pensar": modelo de raciocínio (DeepSeek V4, Nemotron) gasta até
// 5x mais token só em raciocínio escondido e leva minutos. Medido: DeepSeek V4 Flash 216s/19k tokens ligado
// vs 93s/3,4k desligado. Modelos por etapa: OPENROUTER_MODEL_CLASSIFY / OPENROUTER_MODEL_AUDIT (caem em OPENROUTER_MODEL).
const NO_REASONING = { enabled: false };
const stageModels = (stageEnv) => candidateModels(process.env[stageEnv] || process.env.OPENROUTER_MODEL);
const CLASSIFY_MAX_OUTPUT_TOKENS = 12000; // ~150 itens × ~60 tokens de JSON cada, com folga
const CLASSIFY_PARSE_ATTEMPTS = 3;
const CLASSIFY_CHUNK_ROWS = 20; // linhas de item por chamada à IA
// A IA pula de propósito umas poucas linhas que não são equipamento ("USUARISO", serviço de rádio...):
// tolera ~6% a menos que o PDF; as omissões reais medidas foram 8 de 51 (16%) e 12 de 54 (22%).
const MAX_MISSING_ITEMS_RATIO = 0.06;
const AUDIT_MAX_OUTPUT_TOKENS = 900; // 6 pontos curtos cabem folgado; evita resposta-fluxo que gasta token e vira ruído

// O cabeçalho do orçamento do SERVICE traz dado pessoal/comercial do cliente (nome, CNPJ/CPF,
// endereço, e-mail, telefone) que não tem nenhuma serventia pra checar compatibilidade de
// equipamento — e não tem por que sair da máquina local rumo a um provedor de IA terceiro. Corta
// tudo antes da tabela de itens (que sempre começa pela linha "Código ... Qtdade ... Produtos").
// Se o formato não bater (outro layout de PDF), mantém o texto inteiro — a extração ainda funciona,
// só perde essa poda extra.
function stripClientHeader(text) {
  const lines = text.split('\n');
  const tableStart = lines.findIndex((line) => /^C[oó]digo\b/i.test(line.trim()) && /Qtdade|Quantidade|Produtos/i.test(line));
  return tableStart > 0 ? lines.slice(tableStart).join('\n') : text;
}

// O SERVICE agrupa os itens em seções (ALARME, AUTOMAÇÃO, CFTV...) que o próprio usuário confirmou
// estarem cadastradas erradas (equipamento de controle de acesso lançado como "alarme", por
// exemplo) — deixar esse texto na entrada da IA só confunde a classificação em vez de ajudar.
// Lista fechada (não um regex genérico "linha toda maiúscula") de propósito: um nome de produto sem
// nenhum dígito na linha (ex.: continuação de nome quebrado tipo "INTELBRAS" numa linha própria)
// também fica todo em maiúsculas e não pode ser confundido com seção. Ajuste esta lista se o
// SERVICE usar outro nome de seção que ainda não apareceu num orçamento real.
const KNOWN_SECTION_NAMES = new Set([
  'ALARME', 'AUTOMAÇÃO', 'AUTOMACAO', 'CFTV', 'CERCA ELÉTRICA', 'CERCA ELETRICA',
  'REDE', 'ENERGIA', 'CONTROLE DE ACESSO', 'ACABAMENTO',
]);
const TOTAL_SECTION_LINE = /^Total de .+:\s*R\$/i;

function stripSectionNoise(text) {
  return text.split('\n').filter((line) => {
    const t = line.trim();
    if (TOTAL_SECTION_LINE.test(t)) return false;
    if (KNOWN_SECTION_NAMES.has(t.toUpperCase())) return false;
    return true;
  }).join('\n');
}

async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  // Valores em R$ não servem à classificação (o prompt manda ignorá-los) e custam token — some com eles.
  const text = stripSectionNoise(stripClientHeader((result.text || '').trim())).replace(/R\$\s*[\d.]+,\d{2}/g, '').replace(/[ \t]{2,}/g, ' ');
  if (!text) throw new Error('Não consegui extrair texto desse PDF (pode ser um PDF escaneado/imagem).');
  return text.length > MAX_PDF_TEXT_CHARS ? text.slice(0, MAX_PDF_TEXT_CHARS) : text;
}

// Texto editável na tela Instruções da IA (aba admin) — "personagem" + regras de negócio da
// classificação. O que fica FORA daqui (formato JSON de saída, injeção de categorias/itens) é
// estrutura técnica fixa: editar isso pela tela quebraria o parsing da resposta.
const DEFAULT_CLASSIFICATION_INSTRUCTIONS = `Você é um especialista em CFTV, alarme, controle de acesso e cerca elétrica que classifica itens de um orçamento nas categorias de um catálogo interno.

Pra cada linha de item (código, quantidade, nome), escolha a categoria SEMANTICAMENTE mais parecida da lista abaixo — não precisa bater caractere por caractere, use conhecimento de equipamentos de segurança eletrônica pra reconhecer sinônimos, marcas e variações de nome.

Dicas específicas deste catálogo (aplique antes de decidir):
- "GRAVADOR DIGITAL DE VIDEO ... NVD ####" (linha Intelbras) é sempre um NVR (gravador em rede IP), nunca DVR, mesmo com esse nome genérico — os 2 últimos dígitos do modelo NVD são o número de canais (ex.: NVD 3032 = 32 canais).
- Um switch com "PORTAS POE" + "PORTAS GIGABIT" ou "UPLINK" ao mesmo tempo é um Switch PoE Giga (ou "Switch Híbrido PoE" se o nome disser HÍBRIDO), não um Switch PoE Fast comum.
- "MIKROTIK" isolado (sem outro detalhe) é a categoria "Mikrotik".

Copie o valor da categoria escolhida EXATAMENTE como está escrito na lista (mesma acentuação/maiúsculas). Use category:null SOMENTE se não existir nada nem remotamente parecido na lista (ex.: serviço, taxa, item de outro ramo).`;

function buildClassificationPrompt(instructions, pdfText, categoryValues) {
  return [
    instructions,
    '',
    `Categorias do catálogo:\n${JSON.stringify(categoryValues)}`,
    '',
    `Itens do orçamento (ignore preço e valores monetários, eles não importam aqui):\n${pdfText}`,
    '',
    'Responda SOMENTE com um array JSON, sem markdown, sem texto antes ou depois: [{"code":"...","name":"...","quantity":N,"category":"..." ou null}]',
  ].join('\n');
}

// Modelos às vezes embrulham a resposta em ```json apesar do pedido, ou (mais raro) deixam algum
// texto solto antes/depois — pega só o array JSON de dentro da resposta em vez de exigir que a
// string inteira seja JSON puro.
function extractJsonArray(content) {
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('A IA não retornou uma lista em JSON reconhecível.');
  return JSON.parse(match[0]);
}

// Sanitiza a resposta da IA contra o vocabulário real de categorias — uma "category" que a IA
// inventou (alucinação) ou escreveu com variação de texto vira null em vez de entrar quebrada no
// motor de regras (que só entende o value exato da categoria).
function parseClassificationResponse(content, validCategoryValues) {
  const validSet = new Set(validCategoryValues);
  const raw = extractJsonArray(content);
  if (!Array.isArray(raw)) throw new Error('Resposta da IA não é uma lista.');
  return raw.map((entry) => {
    const quantity = Math.max(1, Math.trunc(Number(entry?.quantity)) || 1);
    const category = typeof entry?.category === 'string' && validSet.has(entry.category) ? entry.category : null;
    return { code: String(entry?.code || '').trim(), name: String(entry?.name || '').trim(), quantity, category };
  }).filter((item) => item.name);
}

// Modelo curto demais (ex.: "V5") bate como substring de quase qualquer nome — exige um tamanho
// mínimo pra um produto cadastrado só valer como prova real de identidade.
const MIN_PRODUCT_MODEL_MATCH_LENGTH = 4;

// Produto real cadastrado (aba Produtos) é fonte de verdade mais forte que o palpite semântico da
// IA: se o MODELO de algum produto aparece dentro do nome do item do PDF, usa a categoria desse
// produto direto — sem depender da IA acertar de novo, e sem risco dela inventar uma relação que
// não existe (foi exatamente esse tipo de erro, com o TERMINAL DEDICADO TDMI 400, que motivou isso).
// Prefere o modelo mais longo/específico em caso de mais de um bater (mesma lógica de
// detectExactCategory em lib/specs.js).
function matchRegisteredProductCategory(itemName, products) {
  const normalizedName = normalize(itemName).toLowerCase();
  let bestModel = '';
  let bestCategory = null;
  for (const product of products) {
    const model = normalize(product.model).toLowerCase();
    if (model.length < MIN_PRODUCT_MODEL_MATCH_LENGTH || !normalizedName.includes(model)) continue;
    if (model.length > bestModel.length) { bestModel = model; bestCategory = product.category; }
  }
  return bestCategory;
}

function applyRegisteredProductOverrides(items, products) {
  if (!products?.length) return items;
  return items.map((item) => {
    const category = matchRegisteredProductCategory(item.name, products);
    return category ? { ...item, category } : item;
  });
}

// Chama a IA (com retry) e devolve os itens. `expectedCount`: quantas linhas de equipamento ela tem que
// devolver — o modelo às vezes encerra a saída cedo (resposta de poucas centenas de caracteres, ou lista
// válida porém sem parte dos itens: medido 43 de 51 e 41 de 54), então retenta se o JSON não parseia OU
// se vierem menos itens do que as linhas do PDF; no fim, fica com a resposta mais completa.
// temperature 0: classificar é escolha determinística (com 0,2 o mesmo item trocava de categoria);
// maxTokens explícito: sem teto declarado o provedor cortava a lista no meio.
async function classifyChunk(pdfText, categoryValues, instructions, expectedCount) {
  // Com o layout do SERVICE, item de verdade tem código de uma linha do PDF. Pedaço solto ("PILOTIS",
  // "FACIAL" — observação/continuação de nome) que a IA lista como item é descartado.
  const rowCodes = new Set(parseQuoteRows(pdfText).map((r) => r.code));
  const prompt = buildClassificationPrompt(instructions, pdfText, categoryValues);
  let best = null;
  let lastError = null;
  for (let attempt = 1; attempt <= CLASSIFY_PARSE_ATTEMPTS; attempt++) {
    const { content } = await callOpenRouter({ messages: [{ role: 'user', content: prompt }], temperature: 0, maxTokens: CLASSIFY_MAX_OUTPUT_TOKENS, models: stageModels('OPENROUTER_MODEL_CLASSIFY'), reasoning: NO_REASONING });
    try {
      const items = parseClassificationResponse(content, categoryValues).filter((i) => !INSTALLATION_NAME.test(i.name) && (!rowCodes.size || rowCodes.has(i.code)));
      const complete = items.length >= expectedCount - Math.floor(expectedCount * MAX_MISSING_ITEMS_RATIO);
      if (!best || items.length > best.length) best = items;
      if (complete) break;
    } catch (err) { lastError = err; }
  }
  if (!best) throw lastError;
  return withOmittedRows(best, parseQuoteRows(pdfText));
}

// Última garantia: linha do PDF que a IA omitiu mesmo depois de retentar entra como item SEM categoria
// (aparece na lista "cadastrar produto") em vez de sumir em silêncio do orçamento.
function withOmittedRows(items, rows) {
  const returned = new Map();
  for (const item of items) returned.set(item.code, (returned.get(item.code) || 0) + 1);
  const omitted = rows.filter((row) => {
    const left = returned.get(row.code) || 0;
    if (left > 0) { returned.set(row.code, left - 1); return false; }
    return true;
  });
  return [...items, ...omitted.map((row) => ({ code: row.code, name: row.firstLine, quantity: row.quantity, category: null }))];
}

// Classifica o orçamento em lotes (em paralelo), cada lote com a sua própria checagem de completude.
async function classifyWithAI(pdfText, categoryValues, instructions) {
  const chunks = chunkQuoteText(pdfText, CLASSIFY_CHUNK_ROWS);
  const results = await Promise.all(chunks.map((chunk) => classifyChunk(chunk, categoryValues, instructions, parseQuoteRows(chunk).length)));
  return results.flat();
}

// `memory` (opcional): { load(codes) -> docs, record(votes) } — camada que reaproveita respostas
// anteriores da IA (ver lib/classificationMemory.js). Se TODOS os itens do orçamento já são conhecidos
// (>= 2 respostas iguais guardadas), a IA nem é chamada. Se há algum item novo, a IA classifica o
// orçamento inteiro (nome quebrado em várias linhas precisa do contexto todo) e cada item que ela
// devolveu ganha um voto na memória. Sem `memory` (ou sem linhas no layout do SERVICE), tudo vai pra IA.
async function classifyQuoteItems(pdfText, categories, instructions = DEFAULT_CLASSIFICATION_INSTRUCTIONS, products = [], memory = null) {
  const categoryValues = categories.map((c) => c.value);
  const rows = parseQuoteRows(pdfText);
  if (!memory || !rows.length) {
    return applyRegisteredProductOverrides(await classifyWithAI(pdfText, categoryValues, instructions), products);
  }

  const index = buildMemoryIndex(await memory.load([...new Set(rows.map((r) => r.code))]));
  // Linha que casa com produto cadastrado também é "conhecida": o cadastro manda por cima da IA.
  const isKnown = (row) => index.has(rowKey(row)) || Boolean(matchRegisteredProductCategory(row.firstLine, products));
  if (rows.every(isKnown)) {
    const known = rows.map((row) => {
      const entry = index.get(rowKey(row));
      return { code: row.code, name: entry?.name || row.firstLine, quantity: row.quantity, category: entry?.category ?? null };
    });
    return applyRegisteredProductOverrides(known, products);
  }

  const items = await classifyWithAI(pdfText, categoryValues, instructions);
  const queueByCode = new Map();
  for (const item of items) (queueByCode.get(item.code) || queueByCode.set(item.code, []).get(item.code)).push(item);
  const votes = new Map(); // 1 voto por item único por classificação (linhas repetidas não contam em dobro)
  for (const row of rows) {
    const item = queueByCode.get(row.code)?.shift();
    // Confere que é o mesmo item (a IA às vezes tira/põe prefixo: "CORTEX V5" x "UM CORTEX V5"): se ela
    // devolveu outra coisa nesse código, não grava (evita memória errada).
    const a = item && normalize(item.name).toLowerCase();
    const b = normalize(row.firstLine).toLowerCase();
    const sameItem = item && (b.includes(a.slice(0, 10)) || a.includes(b.slice(0, 10)));
    if (!sameItem || !item.category) continue;
    votes.set(rowKey(row), { code: row.code, firstLine: row.firstLine, name: item.name, category: item.category });
  }
  // Memória é otimização: falhar ao gravar não pode derrubar a validação.
  if (votes.size) await memory.record([...votes.values()]).catch(() => {});
  return applyRegisteredProductOverrides(items, products);
}

// A IA de auditoria não lê mais o PDF cru — ela recebe os itens JÁ casados com o cadastro (rótulo
// oficial da categoria, não o nome bagunçado do ERP) e as pendências que o motor de regras já
// encontrou. Pedido explícito do usuário: motor primeiro, IA audita OS RESULTADOS por cima, não o
// PDF de novo do zero — evita a IA repetir achado óbvio e deixa ela focar no que o motor não pega
// (quantidade estranha, combinação tecnicamente ruim, item faltando que não vira "requirement").
function buildQuoteSummary(items, categoryLabelByValue) {
  const recognized = items.filter((i) => i.category);
  const unrecognized = items.filter((i) => !i.category);
  const lines = recognized.map((i) => `- ${i.quantity}x ${categoryLabelByValue.get(i.category) || i.category} (nome original: "${i.name}")`);
  const unrecognizedLines = unrecognized.map((i) => `- ${i.quantity}x "${i.name}" (código ${i.code})`);
  return [
    'Itens já identificados no catálogo interno:',
    lines.join('\n') || '(nenhum)',
    '',
    'Itens do orçamento que NÃO bateram com nenhuma categoria do catálogo (considere-os também na sua análise, mesmo sem categoria oficial):',
    unrecognizedLines.join('\n') || '(nenhum)',
  ].join('\n');
}

function buildEngineFindingsSummary(engineMissing) {
  if (!engineMissing?.length) return '(o motor de regras não encontrou nenhuma pendência nos itens reconhecidos)';
  return engineMissing.map((m) => `- ${m.label}: ${m.reason}`).join('\n');
}

// Mesma lógica da classificação: texto editável na tela Instruções da IA. O que fica FORA (resumo
// dos itens, fichas técnicas, achados do motor de regras, linha final de formato de resposta) é
// dado injetado/estrutura fixa.
const DEFAULT_AUDIT_INSTRUCTIONS = `Você é um técnico especialista sênior em projetos de CFTV, alarme, controle de acesso e cerca elétrica, revisando um orçamento de um vendedor antes de fechar com o cliente.

Um motor de regras determinístico já rodou sobre os itens e as pendências que ele encontrou aparecem abaixo, junto com os itens do orçamento — não repita essas descobertas, construa em cima delas.

Sua tarefa, em português do Brasil, direto e prático:
- Aponte equipamentos incompatíveis entre si que o motor não pegaria (ex.: tipos de câmera/gravador que não conversam).
- Aponte quantidades que parecem erradas (muito baixas ou muito altas pra o resto do orçamento) — considere também os itens sem categoria.
- Aponte qualquer outro problema técnico relevante que você reconheça no conjunto, incluindo nos itens sem categoria.
- NÃO cite nem reforce as pendências que o motor de regras já listou (nada de "já foi apontado, mas...") — o vendedor já vê essa lista. Só o que for NOVO.
- NÃO invente dependência entre um item e um sistema/marca específica (ex.: Córtex, ONE, iDBM+, SIAM) só porque a ficha técnica desse sistema apareceu no contexto — essa dependência só existe se o NOME do próprio item citar esse sistema. Um terminal/interfone/leitor genérico (de outro fabricante ou sem marca de sistema no nome) funciona standalone e NÃO precisa de Córtex/iDBM+ só por "parecer" um equipamento de portaria/acesso.

Liste NO MÁXIMO 6 pontos, só os mais graves e concretos (incompatibilidade, quantidade claramente errada, item que impede o sistema de funcionar), cada um em 1 ou 2 frases curtas. Só liste o que você tem CERTEZA que é um problema; se houver menos de 6, liste menos. Nunca liste item que está correto ou "ok, mas...". Ignore o que for genérico ou especulativo (aterramento, proteção contra surtos, "verifique se...").
Se não achar nenhum problema real além do que o motor já achou, diga isso claramente em vez de forçar uma crítica.`;

function buildAuditPrompt(instructions, quoteSummary, engineFindingsSummary, knowledge = '') {
  return [
    instructions,
    '',
    quoteSummary,
    '',
    ...(knowledge ? ['Fichas técnicas oficiais dos fornecedores ONE PORTARIA e SIAM — aplicam-se SOMENTE aos itens do orçamento cujo nome cite esse fornecedor/sistema (Córtex, Endpoint, iDBM+, RAS, SIAM etc.); trate como fonte de verdade de capacidade/alimentação/compatibilidade só para esses itens, e não estenda essas regras a nenhum outro item do orçamento:', knowledge, ''] : []),
    'Pendências já encontradas pelo motor de regras:',
    engineFindingsSummary,
    '',
    'Responda em português, direto pro vendedor, sem introdução nem conclusão, sem inventar tabela nem JSON.',
  ].join('\n');
}

async function auditQuoteWithAI(items, categories, engineMissing, instructions = DEFAULT_AUDIT_INSTRUCTIONS) {
  const categoryLabelByValue = new Map(categories.map((c) => [c.value, c.label]));
  const quoteSummary = buildQuoteSummary(items, categoryLabelByValue);
  const engineFindingsSummary = buildEngineFindingsSummary(engineMissing);
  const knowledge = relevantKnowledge(items);
  const { content } = await callOpenRouter({ messages: [{ role: 'user', content: buildAuditPrompt(instructions, quoteSummary, engineFindingsSummary, knowledge) }], temperature: 0.4, maxTokens: AUDIT_MAX_OUTPUT_TOKENS, models: stageModels('OPENROUTER_MODEL_AUDIT'), reasoning: NO_REASONING });
  return content.trim();
}

module.exports = {
  extractPdfText, classifyQuoteItems, auditQuoteWithAI, parseClassificationResponse,
  stripSectionNoise, MAX_PDF_TEXT_CHARS, PDF_AUDIT_MAX_BYTES,
  DEFAULT_CLASSIFICATION_INSTRUCTIONS, DEFAULT_AUDIT_INSTRUCTIONS,
  applyRegisteredProductOverrides,
};
