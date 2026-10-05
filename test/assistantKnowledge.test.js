const test = require('node:test');
const assert = require('node:assert/strict');

// A IA é simulada: o teste só olha o prompt de sistema que o assistente montou.
const openrouter = require('../lib/openrouter');
let lastSystemPrompt = '';
openrouter.callOpenRouter = async ({ messages }) => {
  lastSystemPrompt = messages[0].content;
  return { content: 'ok', model: 'fake' };
};

const { EQUIPMENT_KNOWLEDGE, buildAssistantSystemPrompt, askEquipmentAssistant } = require('../lib/equipmentKnowledge');

const intelbras = EQUIPMENT_KNOWLEDGE.filter((k) => k.brand === 'intelbras');
const hikvision = EQUIPMENT_KNOWLEDGE.filter((k) => k.brand === 'hikvision');
const has = (prompt, ficha) => prompt.includes(ficha.text);
const user = (content) => [{ role: 'user', content }];

test('fichas de outros fabricantes estão marcadas por marca; ONE/SIAM ficam sempre ligadas', () => {
  assert.ok(intelbras.length >= 15 && hikvision.length >= 8);
  const core = EQUIPMENT_KNOWLEDGE.filter((k) => !k.brand);
  assert.ok(core.length > 0 && core.every((k) => /ONE|SIAM/.test(k.text)));
  const prompt = buildAssistantSystemPrompt([]);
  assert.ok(core.every((k) => has(prompt, k)), 'todas as fichas ONE/SIAM entram');
  assert.ok([...intelbras, ...hikvision].every((k) => !has(prompt, k)), 'nenhuma ficha de outra marca sem citação');
});

test('citar o modelo puxa só a ficha daquele modelo', () => {
  const prompt = buildAssistantSystemPrompt(user('Preciso de uma central AMT 4010 com 40 zonas'));
  const amt = intelbras.find((k) => /AMT 4010/.test(k.text));
  assert.ok(has(prompt, amt));
  assert.equal(intelbras.filter((k) => has(prompt, k)).length, 1, 'só a da AMT 4010');
  assert.ok(hikvision.every((k) => !has(prompt, k)));
});

test('citar a marca puxa todas as fichas daquela marca (e só dela)', () => {
  const prompt = buildAssistantSystemPrompt(user('Quais câmeras da Hikvision servem para 8 canais?'));
  assert.ok(hikvision.every((k) => has(prompt, k)));
  assert.ok(intelbras.every((k) => !has(prompt, k)));
});

test('a marca citada em qualquer mensagem da conversa vale (histórico incluso)', () => {
  const history = [
    { role: 'user', content: 'Vou usar equipamentos Intelbras' },
    { role: 'assistant', content: 'Certo.' },
    { role: 'user', content: 'e o que mais precisa?' },
  ];
  const prompt = buildAssistantSystemPrompt(history);
  assert.ok(intelbras.every((k) => has(prompt, k)));
});

test('askEquipmentAssistant monta o prompt a partir do histórico enviado', async () => {
  await askEquipmentAssistant(user('Como ligo o Endpoint ONE?'));
  const semMarca = lastSystemPrompt.length;
  await askEquipmentAssistant(user('Como ligo a fechadura FE 21150 no Endpoint ONE?'));
  assert.ok(lastSystemPrompt.length > semMarca);
  assert.ok(lastSystemPrompt.includes(intelbras.find((k) => /FE 21150/.test(k.text)).text));
});

// Caso real (out/2026): admin pediu na tela de configurações "me chame de OSCAR LIMA" e o chat ignorava,
// porque só a classificação/auditoria do PDF liam aquela tela.
test('instrução do administrador para o assistente entra no prompt (e vazia não entra)', async () => {
  await askEquipmentAssistant(user('oi'), 'Chame o usuário sempre de OSCAR LIMA.');
  assert.ok(lastSystemPrompt.includes('Chame o usuário sempre de OSCAR LIMA.'));
  assert.ok(lastSystemPrompt.indexOf('OSCAR LIMA') > lastSystemPrompt.indexOf('Fórmulas de dimensionamento'), 'vem depois das fichas');
  await askEquipmentAssistant(user('oi'), '');
  assert.ok(!lastSystemPrompt.includes('Instruções do administrador'));
});

// Caso real (produção, out/2026): o assistente afirmou que a AMT 2018 E SMART não recebe evento de
// câmera pela rede e pôs sensor extra no orçamento — o guia oficial de integração diz o contrário.
test('falar de central AMT 1000/2018 ou de linha virtual/AcuSense puxa a ficha de integração alarme × câmera com IA', () => {
  const integracao = intelbras.find((k) => /AMT 1000 SMART e AMT 2018 E SMART/.test(k.text));
  assert.ok(integracao, 'existe ficha da integração alarme × CFTV com IA');
  assert.match(integracao.text, /linha virtual/i);
  assert.match(integracao.text, /6\.0\.0/);
  for (const pergunta of [
    'a câmera manda pela rede o cruzamento de linha pra AMT 2018 E SMART disparar?',
    'tenho uma AMT1000 smart, dá pra integrar câmera?',
    '3 câmeras AcuSense para fazer cruzamento de linha disparando a central',
  ]) {
    assert.ok(has(buildAssistantSystemPrompt(user(pergunta)), integracao), pergunta);
  }
});

// Revisão contra os datasheets atuais (out/2026): a linha SMART (AMT 2018 E SMART, AMT 1000 SMART)
// tem receptor sem fio na placa e usa XG 2G/3G/4G — as fichas antigas mandavam usar XAR 4000 e
// XE/XG/XEG 4000 (que só servem na AMT 4010).
const ficha = (re) => intelbras.find((k) => re.test(k.text));
test('fichas das centrais Intelbras batem com os datasheets atuais', () => {
  const amt2018 = ficha(/^Intelbras AMT 2018/);
  assert.match(amt2018.text, /E SMART[^.]*receptor sem fio integrado/i);
  assert.match(amt2018.text, /XG 2G, XG 3G ou XG 4G/);
  const amt1000 = ficha(/^Intelbras AMT 1000 SMART/);
  assert.ok(amt1000, 'existe ficha da AMT 1000 SMART');
  assert.match(amt1000.text, /12 zonas com fio/);
  assert.ok(has(buildAssistantSystemPrompt(user('central AMT 1000 smart')), amt1000));
  assert.match(ficha(/^Intelbras módulos de comunicação/).text, /só (servem|funcionam) na AMT 4010/i);
  assert.match(ficha(/^Intelbras XAR 4000/).text, /NÃO é obrigatório na AMT 2018 E SMART nem na AMT 1000 SMART/);
  assert.match(ficha(/^Intelbras Sistema 8000/).text, /XAG 8000/);
});
