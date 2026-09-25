// Orçamento vindo do Assistente já nasce com as ligações pertinentes e os cards em fileiras, pra
// linha não cruzar a grade toda. Regras por nome de categoria do catálogo (o título do item genérico
// é a própria categoria) — não é o motor de recursos, é só o desenho típico de uma instalação.

// Fileiras de cima pra baixo: periféricos -> controladoras/fontes -> switch/gravador/servidor -> o resto.
const TIERS = [
  /^(Botoeira|Terminal Facial|Leitor|Fechadura|Sensor|Câmera)/,
  /^(Controladora|Fonte)/,
  /^(Switch|NVR|DVR|Servidor)/,
];

// [origem, destinos em ordem de preferência]: usa o primeiro padrão que tiver algum card no orçamento.
const LINKS = [
  [/^(Botoeira|Terminal Facial|Leitor|Fechadura|Sensor Magnético|Fonte)/, [/^Controladora/]],
  [/^(Controladora|Servidor|NVR|DVR)/, [/^Switch/]],
  [/^Câmera/, [/^Switch PoE/, /^NVR PoE/, /^Switch/]],
  [/^Switch/, [/^(Mikrotik|Roteador)/]],
];

const COLUMN_STEP = 300;
const ROW_STEP = 200;
const ORIGIN = 60;

const tierOf = (title) => {
  const i = TIERS.findIndex((re) => re.test(title));
  return i === -1 ? TIERS.length : i;
};

// Origem e destino em lados opostos, na direção em que o destino está (handles do FlowNode).
function sidesBetween(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? ['right', 'left'] : ['left', 'right'];
  return dy > 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

// items: [{ id, title }] já criados. Devolve as posições (chave `item-<id>`) e as ligações no
// formato que o canvas grava (mesmo id de uma ligação manual, então dá pra apagar com Delete).
function layoutAndLinkItems(items) {
  const filled = new Map();
  const positions = {};
  for (const item of items) {
    const tier = tierOf(item.title);
    const col = filled.get(tier) || 0;
    filled.set(tier, col + 1);
    positions[`item-${item.id}`] = { x: ORIGIN + col * COLUMN_STEP, y: ORIGIN + tier * ROW_STEP };
  }

  const connections = [];
  const usedPerRule = new Map();
  for (const item of items) {
    const rule = LINKS.find(([source]) => source.test(item.title));
    if (!rule) continue;
    const targets = rule[1].map((re) => items.filter((it) => re.test(it.title))).find((list) => list.length);
    if (!targets) continue;
    // Vários cards da mesma origem se repartem entre os destinos (1ª botoeira -> 1ª controladora, 2ª -> 2ª...).
    const key = rule[0].source + item.title;
    const nth = usedPerRule.get(key) || 0;
    usedPerRule.set(key, nth + 1);
    const target = targets[nth % targets.length];
    const source = `item-${item.id}`;
    const destination = `item-${target.id}`;
    const [sourceHandle, targetHandle] = sidesBetween(positions[source], positions[destination]);
    connections.push({ id: `manual-${source}(${sourceHandle})->${destination}(${targetHandle})`, source, target: destination, sourceHandle, targetHandle });
  }
  return { positions, connections };
}

module.exports = { layoutAndLinkItems };
