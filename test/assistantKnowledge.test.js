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
