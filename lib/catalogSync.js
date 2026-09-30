// Exporta/importa o que hoje só existe no Mongo (categorias, recursos, grupos, produtos e instruções da
// IA) para um arquivo versionável — assim uma instalação nova reproduz o catálogo sem refazer à mão.
// Aqui só a parte pura (montar o snapshot e planejar o que a importação faria); o acesso ao banco fica
// em scripts/catalog-sync.js. A importação NUNCA apaga: só cria o que falta e atualiza o que mudou.

const CATEGORY_FIELDS = ['group', 'value', 'label', 'capacity', 'icon', 'provides', 'requirements', 'canBeContainer', 'coverage'];

// Comparação simples (não localeCompare): a ordem tem que ser igual em qualquer máquina, senão o diff
// no Git mostra "mudança" onde não houve.
const byText = (get) => (a, b) => { const x = get(a).toLowerCase(); const y = get(b).toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; };

// O Mongo reordena as chaves dos objetos ao gravar (ex.: "critical" muda de lugar dentro de um requisito).
// Sem uma forma canônica (chaves em ordem alfabética, em qualquer profundidade; listas mantêm a ordem,
// que é significativa) o import enxergaria "mudança" onde não há e nunca ficaria idempotente.
const canonical = (v) => {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]));
  return v;
};
const pickCategory = (c) => canonical(Object.fromEntries(CATEGORY_FIELDS.map((f) => [f, c[f] ?? null])));
const sameJson = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const norm = (s) => String(s || '').trim().toLowerCase();

function buildSnapshot({ groups, resources, categories, products, aiInstructions }) {
  return {
    version: 1,
    groups: groups.map((g) => g.name).sort((a, b) => norm(a) < norm(b) ? -1 : norm(a) > norm(b) ? 1 : 0),
    resources: resources.map(({ key, label }) => ({ key, label })).sort(byText((r) => r.key)),
    categories: categories.map(pickCategory).sort(byText((c) => c.value)),
    products: products.map(({ category, brand, model }) => ({ category, brand, model })).sort(byText((p) => `${p.model}|${p.category}`)),
    aiInstructions: { classification: aiInstructions?.classification ?? null, audit: aiInstructions?.audit ?? null },
  };
}

function planImport(snapshot, current, { withInstructions = false } = {}) {
  const groupNames = new Set(current.groups.map((g) => norm(g.name)));
  const resourceByKey = new Map(current.resources.map((r) => [r.key, r]));
  const categoryByValue = new Map(current.categories.map((c) => [norm(c.value), c]));
  const productByModel = new Map();
  for (const p of current.products) if (!productByModel.has(norm(p.model))) productByModel.set(norm(p.model), p);

  const plan = {
    groups: { create: snapshot.groups.filter((g) => !groupNames.has(norm(g))) },
    resources: { create: [], update: [] },
    categories: { create: [], update: [] },
    products: { create: [], update: [] },
    aiInstructions: false,
  };
  for (const r of snapshot.resources) {
    const found = resourceByKey.get(r.key);
    if (!found) plan.resources.create.push(r);
    else if (found.label !== r.label) plan.resources.update.push({ id: found.id, ...r });
  }
  for (const c of snapshot.categories) {
    const found = categoryByValue.get(norm(c.value));
    if (!found) plan.categories.create.push(c);
    else if (!sameJson(pickCategory(found), pickCategory(c))) plan.categories.update.push({ id: found.id, ...c });
  }
  for (const p of snapshot.products) {
    const found = productByModel.get(norm(p.model));
    if (!found) plan.products.create.push(p);
    else if (found.category !== p.category || found.brand !== p.brand) plan.products.update.push({ id: found.id, ...p });
  }
  if (withInstructions) {
    const cur = current.aiInstructions || {};
    plan.aiInstructions = (cur.classification ?? null) !== snapshot.aiInstructions.classification || (cur.audit ?? null) !== snapshot.aiInstructions.audit;
  }

  const snapCats = new Set(snapshot.categories.map((c) => norm(c.value)));
  const snapProducts = new Set(snapshot.products.map((p) => norm(p.model)));
  const snapResources = new Set(snapshot.resources.map((r) => r.key));
  const snapGroups = new Set(snapshot.groups.map(norm));
  plan.extrasInDb = current.categories.filter((c) => !snapCats.has(norm(c.value))).length
    + [...productByModel.keys()].filter((m) => !snapProducts.has(m)).length
    + current.resources.filter((r) => !snapResources.has(r.key)).length
    + current.groups.filter((g) => !snapGroups.has(norm(g.name))).length;
  plan.total = plan.groups.create.length + plan.resources.create.length + plan.resources.update.length
    + plan.categories.create.length + plan.categories.update.length
    + plan.products.create.length + plan.products.update.length + (plan.aiInstructions ? 1 : 0);
  return plan;
}

module.exports = { buildSnapshot, planImport };
