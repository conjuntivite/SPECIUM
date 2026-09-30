const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSnapshot, planImport } = require('../lib/catalogSync');

const cat = (value, extra = {}) => ({ id: 'x' + value, group: 'G', value, label: value, capacity: null, icon: '', provides: [], requirements: [], canBeContainer: false, coverage: null, ...extra });
const prod = (category, brand, model) => ({ id: 'p' + model, category, brand, model });
const current = () => ({
  groups: [{ id: '1', name: 'G' }],
  resources: [{ id: 'r1', key: 'alarm.zone', label: 'Zona' }],
  categories: [cat('Rack'), cat('Nobreak')],
  products: [prod('Rack', 'Intelbras', 'RACK 8U')],
  aiInstructions: { classification: 'instrução A', audit: null },
});

test('buildSnapshot: sem ids, ordenado, determinístico (o diff no Git só mostra mudança real)', () => {
  const data = { ...current(), categories: [cat('Zeta'), cat('Alfa')], products: [prod('Rack', 'B', 'ZZ 2'), prod('Rack', 'A', 'AA 1')] };
  const snap = buildSnapshot(data);
  assert.deepEqual(snap.categories.map((c) => c.value), ['Alfa', 'Zeta']);
  assert.deepEqual(snap.products.map((p) => p.model), ['AA 1', 'ZZ 2']);
  assert.ok(snap.categories.every((c) => !('id' in c)) && snap.products.every((p) => !('id' in p)));
  assert.deepEqual(buildSnapshot(data), snap);
  assert.deepEqual(snap.aiInstructions, { classification: 'instrução A', audit: null });
});

test('planImport: banco já igual ao snapshot = nada a fazer', () => {
  const snap = buildSnapshot(current());
  const plan = planImport(snap, current());
  assert.equal(plan.total, 0);
});

test('planImport: cria o que falta e atualiza o que mudou, sem apagar nada', () => {
  const snap = buildSnapshot({
    ...current(),
    groups: [{ name: 'G' }, { name: 'Novo Grupo' }],
    resources: [{ key: 'alarm.zone', label: 'Zona de alarme' }, { key: 'x.novo', label: 'Novo' }],
    categories: [cat('Rack', { icon: 'server' }), cat('Nobreak'), cat('Transmissor Universal')],
    products: [prod('Rack', 'Intelbras', 'RACK 8U'), prod('Nobreak', 'Hikvision', 'RACK 8U NOVO')],
  });
  // banco tem um extra que o snapshot não conhece: não pode ser apagado
  const db = current();
  db.categories.push(cat('Extra Só No Banco'));
  const plan = planImport(snap, db);
  assert.deepEqual(plan.groups.create, ['Novo Grupo']);
  assert.deepEqual(plan.resources.create.map((r) => r.key), ['x.novo']);
  assert.deepEqual(plan.resources.update.map((r) => r.key), ['alarm.zone']);
  assert.deepEqual(plan.categories.create.map((c) => c.value), ['Transmissor Universal']);
  assert.deepEqual(plan.categories.update.map((c) => c.value), ['Rack']);
  assert.deepEqual(plan.products.create.map((p) => p.model), ['RACK 8U NOVO']);
  assert.equal(plan.products.update.length, 0);
  assert.equal(plan.extrasInDb, 1, 'itens só do banco são apenas contados, nunca removidos');
  assert.equal(plan.categories.update[0].id, 'xRack', 'o plano carrega o id do documento a atualizar');
});

test('planImport: produto é identificado pelo modelo; mudou categoria/marca = atualiza', () => {
  const snap = buildSnapshot({ ...current(), products: [prod('Nobreak', 'Nova Marca', 'rack 8u')] });
  const plan = planImport(snap, current());
  assert.equal(plan.products.create.length, 0);
  assert.deepEqual(plan.products.update.map((p) => [p.model, p.category, p.brand]), [['rack 8u', 'Nobreak', 'Nova Marca']]);
});

test('planImport: instruções da IA só entram com opt-in explícito', () => {
  const snap = buildSnapshot({ ...current(), aiInstructions: { classification: 'instrução B', audit: null } });
  assert.equal(planImport(snap, current()).aiInstructions, false);
  assert.equal(planImport(snap, current(), { withInstructions: true }).aiInstructions, true);
  const igual = buildSnapshot(current());
  assert.equal(planImport(igual, current(), { withInstructions: true }).aiInstructions, false);
});

test('ordem das chaves dentro de requisitos não conta como mudança (o banco reordena ao gravar)', () => {
  const req = (a, b) => ({ id: 'x', label: 'X', ...(a ? { critical: false, type: 'presence' } : { type: 'presence', critical: false }), candidates: ['Rack'], ...(b ? {} : {}) });
  const noBanco = { ...current(), categories: [cat('Rack', { requirements: [req(true)] })] };
  const noArquivo = buildSnapshot({ ...current(), categories: [cat('Rack', { requirements: [req(false)] })] });
  assert.equal(planImport(noArquivo, noBanco).categories.update.length, 0);
  // e o snapshot exportado é o mesmo, seja qual for a ordem em que o banco devolveu as chaves
  assert.deepEqual(buildSnapshot(noBanco).categories, noArquivo.categories);
  assert.equal(JSON.stringify(buildSnapshot(noBanco)), JSON.stringify(noArquivo));
});

test('mudança real em requisito continua sendo detectada', () => {
  const base = { ...current(), categories: [cat('Rack', { requirements: [{ id: 'a', critical: false, candidates: ['Rack'] }] })] };
  const snap = buildSnapshot({ ...current(), categories: [cat('Rack', { requirements: [{ id: 'a', critical: true, candidates: ['Rack'] }] })] });
  assert.equal(planImport(snap, base).categories.update.length, 1);
});
