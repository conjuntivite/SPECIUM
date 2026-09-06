const { MongoClient, ObjectId } = require('mongodb');
const catalogSeed = require('./web/src/data/catalog.json');
const { CATEGORY_DEPENDENCY_SEED } = require('./categoryDependencySeed');

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
      createdAt: new Date(),
    }))
  );
  if (seedDocs.length) await categories.insertMany(seedDocs);
}

function toCategory(doc) {
  return {
    id: doc._id.toString(), group: doc.group, value: doc.value, label: doc.label,
    capacity: Number.isFinite(doc.capacity) ? doc.capacity : null,
    dependencies: doc.dependencies || [],
  };
}

const MAX_DEPENDENCIES = 50;

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

async function listCategories() {
  const categories = await getCategoriesCollection();
  await ensureCategoriesSeeded(categories);
  // Ordena por criação (_id), não por label: mantém a ordem curada da pré-build (ex.: DVR 4, 8, 16
  // canais em vez de alfabética) e novas categorias caem no fim do próprio grupo, não no meio.
  const docs = await categories.find({}).sort({ _id: 1 }).toArray();
  return docs.map(toCategory);
}

async function createCategory({ group, label, capacity, dependencies }) {
  const categories = await getCategoriesCollection();
  const value = label;
  const cleanCapacity = sanitizeCapacity(capacity);
  const cleanDeps = sanitizeDependencies(dependencies, value);
  const { insertedId } = await categories.insertOne({ group, value, label, capacity: cleanCapacity, dependencies: cleanDeps, createdAt: new Date() });
  return { id: insertedId.toString(), group, value, label, capacity: cleanCapacity, dependencies: cleanDeps };
}

// "value" não é editável: é a chave que já pode estar gravada em products.category e nas
// dependencies de outras categorias — renomear só o rótulo exibido não pode quebrar essas referências.
async function updateCategory(id, { group, label, capacity, dependencies }) {
  if (!ObjectId.isValid(id)) return false;
  const categories = await getCategoriesCollection();
  const existing = await categories.findOne({ _id: new ObjectId(id) });
  if (!existing) return false;
  const cleanCapacity = sanitizeCapacity(capacity);
  const cleanDeps = sanitizeDependencies(dependencies, existing.value);
  const { matchedCount } = await categories.updateOne({ _id: new ObjectId(id) }, { $set: { group, label, capacity: cleanCapacity, dependencies: cleanDeps } });
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
  closeDb,
};
