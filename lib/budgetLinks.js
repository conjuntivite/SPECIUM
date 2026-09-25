// Orçamento vindo do Assistente já nasce com as ligações e os cards em fileiras. As ligações NÃO são
// regra fixa: saem do mesmo motor de recursos das sugestões (lib/recipeEngine.js) — o que cada
// categoria `provides` e o que ela `requirements` (presença de outra categoria, capacidade de um
// recurso, ou alternativas). Mudou o catálogo (aba Categorias), mudam as ligações.
//
// Sentido: a linha sai de quem PRECISA e chega em quem FORNECE (câmera -> switch, controladora ->
// fonte). Quem precisa fica numa fileira acima de quem fornece.

const COLUMN_STEP = 300;
const ROW_STEP = 200;
const ORIGIN = 60;
const MAX_ROW = 5; // teto pra dependência circular não empurrar card pra longe

// Origem e destino em lados opostos (handles do FlowNode). Fileiras diferentes: sempre vertical
// (por baixo de quem precisa, por cima de quem fornece), mesmo com a coluna longe; mesma fileira:
// lateral.
function sidesBetween(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dy !== 0) return dy > 0 ? ['bottom', 'top'] : ['top', 'bottom'];
  return dx > 0 ? ['right', 'left'] : ['left', 'right'];
}

// Arestas requer -> fornece a partir de `requirements`/`provides` das categorias.
function collectEdges(items, categories) {
  const byValue = new Map(categories.map((c) => [c.value, c]));
  const known = items.filter((item) => byValue.has(item.title));

  // Oferta por recurso, consumida na ordem do orçamento: 5 câmeras gastam 5 das 7 portas do 1º
  // switch; a câmera seguinte que não couber vai pro 2º (mesma soma do buildSupplyLedger do motor).
  const suppliers = new Map();
  for (const item of known) {
    for (const p of byValue.get(item.title).provides || []) {
      const list = suppliers.get(p.resource) || [];
      list.push({ item, remaining: p.amount * item.quantity });
      suppliers.set(p.resource, list);
    }
  }

  const edges = new Map();
  const link = (from, to) => { if (from.id !== to.id) edges.set(`${from.id}>${to.id}`, { from, to }); };
  const used = new Map(); // (categoria, requisito) -> quantas vezes já foi atendido, pra repartir entre destinos

  function linkPresence(item, req, candidates) {
    const targets = known.filter((it) => it.id !== item.id && candidates.includes(it.title));
    if (!targets.length) return false;
    const key = `${item.title}|${req.id}|${candidates.join(',')}`;
    const nth = used.get(key) || 0;
    used.set(key, nth + 1);
    link(item, targets[nth % targets.length]);
    return true;
  }

  function linkCapacity(item, resource, unitsPerItem) {
    let need = unitsPerItem * item.quantity;
    let linked = false;
    for (const supplier of suppliers.get(resource) || []) {
      if (need <= 0) break;
      if (supplier.item.id === item.id || supplier.remaining <= 0) continue;
      const take = Math.min(supplier.remaining, need);
      supplier.remaining -= take;
      need -= take;
      link(item, supplier.item);
      linked = true;
    }
    return linked;
  }

  for (const item of known) {
    for (const req of byValue.get(item.title).requirements || []) {
      if (req.type === 'presence') linkPresence(item, req, req.candidates || []);
      else if (req.type === 'capacity') linkCapacity(item, req.resource, req.unitsPerItem || 1);
      else if (req.type === 'anyOf') {
        // Alternativas de presença que existem no orçamento entram todas (ex.: eletroímã E solenoide
        // são "Fechadura"); de capacidade, só a primeira que tiver fornecedor (PoE OU fonte, não os dois).
        const options = req.options || [];
        let any = false;
        for (const option of options.filter((o) => o.type === 'presence')) any = linkPresence(item, req, option.candidates || []) || any;
        if (!any) for (const option of options.filter((o) => o.type === 'capacity')) { if (linkCapacity(item, option.resource, option.unitsPerItem || 1)) break; }
      }
    }
  }
  return [...edges.values()];
}

// items: [{ id, title, quantity }]; categories: catálogo completo (value, provides, requirements).
// Devolve as posições (chave `item-<id>`) e as ligações no formato que o canvas grava (mesmo id de
// uma ligação manual, então dá pra apagar com Delete).
function layoutAndLinkItems(items, categories = []) {
  const edges = collectEdges(items, categories);

  // Fileira = profundidade na cadeia "precisa de": quem ninguém exige fica em cima (0); cada
  // fornecedor fica pelo menos uma fileira abaixo de quem o exige.
  const row = new Map(items.map((item) => [item.id, 0]));
  for (let pass = 0; pass < items.length; pass += 1) {
    let changed = false;
    for (const { from, to } of edges) {
      const wanted = Math.min(row.get(from.id) + 1, MAX_ROW);
      if (row.get(to.id) < wanted) { row.set(to.id, wanted); changed = true; }
    }
    if (!changed) break;
  }
  // Card sem nenhuma ligação (categoria fora do catálogo, ou nada a ligar) vai junto, na última fileira.
  const linkedIds = new Set(edges.flatMap(({ from, to }) => [from.id, to.id]));
  const lastLinkedRow = Math.max(-1, ...[...linkedIds].map((id) => row.get(id)));
  for (const item of items) if (!linkedIds.has(item.id) && lastLinkedRow >= 0) row.set(item.id, lastLinkedRow + 1);

  const filled = new Map();
  const positions = {};
  for (const item of items) {
    const r = row.get(item.id);
    const col = filled.get(r) || 0;
    filled.set(r, col + 1);
    positions[`item-${item.id}`] = { x: ORIGIN + col * COLUMN_STEP, y: ORIGIN + r * ROW_STEP };
  }

  const connections = edges.map(({ from, to }) => {
    const source = `item-${from.id}`;
    const target = `item-${to.id}`;
    const [sourceHandle, targetHandle] = sidesBetween(positions[source], positions[target]);
    return { id: `manual-${source}(${sourceHandle})->${target}(${targetHandle})`, source, target, sourceHandle, targetHandle };
  });
  return { positions, connections };
}

module.exports = { layoutAndLinkItems };
