// Catálogo ONE (data/catalog-snapshot.json): a contagem de endpoints sai do motor de recursos, não do
// LLM. Cenário do diagrama de ligações: 4 portas + 2 portões = 6 relés, 6 sensores; antena veicular e facial ficam na rede (sem Wiegand).
const test = require('node:test');
const assert = require('node:assert/strict');
const snapshot = require('../data/catalog-snapshot.json');
const { computeCategoryMissingEssentials } = require('../lib/recipeEngine');
const { layoutAndLinkItems } = require('../lib/budgetLinks');

const CENARIO = [
  ['Central ONE (Córtex)', 1], ['Switch Giga 8 Portas', 1], ['Fonte 12V', 20], ['Fechadura Magnética', 4],
  ['Solenoide de Backup', 2], ['Automação de Portão', 2], ['Sensor Magnético', 6], ['Antena UHF Veicular', 4], ['Terminal Facial', 4],
];
const faltas = (endpoints) => computeCategoryMissingEssentials(
  [...CENARIO, ['Endpoint ONE 4 Portas', endpoints]].map(([title, quantity]) => ({ title, quantity })),
  snapshot.categories, snapshot.resources,
).missing.map((m) => m.label);
const temFalta = (labels, texto) => labels.some((l) => l.includes(texto));

test('2 Endpoint 4 Portas cobrem 6 relés e 6 sensores', () => {
  const labels = faltas(2);
  for (const r of ['Relé de comando no Endpoint ONE', 'Entrada de sensor']) assert.equal(temFalta(labels, r), false, r);
  assert.equal(temFalta(faltas(0), 'Wiegand'), false, 'antena veicular não pede Wiegand');
});

test('1 Endpoint 4 Portas não cobre: faltam relé e entrada de sensor (facial e solenoide não entram na conta)', () => {
  const labels = faltas(1);
  assert.equal(temFalta(labels, 'Relé de comando no Endpoint ONE'), true);
  assert.equal(temFalta(labels, 'Entrada de sensor (contato seco) no Endpoint ONE'), true);
});

test('fechadura não é exclusiva da ONE: com controladora de outro fabricante o relé do Endpoint vira só alternativa', () => {
  const r = computeCategoryMissingEssentials(
    [['Controladora de Acesso', 1], ['Fechadura Magnética', 2], ['Fonte 12V', 3]].map(([title, quantity]) => ({ title, quantity })),
    snapshot.categories, snapshot.resources,
  );
  const rele = r.requirements_by_category['Fechadura Magnética'].filter((x) => x.label.startsWith('Relé'));
  assert.ok(rele.some((x) => x.satisfied_by === 'Controladora de Acesso'));
  assert.ok(!rele.some((x) => x.severity === 'critical'));
});

test('no canvas, fechadura, portão e sensor ligam no Endpoint; facial e antena veicular só na central', () => {
  const items = [...CENARIO, ['Endpoint ONE 4 Portas', 2]].map(([title, quantity], i) => ({ id: i + 1, title, quantity }));
  const nome = (id) => items.find((i) => `item-${i.id}` === id).title;
  const arestas = layoutAndLinkItems(items, snapshot.categories).connections.map((c) => `${nome(c.source)} -> ${nome(c.target)}`);
  for (const de of ['Fechadura Magnética', 'Automação de Portão', 'Sensor Magnético']) assert.ok(arestas.includes(`${de} -> Endpoint ONE 4 Portas`), de);
  assert.ok(arestas.includes('Terminal Facial -> Central ONE (Córtex)'));
  assert.ok(arestas.includes('Antena UHF Veicular -> Central ONE (Córtex)'));
  for (const de of ['Terminal Facial', 'Antena UHF Veicular']) assert.ok(!arestas.includes(`${de} -> Endpoint ONE 4 Portas`), de);
  assert.ok(!arestas.includes('Solenoide de Backup -> Endpoint ONE 4 Portas'));
});
