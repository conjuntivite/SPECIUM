const test = require('node:test');
const assert = require('node:assert/strict');

// A IA é simulada: o teste conta quantas vezes ela foi chamada e o que foi pedido a ela.
const openrouter = require('../lib/openrouter');
const aiCalls = [];
let aiAnswer = () => '[]';
openrouter.callOpenRouter = async ({ messages }) => {
  aiCalls.push(messages[0].content);
  return { content: aiAnswer(messages[0].content), model: 'fake' };
};

const { parseQuoteRows, buildMemoryIndex } = require('../lib/classificationMemory');
const { classifyQuoteItems } = require('../lib/quoteAudit');

const PDF = [
  'Código Qtdade Unitário Total\tProdutos Observações',
  '004720 1 UM CORTEX V5',
  '007813 6 CONTROLADOR ENDPOINT ONEPORTARIA',
  '003001 2 QUADRO DE COMANDO 120X80X20',
  'PERFURADA',
  '009999 1 INSTALAÇÃO DE ALARME',
].join('\n');
const CATEGORIES = [{ value: 'Servidor de Controle de Acesso' }, { value: 'Endpoint ONE' }, { value: 'Quadro de Comando' }];

test('parseQuoteRows: pega código, quantidade e primeira linha do nome; ignora instalação e continuação', () => {
  assert.deepEqual(parseQuoteRows(PDF), [
    { code: '004720', quantity: 1, firstLine: 'UM CORTEX V5' },
    { code: '007813', quantity: 6, firstLine: 'CONTROLADOR ENDPOINT ONEPORTARIA' },
    { code: '003001', quantity: 2, firstLine: 'QUADRO DE COMANDO 120X80X20' },
  ]);
});

test('buildMemoryIndex: só vale com 2+ acertos iguais; uma categoria divergente invalida', () => {
  const doc = (category, count, firstLine = 'UM CORTEX V5') => ({ code: '004720', firstLine, category, count, name: 'UM CORTEX V5 COMPLETO' });
  assert.equal(buildMemoryIndex([doc('Servidor de Controle de Acesso', 1)]).size, 0);
  assert.equal(buildMemoryIndex([doc('Servidor de Controle de Acesso', 2)]).get('004720|UM CORTEX V5').category, 'Servidor de Controle de Acesso');
  assert.equal(buildMemoryIndex([doc('Servidor de Controle de Acesso', 5), doc('Endpoint ONE', 1)]).size, 0);
});

test('classifyQuoteItems com memória: primeira vez chama a IA e registra; depois de 2 acertos não chama mais', async () => {
  const store = new Map();
  const memory = {
    load: async (codes) => [...store.values()].filter((d) => codes.includes(d.code)),
    record: async (votes) => votes.forEach((v) => {
      const id = `${v.code}|${v.firstLine}|${v.category}`;
      store.set(id, { ...v, count: (store.get(id)?.count || 0) + 1 });
    }),
  };
  aiAnswer = () => JSON.stringify([
    { code: '004720', name: 'UM CORTEX V5', quantity: 1, category: 'Servidor de Controle de Acesso' },
    { code: '007813', name: 'CONTROLADOR ENDPOINT ONEPORTARIA', quantity: 6, category: 'Endpoint ONE' },
    { code: '003001', name: 'QUADRO DE COMANDO 120X80X20 PERFURADA', quantity: 2, category: 'Quadro de Comando' },
  ]);

  aiCalls.length = 0;
  await classifyQuoteItems(PDF, CATEGORIES, undefined, [], memory);
  await classifyQuoteItems(PDF, CATEGORIES, undefined, [], memory);
  assert.equal(aiCalls.length, 2);

  const third = await classifyQuoteItems(PDF, CATEGORIES, undefined, [], memory);
  assert.equal(aiCalls.length, 2, 'com 2 acertos guardados a IA não é mais chamada');
  assert.deepEqual(third.map((i) => [i.code, i.quantity, i.category]), [
    ['004720', 1, 'Servidor de Controle de Acesso'],
    ['007813', 6, 'Endpoint ONE'],
    ['003001', 2, 'Quadro de Comando'],
  ]);
  assert.equal(third[2].name, 'QUADRO DE COMANDO 120X80X20 PERFURADA', 'nome completo vem da memória');
});

test('classifyQuoteItems com item novo: a IA classifica o orçamento inteiro (nome quebrado precisa do contexto)', async () => {
  const recorded = [];
  const memory = {
    load: async () => [{ code: '004720', firstLine: 'UM CORTEX V5', category: 'Servidor de Controle de Acesso', count: 3, name: 'UM CORTEX V5' }],
    record: async (votes) => recorded.push(...votes),
  };
  aiAnswer = () => JSON.stringify([
    { code: '004720', name: 'UM CORTEX V5', quantity: 1, category: 'Servidor de Controle de Acesso' },
    { code: '007813', name: 'CONTROLADOR ENDPOINT ONEPORTARIA', quantity: 6, category: 'Endpoint ONE' },
    { code: '003001', name: 'QUADRO DE COMANDO 120X80X20 PERFURADA', quantity: 2, category: 'Quadro de Comando' },
  ]);
  aiCalls.length = 0;
  const items = await classifyQuoteItems(PDF, CATEGORIES, undefined, [], memory);
  assert.equal(aiCalls.length, 1);
  assert.deepEqual(items.map((i) => i.code), ['004720', '007813', '003001']);
  assert.equal(recorded.length, 3, 'todo item devolvido ganha um voto');
});

test('classifyQuoteItems: linhas repetidas do mesmo item dão 1 voto só; resposta com outro nome não é gravada', async () => {
  const recorded = [];
  const memory = { load: async () => [], record: async (votes) => recorded.push(...votes) };
  const pdf = ['004720 1 UM CORTEX V5', '004720 2 UM CORTEX V5', '007813 1 CONTROLADOR ENDPOINT'].join('\n');
  aiAnswer = () => JSON.stringify([
    { code: '004720', name: 'UM CORTEX V5', quantity: 1, category: 'Servidor de Controle de Acesso' },
    { code: '004720', name: 'UM CORTEX V5', quantity: 2, category: 'Servidor de Controle de Acesso' },
    { code: '007813', name: 'OUTRA COISA QUALQUER', quantity: 1, category: 'Endpoint ONE' },
  ]);
  await classifyQuoteItems(pdf, CATEGORIES, undefined, [], memory);
  assert.deepEqual(recorded.map((v) => v.code), ['004720']);
});

test('classifyQuoteItems: linha que casa com produto cadastrado conta como conhecida (IA não é chamada)', async () => {
  const memory = { load: async () => [], record: async () => {} };
  const products = [
    { category: 'Servidor de Controle de Acesso', brand: 'ONE', model: 'CORTEX V5' },
    { category: 'Endpoint ONE', brand: 'ONE', model: 'ENDPOINT ONEPORTARIA' },
    { category: 'Quadro de Comando', brand: 'X', model: 'QUADRO DE COMANDO 120X80X20' },
  ];
  aiCalls.length = 0;
  const items = await classifyQuoteItems(PDF, CATEGORIES, undefined, products, memory);
  assert.equal(aiCalls.length, 0);
  assert.deepEqual(items.map((i) => i.category), ['Servidor de Controle de Acesso', 'Endpoint ONE', 'Quadro de Comando']);
});

test('classifyQuoteItems: a IA devolver o nome sem prefixo ("CORTEX V5" para "UM CORTEX V5") ainda grava o voto', async () => {
  const recorded = [];
  const memory = { load: async () => [], record: async (votes) => recorded.push(...votes) };
  aiAnswer = () => JSON.stringify([
    { code: '004720', name: 'CORTEX V5', quantity: 1, category: 'Servidor de Controle de Acesso' },
    { code: '007813', name: 'CONTROLADOR ENDPOINT ONEPORTARIA', quantity: 6, category: 'Endpoint ONE' },
    { code: '003001', name: 'QUADRO DE COMANDO 120X80X20', quantity: 2, category: 'Quadro de Comando' },
  ]);
  await classifyQuoteItems(PDF, CATEGORIES, undefined, [], memory);
  assert.deepEqual(recorded.map((v) => v.code).sort(), ['003001', '004720', '007813']);
});

const { chunkQuoteText } = require('../lib/classificationMemory');

test('chunkQuoteText: divide em lotes de N linhas de item, mantendo a continuação do nome com a sua linha', () => {
  const lines = ['Código Qtdade Unitário Total\tProdutos'];
  for (let i = 1; i <= 5; i++) { lines.push(`00000${i} 1 ITEM ${i}`); if (i === 2) lines.push('CONTINUACAO DO 2'); }
  const chunks = chunkQuoteText(lines.join('\n'), 2);
  assert.equal(chunks.length, 3);
  assert.match(chunks[0], /ITEM 2\nCONTINUACAO DO 2$/);
  assert.match(chunks[1], /^000003 1 ITEM 3/);
  assert.equal(chunkQuoteText('sem linhas de item', 2).length, 1);
});

test('classifyQuoteItems: orçamento grande vai em lotes e nenhum item se perde', async () => {
  const rows = Array.from({ length: 45 }, (_, i) => `${String(100000 + i)} 1 ITEM NUMERO ${i}`);
  // IA simulada: devolve tudo que está no trecho que recebeu (cada lote é um trecho menor)
  aiAnswer = (prompt) => JSON.stringify(
    [...prompt.matchAll(/^(\d{6}) (\d+) (ITEM NUMERO \d+)$/gm)].map((m) => ({ code: m[1], name: m[3], quantity: 1, category: 'Quadro de Comando' })),
  );
  aiCalls.length = 0;
  const items = await classifyQuoteItems(rows.join('\n'), CATEGORIES, undefined, [], null);
  assert.ok(aiCalls.length >= 3, 'mais de uma chamada (lotes)');
  assert.equal(items.length, 45);
  assert.deepEqual(items.map((i) => i.code), rows.map((r) => r.slice(0, 6)), 'ordem do PDF preservada');
});

test('classifyQuoteItems: pedaço de texto solto que a IA listou como item (sem código do PDF) é descartado', async () => {
  aiAnswer = () => JSON.stringify([
    { code: '004720', name: 'UM CORTEX V5', quantity: 1, category: 'Servidor de Controle de Acesso' },
    { code: '', name: 'PILOTIS', quantity: 1, category: null },
    { code: '999999', name: 'CODIGO QUE NAO ESTA NO PDF', quantity: 1, category: null },
    { code: '007813', name: 'CONTROLADOR ENDPOINT ONEPORTARIA', quantity: 6, category: 'Endpoint ONE' },
    { code: '003001', name: 'QUADRO DE COMANDO 120X80X20', quantity: 2, category: 'Quadro de Comando' },
  ]);
  const items = await classifyQuoteItems(PDF, CATEGORIES, undefined, [], null);
  assert.deepEqual(items.map((i) => i.code), ['004720', '007813', '003001']);
});

test('classifyQuoteItems: linha do PDF que a IA omitiu mesmo após retentar entra como item sem categoria (não some)', async () => {
  aiAnswer = () => JSON.stringify([
    { code: '004720', name: 'UM CORTEX V5', quantity: 1, category: 'Servidor de Controle de Acesso' },
    { code: '003001', name: 'QUADRO DE COMANDO 120X80X20', quantity: 2, category: 'Quadro de Comando' },
  ]);
  const items = await classifyQuoteItems(PDF, CATEGORIES, undefined, [], null);
  assert.equal(items.length, 3);
  const filled = items.find((i) => i.code === '007813');
  assert.deepEqual([filled.name, filled.quantity, filled.category], ['CONTROLADOR ENDPOINT ONEPORTARIA', 6, null]);
});
