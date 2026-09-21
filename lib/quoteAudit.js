const { PDFParse } = require('pdf-parse');
const { callOpenRouter } = require('./openrouter');
const { relevantKnowledge } = require('./equipmentKnowledge');

const MAX_PDF_TEXT_CHARS = 20000; // orçamento real cabe folgado nisso; corta pra não estourar contexto do modelo grátis
const PDF_AUDIT_MAX_BYTES = 15 * 1024 * 1024; // mesmo teto da planta baixa (lib/floorPlan.js)

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
  const text = stripSectionNoise(stripClientHeader((result.text || '').trim()));
  if (!text) throw new Error('Não consegui extrair texto desse PDF (pode ser um PDF escaneado/imagem).');
  return text.length > MAX_PDF_TEXT_CHARS ? text.slice(0, MAX_PDF_TEXT_CHARS) : text;
}

// Pistas de domínio já aprendidas em sessões anteriores (ver memória do projeto) — sem isso um
// modelo genérico erra casos específicos do catálogo desta empresa (ex.: chamou "GRAVADOR DIGITAL
// DE VIDEO ... NVD" de DVR quando essa linha da Intelbras é NVR de verdade).
const DOMAIN_HINTS = `Dicas específicas deste catálogo (aplique antes de decidir):
- "GRAVADOR DIGITAL DE VIDEO ... NVD ####" (linha Intelbras) é sempre um NVR (gravador em rede IP), nunca DVR, mesmo com esse nome genérico — os 2 últimos dígitos do modelo NVD são o número de canais (ex.: NVD 3032 = 32 canais).
- Um switch com "PORTAS POE" + "PORTAS GIGABIT" ou "UPLINK" ao mesmo tempo é um Switch PoE Giga (ou "Switch Híbrido PoE" se o nome disser HÍBRIDO), não um Switch PoE Fast comum.
- "MIKROTIK" isolado (sem outro detalhe) é a categoria "Mikrotik".`;

function buildClassificationPrompt(pdfText, categoryValues) {
  return [
    'Você é um especialista em CFTV, alarme, controle de acesso e cerca elétrica que classifica itens de um orçamento nas categorias de um catálogo interno.',
    '',
    'Pra cada linha de item (código, quantidade, nome), escolha a categoria SEMANTICAMENTE mais parecida da lista abaixo — não precisa bater caractere por caractere, use conhecimento de equipamentos de segurança eletrônica pra reconhecer sinônimos, marcas e variações de nome.',
    '',
    DOMAIN_HINTS,
    '',
    'Copie o valor da categoria escolhida EXATAMENTE como está escrito na lista (mesma acentuação/maiúsculas). Use category:null SOMENTE se não existir nada nem remotamente parecido na lista (ex.: serviço, taxa, item de outro ramo).',
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

async function classifyQuoteItems(pdfText, categories) {
  const categoryValues = categories.map((c) => c.value);
  const prompt = buildClassificationPrompt(pdfText, categoryValues);
  const { content } = await callOpenRouter({ messages: [{ role: 'user', content: prompt }] });
  return parseClassificationResponse(content, categoryValues);
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

function buildAuditPrompt(quoteSummary, engineFindingsSummary, knowledge = '') {
  return [
    'Você é um técnico especialista sênior em projetos de CFTV, alarme, controle de acesso e cerca elétrica, revisando um orçamento de um vendedor antes de fechar com o cliente.',
    '',
    quoteSummary,
    '',
    ...(knowledge ? ['Fichas técnicas oficiais dos fornecedores ONE PORTARIA e SIAM para itens deste orçamento — trate como fonte de verdade sobre capacidade, alimentação e compatibilidade (só use o que estiver aqui pra esses itens, não invente specs):', knowledge, ''] : []),
    'Um motor de regras determinístico já rodou sobre esses itens e encontrou as seguintes pendências (não repita essas descobertas — construa em cima delas):',
    engineFindingsSummary,
    '',
    'Sua tarefa, em português do Brasil, direto e prático:',
    '- Aponte equipamentos incompatíveis entre si que o motor não pegaria (ex.: tipos de câmera/gravador que não conversam).',
    '- Aponte quantidades que parecem erradas (muito baixas ou muito altas pra o resto do orçamento) — considere também os itens sem categoria.',
    '- Aponte qualquer outro problema técnico relevante que você reconheça no conjunto, incluindo nos itens sem categoria.',
    '- Não repita as pendências que o motor de regras já listou acima — a menos que tenha algo a acrescentar sobre elas.',
    '',
    'Se não achar nenhum problema real além do que o motor já achou, diga isso claramente em vez de forçar uma crítica. Responda em texto corrido curto, direto pro vendedor, sem inventar tabela nem JSON.',
  ].join('\n');
}

async function auditQuoteWithAI(items, categories, engineMissing) {
  const categoryLabelByValue = new Map(categories.map((c) => [c.value, c.label]));
  const quoteSummary = buildQuoteSummary(items, categoryLabelByValue);
  const engineFindingsSummary = buildEngineFindingsSummary(engineMissing);
  const knowledge = relevantKnowledge(items);
  const { content } = await callOpenRouter({ messages: [{ role: 'user', content: buildAuditPrompt(quoteSummary, engineFindingsSummary, knowledge) }], temperature: 0.4 });
  return content.trim();
}

module.exports = {
  extractPdfText, classifyQuoteItems, auditQuoteWithAI, parseClassificationResponse,
  stripSectionNoise, MAX_PDF_TEXT_CHARS, PDF_AUDIT_MAX_BYTES,
};
