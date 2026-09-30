// Conferência do orçamento que o Assistente escreve, ANTES de mostrar ao comercial. Quem confere é o
// motor de regras (recursos/capacidade + conta dos endpoints ONE), não uma segunda opinião do LLM. Achou
// problema: a resposta sai com os avisos no fim. Sem retentativa de propósito: testado com o modelo
// atual, ele ignora a correção pedida e a segunda geração só somava ~50 s. Qualquer falha aqui
// (classificador fora do ar etc.) devolve a resposta original: a conferência nunca impede a resposta.
const { extractBudgetLines, buildBudgetFromClassified } = require('./equipmentKnowledge');
const { computeCategoryMissingEssentials } = require('./recipeEngine');

// `request` = o que o comercial escreveu na conversa: serve pra conferir o que ele pediu e a lista esqueceu.
function checkBudgetDraft(classified, categories, resources, request = '') {
  const { items, adjustments } = buildBudgetFromClassified(classified, categories);
  const { requirements_by_category: byCategory } = computeCategoryMissingEssentials(items.map(({ title, quantity }) => ({ title, quantity })), categories, resources);
  const critical = new Map();
  for (const list of Object.values(byCategory)) for (const r of list) if (r.severity === 'critical' && !critical.has(r.key)) critical.set(r.key, r.reason);
  const forgotten = [];
  if (/facia(l|is)/i.test(request) && !items.some((i) => i.title === 'Terminal Facial' || /facial/i.test(i.title))) {
    forgotten.push('O pedido cita leitor facial, mas o orçamento não tem nenhum Terminal Facial.');
  }
  return [...adjustments, ...critical.values(), ...forgotten];
}

// O modelo às vezes pergunta de novo "como se distribui" uma quantidade que o comercial já informou
// (ex.: "4 antenas = 2 por portão ou 4 portões?"), mesmo dizendo que não muda a conta. Só tira da seção
// "Falta confirmar" a pergunta que cita "N coisa" igual ao pedido E oferece alternativa ("ou") de
// distribuição ("por portão", "distribuição"); qualquer outra pergunta fica. Prompt sozinho não resolveu
// (testado: 2 em 10 respostas seguiam repetindo).
const QUANTITY = /(\d+)\s+([a-zà-ú]{4,})/gi;
const ALTERNATIVE = /\bou\b/i;
const DISTRIBUTION = /\bpor\s+(porta|portão|portões|sentido|via|lado)|distribui/i;
const quantityKeys = (text) => new Set([...String(text).matchAll(QUANTITY)].map((m) => `${m[1]} ${m[2].toLowerCase().slice(0, 5)}`));
// "Quantas antenas...", "Quantidade exata de antenas": pergunta de quantidade cujo objeto (a 1ª palavra
// depois) já tem total no pedido. Só o objeto conta: "Quantos faciais por porta?" com "4 portas" no
// pedido é outra pergunta e fica.
const HOW_MANY = /(?:quantas?|quantos?|quantidade)\s+(?:exata\s+)?(?:de\s+)?(?:as\s+|os\s+)?([a-zà-ú]{4,})/i;
const stem = (word) => word.toLowerCase().slice(0, 5);
const UNITS = new Set(['porta', 'portõ', 'senti', 'lado']);
function repeatsAnsweredQuantity(line, asked) {
  const howMany = line.match(HOW_MANY);
  if (howMany && [...asked].some((k) => k.split(' ')[1] === stem(howMany[1]))) return true;
  // A unidade da distribuição ("por porta") não conta como a quantidade informada: "6 portas" no pedido
  // não torna repetida a pergunta de quantos faciais, por exemplo.
  const countable = [...quantityKeys(line)].filter((k) => !UNITS.has(k.split(' ')[1]));
  return ALTERNATIVE.test(line) && DISTRIBUTION.test(line) && countable.some((k) => asked.has(k));
}

function dropAnsweredQuestions(answer, request) {
  const asked = quantityKeys(request);
  const lines = answer.split('\n');
  const start = lines.findIndex((l) => /falta confirmar/i.test(l));
  if (start < 0 || !asked.size) return { answer, dropped: [] };
  let end = start + 1;
  while (end < lines.length && /^\s*[-*]\s/.test(lines[end])) end += 1;
  const dropped = [];
  const kept = lines.slice(start + 1, end).filter((line) => {
    const repeated = repeatsAnsweredQuantity(line, asked);
    if (repeated) dropped.push(line.trim());
    return !repeated;
  });
  if (!dropped.length) return { answer, dropped };
  const before = lines.slice(0, start);
  if (!kept.length) while (before.length && !before[before.length - 1].trim()) before.pop();
  const rebuilt = kept.length ? [...before, lines[start], ...kept, ...lines.slice(end)] : [...before, ...lines.slice(end)];
  return { answer: rebuilt.join('\n'), dropped };
}

// classify(linhas) -> [{ name, quantity, category }]; loadCatalog() -> { categories, resources }
async function reviewAssistantAnswer({ messages = [], answer, classify, loadCatalog }) {
  try {
    const lines = extractBudgetLines(answer);
    if (!lines.length) return { answer, problems: [], dropped: [] };
    const { categories, resources } = await loadCatalog();
    const request = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
    const problems = checkBudgetDraft(await classify(lines), categories, resources, request);
    const { answer: cleaned, dropped } = dropAnsweredQuestions(answer, request);
    if (!problems.length) return { answer: cleaned, problems, dropped };
    return { answer: `${cleaned}\n\n**Conferência automática (itens a revisar):**\n${problems.map((p) => `- ${p}`).join('\n')}`, problems, dropped };
  } catch (err) {
    console.error('Conferência do orçamento do assistente falhou:', err.message);
    return { answer, problems: [], dropped: [] };
  }
}

module.exports = { reviewAssistantAnswer, checkBudgetDraft };
