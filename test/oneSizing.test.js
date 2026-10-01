// Orçamento importado do Assistente: a quantidade de Endpoint ONE 4 Portas sai da conta do motor
// (relés, entradas de sensor e Wiegand que os outros cards consomem), não do número que o LLM escreveu.
const test = require('node:test');
const assert = require('node:assert/strict');
const { categories } = require('../data/catalog-snapshot.json');
const { buildBudgetFromClassified } = require('../lib/equipmentKnowledge');

const entradas = (lista) => lista.map(([category, quantity]) => ({ category, quantity }));
const FECHADURAS_E_PORTOES = [['Fechadura Magnética', 4], ['Automação de Portão', 2], ['Sensor Magnético', 6], ['Antena UHF Veicular', 4], ['Terminal Facial', 4]];
const qtd = (items, title) => items.find((i) => i.title === title)?.quantity;

test('LLM listou 4 endpoints: o motor corrige para 2 e avisa', () => {
  const { items, adjustments } = buildBudgetFromClassified(entradas([['Central ONE (Córtex)', 1], ['Endpoint ONE 4 Portas', 4], ...FECHADURAS_E_PORTOES]), categories);
  assert.equal(qtd(items, 'Endpoint ONE 4 Portas'), 2);
  assert.equal(adjustments.length, 1);
  assert.match(adjustments[0], /tem 4, a conta .* dá 2/);
});

test('sem endpoint no orçamento o motor acrescenta o FULL (8 sensores), nunca o 4 Portas sem pedido', () => {
  const { items, adjustments } = buildBudgetFromClassified(entradas([['Central ONE (Córtex)', 1], ...FECHADURAS_E_PORTOES]), categories);
  assert.equal(qtd(items, 'Endpoint ONE FULL'), 2);
  assert.equal(qtd(items, 'Endpoint ONE 4 Portas'), undefined);
  assert.match(adjustments[0], /Endpoint ONE FULL: o orçamento não tem, a conta .* dá 2/);
});

test('4 relés e 8 sensores cabem em 1 FULL (o 4 Portas pediria 2)', () => {
  const { items } = buildBudgetFromClassified(entradas([['Central ONE (Córtex)', 1], ['Fechadura Magnética', 4], ['Sensor Magnético', 8]]), categories);
  assert.equal(qtd(items, 'Endpoint ONE FULL'), 1);
});

test('quantidade já certa: nada muda e nada é avisado', () => {
  const { items, adjustments } = buildBudgetFromClassified(entradas([['Central ONE (Córtex)', 1], ['Endpoint ONE 4 Portas', 2], ...FECHADURAS_E_PORTOES]), categories);
  assert.equal(qtd(items, 'Endpoint ONE 4 Portas'), 2);
  assert.deepEqual(adjustments, []);
});

test('endpoint FULL informado entra na conta: 1 FULL + 1 4 Portas cobrem 6 relés, 6 sensores e 4 Wiegand', () => {
  const { items } = buildBudgetFromClassified(entradas([['Central ONE (Córtex)', 1], ['Endpoint ONE FULL', 1], ['Endpoint ONE 4 Portas', 3], ...FECHADURAS_E_PORTOES]), categories);
  assert.equal(qtd(items, 'Endpoint ONE FULL'), 1);
  assert.equal(qtd(items, 'Endpoint ONE 4 Portas'), 1);
});

test('orçamento sem ONE (SIAM) não ganha endpoint', () => {
  const { items, adjustments } = buildBudgetFromClassified(entradas([['Controladora de Acesso', 1], ['Fechadura Magnética', 2]]), categories);
  assert.equal(qtd(items, 'Endpoint ONE 4 Portas'), undefined);
  assert.deepEqual(adjustments, []);
});

test('antena veicular na ONE fica na rede como o facial: não consome Wiegand nem pede Endpoint', () => {
  const { items, adjustments } = buildBudgetFromClassified(entradas([['Central ONE (Córtex)', 1], ['Antena UHF Veicular', 4]]), categories);
  assert.equal(qtd(items, 'Endpoint ONE 4 Portas'), undefined);
  assert.deepEqual(adjustments, []);
});
