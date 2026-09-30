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

const semFacial = rascunho(2).replace('- 4x Terminal Facial\n', '');
const pedido = (content) => [{ role: 'user', content }];

test('pedido cita facial e a lista não tem: avisa', async () => {
  const r = await reviewAssistantAnswer({ ...base, messages: pedido('4 portas com faciais'), answer: semFacial });
  assert.match(r.answer, /Conferência automática/);
  assert.match(r.answer, /facial/i);
});

test('pedido cita facial e a lista tem: sem aviso de facial', async () => {
  const r = await reviewAssistantAnswer({ ...base, messages: pedido('4 portas com faciais'), answer: rascunho(2) });
  assert.deepEqual(r.problems, []);
});

test('pedido não cita facial: lista sem facial não gera aviso', async () => {
  const r = await reviewAssistantAnswer({ ...base, messages: pedido('4 portas com leitor de tag'), answer: semFacial });
  assert.deepEqual(r.problems, []);
});

test('facial citado em mensagem anterior da conversa também vale', async () => {
  const messages = [...pedido('quero faciais'), { role: 'assistant', content: 'ok' }, { role: 'user', content: 'pode montar' }];
  const r = await reviewAssistantAnswer({ ...base, messages, answer: semFacial });
  assert.match(r.answer, /facial/i);
});

// Pergunta de "como se distribui" uma quantidade que o comercial já informou (ex.: "4 antenas = 2 por
// portão ou 4 portões?") não muda a conta e só atrasa: a conferência tira da seção "Falta confirmar".
const comPerguntas = (...bullets) => `${rascunho(2)}\n\n**Falta confirmar:**\n${bullets.map((b) => `- ${b}`).join('\n')}`;
const PERGUNTA_ANTENA = 'As 4 antenas iDUHF são 2 por portão ou 1 por porta?';

test('pergunta de distribuição de quantidade já informada sai de Falta confirmar; as outras ficam', async () => {
  const r = await reviewAssistantAnswer({ ...base, messages: pedido('4 antenas Control iD nos portões'), answer: comPerguntas(PERGUNTA_ANTENA, 'Quantas câmeras?') });
  assert.doesNotMatch(r.answer, /antenas iDUHF/);
  assert.match(r.answer, /Quantas câmeras\?/);
  assert.deepEqual(r.dropped, [`- ${PERGUNTA_ANTENA}`]);
});

test('sem a quantidade no pedido, a pergunta é legítima e fica', async () => {
  const r = await reviewAssistantAnswer({ ...base, messages: pedido('antenas Control iD nos portões'), answer: comPerguntas(PERGUNTA_ANTENA) });
  assert.match(r.answer, /antenas iDUHF/);
  assert.deepEqual(r.dropped, []);
});

test('pergunta sem "ou/por" não é de distribuição e fica', async () => {
  const r = await reviewAssistantAnswer({ ...base, messages: pedido('4 antenas'), answer: comPerguntas('Qual a distância até as 4 antenas?') });
  assert.match(r.answer, /distância/);
});

test('tirou todas as perguntas: o título "Falta confirmar" também sai', async () => {
  const r = await reviewAssistantAnswer({ ...base, messages: pedido('4 antenas'), answer: comPerguntas(PERGUNTA_ANTENA) });
  assert.doesNotMatch(r.answer, /Falta confirmar/);
});

test('"Quantas antenas por portão?" com o total de antenas já informado também sai', async () => {
  const pergunta = 'Quantas antenas por portão? Considerei 2 por portão (4 no total) — se for 1 por portão, ajustar para 2.';
  const r = await reviewAssistantAnswer({ ...base, messages: pedido('4 antenas Control iD'), answer: comPerguntas(pergunta, 'Quantas câmeras?') });
  assert.doesNotMatch(r.answer, /antenas por portão/);
  assert.match(r.answer, /Quantas câmeras\?/);
});

test('"Quantas antenas por portão?" sem o total no pedido é pergunta legítima e fica', async () => {
  const r = await reviewAssistantAnswer({ ...base, messages: pedido('antenas nos portões'), answer: comPerguntas('Quantas antenas por portão?') });
  assert.match(r.answer, /antenas por portão/);
});

test('pergunta de quantidade de algo cujo total o pedido já trouxe sai, qualquer que seja a frase', async () => {
  for (const pergunta of ['Quantidade exata de antenas (4 para 2 portões? Ou 2?).', 'Quantas antenas iDUHF no total: 2 ou 4? (mudei a conta assumindo 2)']) {
    const r = await reviewAssistantAnswer({ ...base, messages: pedido('4 antenas Control iD'), answer: comPerguntas(pergunta, 'Quantas câmeras?') });
    assert.doesNotMatch(r.answer, /antenas/, pergunta);
    assert.match(r.answer, /Quantas câmeras\?/);
  }
});

test('pergunta de quantidade de OUTRA coisa (não informada) fica, mesmo citando uma coisa informada', async () => {
  const r = await reviewAssistantAnswer({ ...base, messages: pedido('faciais nas 4 portas'), answer: comPerguntas('Quantos faciais por porta?') });
  assert.match(r.answer, /Quantos faciais por porta\?/);
});

test('falso positivo real: "6 portas" no pedido não torna legítima a pergunta de quantos faciais', async () => {
  const pergunta = 'Quantos faciais serão? (6 portas = 6 faciais, ou 1 por porta + saída?)';
  const r = await reviewAssistantAnswer({ ...base, messages: pedido('6 portas com eletroímã e faciais'), answer: comPerguntas(pergunta) });
  assert.match(r.answer, /Quantos faciais serão\?/);
  assert.deepEqual(r.dropped, []);
});
