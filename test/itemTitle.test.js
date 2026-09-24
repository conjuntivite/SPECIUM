const test = require('node:test');
const assert = require('node:assert/strict');

// Nome exibido no card do orçamento — ESM do front (web/src/lib/itemTitle.js), import dinâmico.
const load = () => import('../web/src/lib/itemTitle.js');
const categories = ['Câmera IP', 'Câmera IP DOMME', 'NVR PoE 8 Canais', 'Rack'];

test('item com produto escolhido mostra só marca + modelo, sem a categoria na frente', async () => {
  const { displayTitle } = await load();
  assert.equal(displayTitle('NVR PoE 8 Canais HIKVISION DS-7608NI', categories), 'HIKVISION DS-7608NI');
});

test('categoria mais longa ganha: "Câmera IP DOMME" não é cortada como "Câmera IP"', async () => {
  const { displayTitle } = await load();
  assert.equal(displayTitle('Câmera IP DOMME HIKVISION DS-2DE5425IW-AE', categories), 'HIKVISION DS-2DE5425IW-AE');
});

test('item sem produto (título = só a categoria) continua mostrando a categoria', async () => {
  const { displayTitle } = await load();
  assert.equal(displayTitle('Rack', categories), 'Rack');
});

test('título que não começa com categoria conhecida fica como está', async () => {
  const { displayTitle } = await load();
  assert.equal(displayTitle('Suporte de parede', categories), 'Suporte de parede');
});
