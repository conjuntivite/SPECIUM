const test = require('node:test');
const assert = require('node:assert/strict');

const { parseClassificationResponse, stripSectionNoise } = require('../lib/quoteAudit');

const VALID_CATEGORIES = ['NVR 32 Canais', 'Mikrotik', 'Switch Híbrido PoE'];

test('parseClassificationResponse: extrai o array JSON e mantém categorias válidas', () => {
  const content = '```json\n[{"code":"009620","name":"GRAVADOR DIGITAL DE VIDEO 32 CANAIS 3032 NVD","quantity":1,"category":"NVR 32 Canais"}]\n```';
  const result = parseClassificationResponse(content, VALID_CATEGORIES);
  assert.deepEqual(result, [{ code: '009620', name: 'GRAVADOR DIGITAL DE VIDEO 32 CANAIS 3032 NVD', quantity: 1, category: 'NVR 32 Canais' }]);
});

test('parseClassificationResponse: categoria alucinada (fora do catálogo) vira null em vez de quebrar o motor', () => {
  const content = '[{"code":"001","name":"ITEM QUALQUER","quantity":2,"category":"Categoria Que Não Existe"}]';
  const result = parseClassificationResponse(content, VALID_CATEGORIES);
  assert.equal(result[0].category, null);
  assert.equal(result[0].quantity, 2);
});

test('parseClassificationResponse: quantidade ausente/inválida vira 1, item sem nome é descartado', () => {
  const content = '[{"code":"002","name":"SEM QUANTIDADE","category":null},{"code":"003","name":"","quantity":5,"category":null}]';
  const result = parseClassificationResponse(content, VALID_CATEGORIES);
  assert.equal(result.length, 1);
  assert.equal(result[0].quantity, 1);
});

test('parseClassificationResponse: sem nenhum array JSON reconhecível lança erro claro', () => {
  assert.throws(() => parseClassificationResponse('desculpe, não consigo ajudar com isso', VALID_CATEGORIES), /JSON/);
});

test('stripSectionNoise: remove cabeçalho de seção e linha de total, mantém as linhas de item', () => {
  const text = [
    'Código Qtdade Unitário Total\tProdutos Observações',
    'ALARME',
    '008019 2\tQUADRO COMNADO METAL 60X60X20 R$ 0,00 R$ 0,00',
    'Total de ALARME: R$ 1.948,55',
    'CFTV',
    '009620 1\tGRAVADOR DIGITAL DE VIDEO 32 CANAIS 3032 NVD R$ 0,00 R$ 0,00',
    'Total de CFTV: R$ 9.253,00',
  ].join('\n');
  const result = stripSectionNoise(text);
  assert.ok(!/^ALARME$/m.test(result));
  assert.ok(!/^CFTV$/m.test(result));
  assert.ok(!/Total de/.test(result));
  assert.ok(result.includes('QUADRO COMNADO METAL 60X60X20'));
  assert.ok(result.includes('GRAVADOR DIGITAL DE VIDEO 32 CANAIS 3032 NVD'));
});

test('relevantKnowledge: item ONE/SIAM traz a ficha técnica, item de outra marca não traz nada', () => {
  const { relevantKnowledge } = require('../lib/equipmentKnowledge');
  const ag = relevantKnowledge([{ name: 'CORTEX AG PORTARIA AUTOGERENCIADA' }]);
  assert.match(ag, /30 endpoints/);
  assert.doesNotMatch(ag, /Córtex V6/);
  assert.match(relevantKnowledge([{ name: 'CONTROLADORA RAS 1P4L' }]), /7\.000 usuários/);
  assert.equal(relevantKnowledge([{ name: 'CAMERA BULLET 2MP INTELBRAS' }, { name: 'FECHADURA ELETROIMA 300KG' }]), '');
});

test('relevantKnowledge: item ONE traz também as regras de instalação e o escopo de portaria remota', () => {
  const { relevantKnowledge } = require('../lib/equipmentKnowledge');
  const k = relevantKnowledge([{ name: 'ENDPOINT 4 PORTAS ONE' }]);
  assert.match(k, /no máximo 30 m/);
  assert.match(k, /30 Mbps/);
  assert.match(k, /locado\/comodato/);
});

test('relevantKnowledge: nomes reais dos orçamentos ONE/SIAM (com erro de digitação) acionam a ficha certa, sem falso positivo', () => {
  const { relevantKnowledge } = require('../lib/equipmentKnowledge');
  const k = (name) => relevantKnowledge([{ name }]);
  assert.match(k('RECPETORA FULL ONE'), /Receptor 433/);
  assert.match(k('RECEPTORA FULL ONE'), /Receptor 433/);
  assert.match(k('PLACA MONITORAMENTO FALTA ENERGIA'), /Sensor de Falha de Energia/);
  assert.match(k('LEITORA WIEGAND-34 RFID 125KHZ . SENHA KR003 SIAM INVIOLAVEL'), /KR00x/);
  assert.match(k('INTERFACE SENSOR DE TENSAO 110/220V SIAM'), /IMU Tensão/);
  assert.match(k('CONTROLADOR ENDPOINT ONEPORTARIA'), /Todo endpoint precisa de fonte/);
  assert.equal(k('RADIO FULL DXNET CONTACT ID'), '');
  assert.equal(k('CATRACA DSK3G411LX / PG COMBO'), '');
});

test('candidateModels: aceita lista separada por vírgula, mantém a ordem e põe os gratuitos depois', () => {
  const { candidateModels } = require('../lib/openrouter');
  const list = candidateModels('a/um, b/dois');
  assert.deepEqual(list.slice(0, 2), ['a/um', 'b/dois']);
  assert.ok(list.length > 2 && list.slice(2).every((m) => m.endsWith(':free')));
  assert.equal(candidateModels('a/um').filter((m) => m === 'a/um').length, 1);
  assert.ok(candidateModels('').every((m) => m.endsWith(':free')));
});
