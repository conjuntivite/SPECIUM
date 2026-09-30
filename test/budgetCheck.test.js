// Conferência do orçamento do Assistente antes de mostrar: regra (motor), não segunda opinião do LLM.
// Sem retentativa, e nunca bloqueia a resposta.
const test = require('node:test');
const assert = require('node:assert/strict');
const { categories, resources } = require('../data/catalog-snapshot.json');
const { reviewAssistantAnswer } = require('../lib/budgetCheck');

const rascunho = (endpoints) => `Segue o orçamento:\n\n- 1x Central ONE (Córtex)\n- 1x Switch Giga 8 Portas\n- ${endpoints}x Endpoint ONE 4 Portas\n- 20x Fonte 12V\n- 4x Fechadura Magnética\n- 2x Automação de Portão\n- 6x Sensor Magnético\n- 4x Antena UHF Veicular\n- 4x Terminal Facial\n\n**Premissas:** nenhuma.`;
const classify = async (lines) => lines.map((l) => { const [, q, name] = l.match(/(\d+)x (.+)/); const category = categories.find((c) => c.value === name || c.value.startsWith(`${name} (`))?.value ?? null; return { name, quantity: Number(q), category }; });
const base = { classify, loadCatalog: async () => ({ categories, resources }) };

test('resposta sem orçamento passa direto, sem classificar', async () => {
  let calls = 0;
  const r = await reviewAssistantAnswer({ ...base, answer: 'Qual o tipo de motor do portão?', classify: async () => { calls += 1; } });
  assert.equal(r.answer, 'Qual o tipo de motor do portão?');
  assert.equal(calls, 0);
});

test('orçamento certo sai igual, sem avisos', async () => {
  const r = await reviewAssistantAnswer({ ...base, answer: rascunho(2) });
  assert.deepEqual(r.problems, []);
  assert.equal(r.answer, rascunho(2));
});

test('4 endpoints para demanda de 2: a resposta sai com o aviso da conta no fim', async () => {
  const r = await reviewAssistantAnswer({ ...base, answer: rascunho(4) });
  assert.ok(r.answer.startsWith(rascunho(4)));
  assert.match(r.answer, /Conferência automática/);
  assert.match(r.answer, /Endpoint ONE 4 Portas: o orçamento tem 4, a conta .* dá 2/);
});

test('o aviso não vira linha de item ("- Nx") na importação', async () => {
  const { extractBudgetLines } = require('../lib/equipmentKnowledge');
  const r = await reviewAssistantAnswer({ ...base, answer: rascunho(4) });
  assert.equal(extractBudgetLines(r.answer).length, extractBudgetLines(rascunho(4)).length);
});

test('falha na conferência nunca bloqueia: devolve a resposta original', async () => {
  const r = await reviewAssistantAnswer({ ...base, answer: rascunho(4), classify: async () => { throw new Error('OpenRouter fora'); } });
  assert.equal(r.answer, rascunho(4));
  assert.deepEqual(r.problems, []);
});
