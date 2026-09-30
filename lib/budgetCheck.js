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

// classify(linhas) -> [{ name, quantity, category }]; loadCatalog() -> { categories, resources }
async function reviewAssistantAnswer({ messages = [], answer, classify, loadCatalog }) {
  try {
    const lines = extractBudgetLines(answer);
    if (!lines.length) return { answer, problems: [] };
    const { categories, resources } = await loadCatalog();
    const request = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
    const problems = checkBudgetDraft(await classify(lines), categories, resources, request);
    if (!problems.length) return { answer, problems };
    return { answer: `${answer}\n\n**Conferência automática (itens a revisar):**\n${problems.map((p) => `- ${p}`).join('\n')}`, problems };
  } catch (err) {
    console.error('Conferência do orçamento do assistente falhou:', err.message);
    return { answer, problems: [] };
  }
}

module.exports = { reviewAssistantAnswer, checkBudgetDraft };
