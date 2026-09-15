// Pré-build de provides[]/requirements[] — motor de recursos/capacidade (ver
// "arquitetura_motor_regras_capacidade_comprador_inviolavel.txt", enviado pelo usuário, e a seção
// correspondente no SPEC.md). Único motor de sugestões do sistema — o antigo motor de dependencies[]
// foi removido (ver SPEC.md/histórico de commits); toda categoria-âncora usa requirements[]/provides[].
//
// Diferença deliberada em relação ao motor antigo: switch Fast (10/100) NÃO entra como candidato da
// conectividade de rede da câmera IP (resource `network.gigabit_port`) — só switches Giga fornecem
// esse recurso. O motor antigo tratava "qualquer switch" como alternativa mútua da câmera IP, o que é
// tecnicamente impreciso (o próprio motivo da migração, ver SPEC.md). Switch PoE Fast continua
// fornecendo `power.poe_port` (alimenta PoE mesmo sem ser gigabit).

const FINISHING_KIT = ['Canaleta', 'Cano Corrugado', 'Caixa de Passagem', 'Cotovelo', 'Abraçadeira', 'Eletroduto', 'Adaptador'];
const SWITCH_POE_FAST_ALL = ['Switch PoE Fast 4 Portas', 'Switch PoE Fast 8 Portas', 'Switch PoE Fast 16 Portas', 'Switch PoE Fast 24 Portas'];
const SWITCH_POE_GIGA_ALL = ['Switch PoE Giga 4 Portas', 'Switch PoE Giga 8 Portas', 'Switch PoE Giga 16 Portas', 'Switch PoE Giga 24 Portas'];
const SWITCH_GIGA_ALL = ['Switch Giga 4 Portas', 'Switch Giga 8 Portas', 'Switch Giga 16 Portas', 'Switch Giga 24 Portas'];
const SWITCH_FAST_ALL = ['Switch Fast 4 Portas', 'Switch Fast 8 Portas', 'Switch Fast 16 Portas', 'Switch Fast 24 Portas'];
const NVR_ALL = ['NVR 4 Canais', 'NVR 8 Canais', 'NVR 16 Canais', 'NVR 24 Canais', 'NVR 32 Canais', 'NVR 48 Canais', 'NVR 64 Canais'];
const DVR_ALL = ['DVR 4 Canais', 'DVR 8 Canais', 'DVR 16 Canais', 'DVR 24 Canais', 'DVR 32 Canais', 'DVR 48 Canais', 'DVR 64 Canais'];

function numberFrom(label, unitWord) {
  const match = label.match(new RegExp(`(\\d+)\\s*${unitWord}`, 'i'));
  return match ? Number(match[1]) : 0;
}

function presence(id, label, candidates, critical) {
  return { id, label, type: 'presence', candidates, critical };
}

function finishingKitRequirements() {
  return FINISHING_KIT.map((label) => presence(`kit:${label}`, label, [label], false));
}

const SWITCH_REQUIREMENTS = [
  presence('cabo', 'Cabo de Rede CAT6', ['Cabo de Rede CAT6'], false),
  presence('rack', 'Rack', ['Rack'], false),
];

const DVR_REQUIREMENTS_BASE = [
  presence('hd', 'HD Interno (armazenamento)', ['HD Interno (armazenamento)'], true),
  presence('camera', 'Câmeras analógicas compatíveis', ['Câmera Analógica'], false),
  presence('fonte', 'Fonte 12V', ['Fonte 12V'], false),
  presence('cabo', 'Cabo Coaxial CFTV', ['Cabo Coaxial CFTV'], false),
  presence('nobreak', 'Nobreak', ['Nobreak'], false),
];

const NVR_REQUIREMENTS_BASE = [
  presence('hd', 'HD Interno (armazenamento)', ['HD Interno (armazenamento)'], true),
  presence('camera', 'Câmeras IP compatíveis', ['Câmera IP', 'Câmera IP PoE'], false),
  presence('fonte', 'Fonte 12V', ['Fonte 12V'], false),
  presence('cabo', 'Cabo de Rede CAT6', ['Cabo de Rede CAT6'], false),
  presence('nobreak', 'Nobreak', ['Nobreak'], false),
];

const CATEGORY_RESOURCE_SEED = {};

// Nem todo switch tem uma porta física rotulada "uplink", mas qualquer porta comum pode virar uplink
// (conexão com outro switch/roteador/NVR) — então 1 das portas informadas no rótulo (ex.: "8 Portas")
// não fica disponível pras câmeras. Vale pra todos os switches Giga/PoE Giga/PoE Fast; Switch Fast
// comum já não provê recurso nenhum (não muda).
function usablePorts(totalPorts) {
  return Math.max(0, totalPorts - 1);
}

for (const label of SWITCH_GIGA_ALL) {
  const ports = usablePorts(numberFrom(label, 'Portas'));
  CATEGORY_RESOURCE_SEED[label] = { provides: [{ resource: 'network.gigabit_port', amount: ports }], requirements: SWITCH_REQUIREMENTS };
}
for (const label of SWITCH_POE_GIGA_ALL) {
  const ports = usablePorts(numberFrom(label, 'Portas'));
  CATEGORY_RESOURCE_SEED[label] = {
    provides: [{ resource: 'network.gigabit_port', amount: ports }, { resource: 'power.poe_port', amount: ports }],
    requirements: SWITCH_REQUIREMENTS,
  };
}
for (const label of SWITCH_POE_FAST_ALL) {
  const ports = usablePorts(numberFrom(label, 'Portas'));
  CATEGORY_RESOURCE_SEED[label] = { provides: [{ resource: 'power.poe_port', amount: ports }], requirements: SWITCH_REQUIREMENTS };
}
for (const label of SWITCH_FAST_ALL) {
  CATEGORY_RESOURCE_SEED[label] = { provides: [], requirements: SWITCH_REQUIREMENTS };
}
for (const label of NVR_ALL) {
  const channels = numberFrom(label, 'Canais');
  CATEGORY_RESOURCE_SEED[label] = { provides: [{ resource: 'recording.ip_channel', amount: channels }], requirements: NVR_REQUIREMENTS_BASE };
}
for (const label of DVR_ALL) {
  const channels = numberFrom(label, 'Canais');
  CATEGORY_RESOURCE_SEED[label] = { provides: [{ resource: 'recording.analog_channel', amount: channels }], requirements: DVR_REQUIREMENTS_BASE };
}

CATEGORY_RESOURCE_SEED['Câmera IP'] = {
  provides: [],
  requirements: [
    { id: 'network', label: 'Conectividade Gigabit', type: 'capacity', resource: 'network.gigabit_port', unitsPerItem: 1, critical: true },
    presence('power', 'Fonte 12V', ['Fonte 12V'], true),
    { id: 'recording', label: 'Gravação (NVR)', type: 'capacity', resource: 'recording.ip_channel', unitsPerItem: 1, critical: true },
    presence('caixa', 'Caixa Steck', ['Caixa Steck'], false),
    ...finishingKitRequirements(),
  ],
};

CATEGORY_RESOURCE_SEED['Câmera IP PoE'] = {
  provides: [],
  requirements: [
    { id: 'network', label: 'Conectividade Gigabit', type: 'capacity', resource: 'network.gigabit_port', unitsPerItem: 1, critical: true },
    {
      id: 'power', label: 'Alimentação', type: 'anyOf', critical: true,
      options: [
        { type: 'capacity', resource: 'power.poe_port', unitsPerItem: 1 },
        { type: 'presence', candidates: ['Fonte 12V'] },
      ],
    },
    { id: 'recording', label: 'Gravação (NVR)', type: 'capacity', resource: 'recording.ip_channel', unitsPerItem: 1, critical: true },
    presence('caixa', 'Caixa Steck', ['Caixa Steck'], false),
    ...finishingKitRequirements(),
  ],
};

CATEGORY_RESOURCE_SEED['Câmera Analógica'] = {
  provides: [],
  requirements: [
    { id: 'recording', label: 'Gravação (DVR)', type: 'capacity', resource: 'recording.analog_channel', unitsPerItem: 1, critical: true },
    presence('baluns', 'Baluns', ['Baluns'], false),
    presence('cabo', 'Cabo Coaxial CFTV', ['Cabo Coaxial CFTV'], false),
    presence('conector', 'Conector BNC/P4', ['Conector BNC/P4'], false),
    presence('fonte', 'Fonte 12V', ['Fonte 12V'], false),
    presence('caixa', 'Caixa Steck', ['Caixa Steck'], false),
    ...finishingKitRequirements(),
  ],
};

// AcuSense é só uma camada de IA sobre a mesma câmera — mesma necessidade elétrica/rede/gravação da
// variante equivalente sem AcuSense, então reaproveita o requirements dela em vez de duplicar.
CATEGORY_RESOURCE_SEED['Câmera AcuSense Analógica'] = { provides: [], requirements: CATEGORY_RESOURCE_SEED['Câmera Analógica'].requirements };
// Value real desta variante é "Câmera AcuSense IP" — o "(sem PoE)" só existe no rótulo exibido
// (ver web/src/data/catalog.json), igual à câmera IP normal (value "Câmera IP", label com "(sem PoE)").
CATEGORY_RESOURCE_SEED['Câmera AcuSense IP'] = { provides: [], requirements: CATEGORY_RESOURCE_SEED['Câmera IP'].requirements };
CATEGORY_RESOURCE_SEED['Câmera AcuSense IP PoE'] = { provides: [], requirements: CATEGORY_RESOURCE_SEED['Câmera IP PoE'].requirements };

// Categorias simples com uma lista curta de acessórios recomendados (nenhum crítico) — mesmo padrão
// do FINISHING_KIT acima, só que cada uma com sua própria lista em vez do kit de acabamento padrão.
CATEGORY_RESOURCE_SEED['Terminal Facial'] = {
  provides: [],
  requirements: ['Fonte 12V', 'Fechadura Elétrica', 'Cabo de Rede CAT6', 'Nobreak'].map((label) => presence(`kit:${label}`, label, [label], false)),
};
CATEGORY_RESOURCE_SEED['Vídeo Porteiro'] = {
  provides: [],
  requirements: ['Fonte 12V', 'Cabo de Rede CAT6', 'Fechadura Elétrica', 'Caixa Steck'].map((label) => presence(`kit:${label}`, label, [label], false)),
};
CATEGORY_RESOURCE_SEED['Mikrotik'] = {
  provides: [],
  requirements: ['Fonte 12V', 'Cabo de Rede CAT6', 'Rack'].map((label) => presence(`kit:${label}`, label, [label], false)),
};
CATEGORY_RESOURCE_SEED['Roteador Wi-Fi'] = {
  provides: [],
  requirements: ['Cabo de Rede CAT6', 'Nobreak'].map((label) => presence(`kit:${label}`, label, [label], false)),
};

module.exports = { CATEGORY_RESOURCE_SEED };
