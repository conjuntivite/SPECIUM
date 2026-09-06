const { MongoClient, ObjectId } = require('mongodb');
const catalogSeed = require('./web/src/data/catalog.json');
const { CATEGORY_DEPENDENCY_SEED } = require('./categoryDependencySeed');
const { CATEGORY_RESOURCE_SEED } = require('./categoryResourceSeed');

// Conexão lazy (só na primeira query): assim process.env.MONGODB_URI já está carregado do .env
// (server.js lê o .env depois de dar require neste módulo) e os testes podem sobrescrever a env var
// antes da primeira chamada. Aponta pro Docker local por padrão; trocar pra outro Mongo (produção,
// sistema compartilhado) é só mudar MONGODB_URI/MONGODB_DB no .env, sem mexer em código.
let client = null;
let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    const dbName = process.env.MONGODB_DB || 'comprador_inviolavel';
    dbPromise = MongoClient.connect(uri).then((connectedClient) => {
      client = connectedClient;
      return connectedClient.db(dbName);
    });
  }
  return dbPromise;
}

async function getProductsCollection() {
  const db = await getDb();
  return db.collection('products');
}

function toProduct(doc) {
  return { id: doc._id.toString(), category: doc.category, brand: doc.brand, model: doc.model };
}

async function listProducts(category) {
  const products = await getProductsCollection();
  const query = category ? { category } : {};
  const docs = await products.find(query).sort({ category: 1, brand: 1, model: 1 }).toArray();
  return docs.map(toProduct);
}

async function createProduct({ category, brand, model }) {
  const products = await getProductsCollection();
  const { insertedId } = await products.insertOne({ category, brand, model, createdAt: new Date() });
  return { id: insertedId.toString(), category, brand, model };
}

async function updateProduct(id, { category, brand, model }) {
  if (!ObjectId.isValid(id)) return false;
  const products = await getProductsCollection();
  const { matchedCount } = await products.updateOne({ _id: new ObjectId(id) }, { $set: { category, brand, model } });
  return matchedCount > 0;
}

async function deleteProduct(id) {
  if (!ObjectId.isValid(id)) return false;
  const products = await getProductsCollection();
  const { deletedCount } = await products.deleteOne({ _id: new ObjectId(id) });
  return deletedCount > 0;
}

async function getCategoriesCollection() {
  const db = await getDb();
  return db.collection('categories');
}

// Capacidade da categoria em si (quantas unidades de outra coisa ela comporta — portas de switch,
// canais de DVR/NVR). Deriva do próprio rótulo do catálogo ("Switch Giga 16 Portas", "DVR 16 Canais")
// em vez de manter uma tabela separada — uma fonte de verdade só, sem risco de dessincronizar.
function inferSeedCapacity(value) {
  const match = value.match(/(\d+)\s*(?:Portas|Canais)\b/i);
  return match ? Number(match[1]) : null;
}

// Semeia a coleção uma única vez com os 12 grupos fixos de web/src/data/catalog.json (a
// pré-build) e já traz as dependências equivalentes às antigas RECIPES fixas em server.js (ver
// categoryDependencySeed.js). Depois disso a coleção manda: a tela de cadastro edita esses
// documentos, não os arquivos-fonte.
async function ensureCategoriesSeeded(categories) {
  if (await categories.countDocuments() > 0) return;
  const seedDocs = catalogSeed.flatMap((group) =>
    group.items.map((item) => ({
      group: group.group, value: item.value, label: item.label,
      capacity: inferSeedCapacity(item.value),
      dependencies: CATEGORY_DEPENDENCY_SEED[item.value] || [],
      provides: CATEGORY_RESOURCE_SEED[item.value]?.provides || [],
      requirements: CATEGORY_RESOURCE_SEED[item.value]?.requirements || [],
      createdAt: new Date(),
    }))
  );
  if (seedDocs.length) await categories.insertMany(seedDocs);
}

// Backfill idempotente pra bancos já semeados antes do motor de recursos existir (ensureCategoriesSeeded
// só roda uma vez, na coleção vazia — não alcança quem já tinha dados). Só toca documentos sem o campo
// `provides` (nunca sobrescreve edição feita pelo cadastro) e só para as categorias que o motor novo
// conhece (ver categoryResourceSeed.js); o resto continua só no motor antigo de dependencies[].
async function ensureCategoryResourceSeeded(categories) {
  const knownValues = Object.keys(CATEGORY_RESOURCE_SEED);
  if (!knownValues.length) return;
  const pending = await categories.find({ value: { $in: knownValues }, provides: { $exists: false } }).toArray();
  for (const doc of pending) {
    const seed = CATEGORY_RESOURCE_SEED[doc.value];
    await categories.updateOne({ _id: doc._id }, { $set: { provides: seed.provides, requirements: seed.requirements } });
  }
}

function toCategory(doc) {
  return {
    id: doc._id.toString(), group: doc.group, value: doc.value, label: doc.label,
    capacity: Number.isFinite(doc.capacity) ? doc.capacity : null,
    dependencies: doc.dependencies || [],
    provides: doc.provides || [],
    requirements: doc.requirements || [],
  };
}

const MAX_DEPENDENCIES = 50;
const MAX_PROVIDES = 20;
const MAX_REQUIREMENTS = 30;

function sanitizeProvides(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    const resource = String(entry?.resource || '').trim();
    const amount = Math.trunc(Number(entry?.amount));
    if (!resource || seen.has(resource) || !Number.isFinite(amount) || amount <= 0) continue;
    seen.add(resource);
    out.push({ resource, amount: Math.min(amount, 100000) });
    if (out.length >= MAX_PROVIDES) break;
  }
  return out;
}

// Uma "option" de requisito é presença (candidates: [categoryValue, ...]) ou capacidade (resource +
// unitsPerItem). Reaproveitada tanto por requisitos simples quanto pelas opções de um requisito anyOf.
function sanitizeRequirementOption(raw) {
  if (raw?.type === 'capacity') {
    const resource = String(raw?.resource || '').trim();
    if (!resource) return null;
    const units = Math.trunc(Number(raw?.unitsPerItem));
    return { type: 'capacity', resource, unitsPerItem: Number.isFinite(units) && units > 0 ? Math.min(units, 1000) : 1 };
  }
  const candidates = Array.isArray(raw?.candidates)
    ? [...new Set(raw.candidates.map((v) => String(v || '').trim()).filter(Boolean))].slice(0, 50)
    : [];
  if (!candidates.length) return null;
  return { type: 'presence', candidates };
}

function sanitizeRequirements(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const req of raw) {
    const id = String(req?.id || '').trim();
    const label = String(req?.label || '').trim();
    if (!id || !label) continue;
    const critical = !!req?.critical;
    if (req?.type === 'anyOf') {
      const options = Array.isArray(req.options) ? req.options.map(sanitizeRequirementOption).filter(Boolean) : [];
      if (options.length < 2) continue;
      out.push({ id, label, type: 'anyOf', critical, options });
    } else {
      const option = sanitizeRequirementOption(req);
      if (!option) continue;
      out.push({ id, label, critical, ...option });
    }
    if (out.length >= MAX_REQUIREMENTS) break;
  }
  return out;
}

function sanitizeCapacity(raw) {
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : null;
}

// "alternatives" só referencia outras entradas da MESMA lista (por categoryValue) — nunca aponta pra
// fora do documento, então não existe referência pendente entre categorias diferentes por causa dela
// (só o próprio categoryValue de cada dependência aponta pra outro documento, ver deleteCategory).
function sanitizeDependencies(rawDependencies, ownValue) {
  if (!Array.isArray(rawDependencies)) return [];
  const seen = new Set();
  const deps = [];
  for (const dep of rawDependencies) {
    const categoryValue = String(dep?.categoryValue || '').trim();
    if (!categoryValue || categoryValue === ownValue || seen.has(categoryValue)) continue;
    seen.add(categoryValue);
    const alternatives = Array.isArray(dep?.alternatives)
      ? [...new Set(dep.alternatives.map((v) => String(v || '').trim()).filter((v) => v && v !== ownValue))]
      : [];
    deps.push({ categoryValue, critical: !!dep?.critical, alternatives });
    if (deps.length >= MAX_DEPENDENCIES) break;
  }
  return deps;
}

// numeric:true trata número embutido no rótulo como número, não como texto — "4 Portas" < "8
// Portas" < "16 Portas" < "24 Portas", nunca "16" < "24" < "4" < "8" (o que uma comparação de string
// pura daria). Isso preserva a progressão numérica que a antiga ordenação por _id garantia, mas
// coloca categoria nova na posição alfabética certa dentro do grupo, não sempre no fim da lista.
const CATEGORY_SORT_COLLATOR = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

async function listCategories() {
  const categories = await getCategoriesCollection();
  await ensureCategoriesSeeded(categories);
  await ensureCategoryResourceSeeded(categories);
  const docs = await categories.find({}).toArray();
  docs.sort((a, b) => CATEGORY_SORT_COLLATOR.compare(a.group, b.group) || CATEGORY_SORT_COLLATOR.compare(a.label, b.label));
  return docs.map(toCategory);
}

async function createCategory({ group, label, capacity, dependencies, provides, requirements }) {
  const categories = await getCategoriesCollection();
  const value = label;
  const cleanCapacity = sanitizeCapacity(capacity);
  const cleanDeps = sanitizeDependencies(dependencies, value);
  const cleanProvides = sanitizeProvides(provides);
  const cleanRequirements = sanitizeRequirements(requirements);
  const { insertedId } = await categories.insertOne({
    group, value, label, capacity: cleanCapacity, dependencies: cleanDeps,
    provides: cleanProvides, requirements: cleanRequirements, createdAt: new Date(),
  });
  return { id: insertedId.toString(), group, value, label, capacity: cleanCapacity, dependencies: cleanDeps, provides: cleanProvides, requirements: cleanRequirements };
}

// "value" não é editável: é a chave que já pode estar gravada em products.category e nas
// dependencies de outras categorias — renomear só o rótulo exibido não pode quebrar essas referências.
// provides/requirements só entram no $set quando o chamador realmente os envia (undefined = não
// mexe) — o CategoryFormDialog ainda não edita esses campos, então uma edição comum (grupo, nome,
// dependencies) não pode apagar o que o backfill/seed de recursos gravou.
async function updateCategory(id, { group, label, capacity, dependencies, provides, requirements }) {
  if (!ObjectId.isValid(id)) return false;
  const categories = await getCategoriesCollection();
  const existing = await categories.findOne({ _id: new ObjectId(id) });
  if (!existing) return false;
  const cleanCapacity = sanitizeCapacity(capacity);
  const cleanDeps = sanitizeDependencies(dependencies, existing.value);
  const update = { group, label, capacity: cleanCapacity, dependencies: cleanDeps };
  if (provides !== undefined) update.provides = sanitizeProvides(provides);
  if (requirements !== undefined) update.requirements = sanitizeRequirements(requirements);
  const { matchedCount } = await categories.updateOne({ _id: new ObjectId(id) }, { $set: update });
  return matchedCount > 0;
}

async function getGroupsCollection() {
  const db = await getDb();
  return db.collection('groups');
}

function toGroup(doc) {
  return { id: doc._id.toString(), name: doc.name };
}

// Semeia com os mesmos 12 grupos fixos do catálogo pré-build, uma única vez — depois disso quem
// manda é o cadastro (seletor de Grupo na aba Categorias), igual ao padrão de ensureCategoriesSeeded.
async function ensureGroupsSeeded(groups) {
  if (await groups.countDocuments() > 0) return;
  const names = [...new Set(catalogSeed.map((g) => g.group))];
  if (names.length) await groups.insertMany(names.map((name) => ({ name, createdAt: new Date() })));
}

async function listGroups() {
  const groups = await getGroupsCollection();
  await ensureGroupsSeeded(groups);
  const docs = await groups.find({}).sort({ name: 1 }).toArray();
  return docs.map(toGroup);
}

async function createGroup(name) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('Informe um nome de grupo.');
  const groups = await getGroupsCollection();
  await ensureGroupsSeeded(groups);
  const all = await groups.find({}).toArray();
  if (all.some((g) => g.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error('Já existe um grupo com esse nome.');
  }
  const { insertedId } = await groups.insertOne({ name: clean, createdAt: new Date() });
  return { id: insertedId.toString(), name: clean };
}

// Bloqueia a exclusão enquanto alguma categoria usar o grupo — mesma regra de deleteCategory (evita
// perder a referência de categorias já cadastradas por causa de um nome de grupo removido embaixo delas).
async function deleteGroup(id) {
  if (!ObjectId.isValid(id)) return false;
  const groups = await getGroupsCollection();
  const group = await groups.findOne({ _id: new ObjectId(id) });
  if (!group) return false;

  const categories = await getCategoriesCollection();
  const categoriesInGroup = await categories.countDocuments({ group: group.name });
  if (categoriesInGroup > 0) {
    throw new Error(`Não é possível excluir: ${categoriesInGroup} categoria(s) usam esse grupo.`);
  }

  const { deletedCount } = await groups.deleteOne({ _id: new ObjectId(id) });
  return deletedCount > 0;
}

async function deleteCategory(id) {
  if (!ObjectId.isValid(id)) return false;
  const categories = await getCategoriesCollection();
  const category = await categories.findOne({ _id: new ObjectId(id) });
  if (!category) return false;

  const products = await getProductsCollection();
  const productsInCategory = await products.countDocuments({ category: category.value });
  if (productsInCategory > 0) {
    throw new Error(`Não é possível excluir: há ${productsInCategory} produto(s) cadastrado(s) nessa categoria.`);
  }

  const dependentsCount = await categories.countDocuments({ 'dependencies.categoryValue': category.value });
  if (dependentsCount > 0) {
    throw new Error(`Não é possível excluir: ${dependentsCount} categoria(s) dependem dela.`);
  }

  const { deletedCount } = await categories.deleteOne({ _id: new ObjectId(id) });
  return deletedCount > 0;
}

async function getResourcesCollection() {
  const db = await getDb();
  return db.collection('resources');
}

// Os 4 recursos que o motor de capacidade já usa hoje (categoryResourceSeed.js) — semeados uma vez
// só; depois disso quem manda é o cadastro (aba Recursos), igual ao padrão de ensureGroupsSeeded.
// Pedido do usuário: um sistema que pode ser implantado em outras empresas não pode ter os recursos
// fixos em código — o cadastro é o jeito de outra empresa (ramo diferente de segurança eletrônica)
// criar os próprios (ex.: "license.ai_channel", "power.va") sem mexer em código-fonte.
const SEED_RESOURCES = [
  { key: 'network.gigabit_port', label: 'Porta Gigabit' },
  { key: 'power.poe_port', label: 'Porta PoE' },
  { key: 'recording.ip_channel', label: 'Canal de gravação IP' },
  { key: 'recording.analog_channel', label: 'Canal de gravação analógica' },
];

async function ensureResourcesSeeded(resources) {
  if (await resources.countDocuments() > 0) return;
  await resources.insertMany(SEED_RESOURCES.map((r) => ({ ...r, createdAt: new Date() })));
}

function toResource(doc) {
  return { id: doc._id.toString(), key: doc.key, label: doc.label };
}

async function listResources() {
  const resources = await getResourcesCollection();
  await ensureResourcesSeeded(resources);
  const docs = await resources.find({}).sort({ key: 1 }).toArray();
  return docs.map(toResource);
}

// "key" não é editável depois de criado: é o identificador gravado em provides[].resource e em
// requirements[] (capacity/anyOf) das categorias — mesma regra do "value" de categoria.
async function createResource({ key, label }) {
  const resources = await getResourcesCollection();
  const existing = await resources.findOne({ key });
  if (existing) throw new Error('Já existe um recurso com essa chave.');
  const { insertedId } = await resources.insertOne({ key, label, createdAt: new Date() });
  return { id: insertedId.toString(), key, label };
}

async function updateResource(id, { label }) {
  if (!ObjectId.isValid(id)) return false;
  const resources = await getResourcesCollection();
  const { matchedCount } = await resources.updateOne({ _id: new ObjectId(id) }, { $set: { label } });
  return matchedCount > 0;
}

// Bloqueia exclusão enquanto alguma categoria fornecer (provides) ou exigir (requirements — direto
// ou dentro de uma opção de anyOf) esse recurso — mesma proteção de deleteGroup/deleteCategory.
async function deleteResource(id) {
  if (!ObjectId.isValid(id)) return false;
  const resources = await getResourcesCollection();
  const resource = await resources.findOne({ _id: new ObjectId(id) });
  if (!resource) return false;

  const categories = await getCategoriesCollection();
  const usedCount = await categories.countDocuments({
    $or: [
      { 'provides.resource': resource.key },
      { 'requirements.resource': resource.key },
      { 'requirements.options.resource': resource.key },
    ],
  });
  if (usedCount > 0) {
    throw new Error(`Não é possível excluir: ${usedCount} categoria(s) usam esse recurso.`);
  }

  const { deletedCount } = await resources.deleteOne({ _id: new ObjectId(id) });
  return deletedCount > 0;
}

async function closeDb() {
  if (!dbPromise) return;
  await dbPromise;
  await client.close();
  client = null;
  dbPromise = null;
}

module.exports = {
  listProducts, createProduct, updateProduct, deleteProduct,
  listCategories, createCategory, updateCategory, deleteCategory,
  listGroups, createGroup, deleteGroup,
  listResources, createResource, updateResource, deleteResource,
  closeDb,
};
