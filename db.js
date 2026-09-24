const { MongoClient, ObjectId } = require('mongodb');
const catalogSeed = require('./web/src/data/catalog.json');
const { CATEGORY_RESOURCE_SEED } = require('./categoryResourceSeed');
const { COVERAGE_SHAPES } = require('./lib/validators');

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

// Ignora duplicata exata (mesma categoria+marca+modelo, sem diferenciar maiúsculas) já cadastrada —
// reimportar a mesma planilha (ou uma planilha com sobreposição) não duplica produto no catálogo.
async function importProducts(items) {
  const products = await getProductsCollection();
  const existing = await products.find({}, { projection: { category: 1, brand: 1, model: 1 } }).toArray();
  const seen = new Set(existing.map((p) => `${p.category}|${p.brand}|${p.model}`.toLowerCase()));
  const toInsert = [];
  let skipped = 0;
  for (const item of items) {
    const key = `${item.category}|${item.brand}|${item.model}`.toLowerCase();
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);
    toInsert.push({ category: item.category, brand: item.brand, model: item.model, createdAt: new Date() });
  }
  if (toInsert.length) await products.insertMany(toInsert);
  return { imported: toInsert.length, skipped };
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
// pré-build), já com provides/requirements do motor de recursos (ver categoryResourceSeed.js).
// Depois disso a coleção manda: a tela de cadastro edita esses documentos, não os arquivos-fonte.
async function ensureCategoriesSeeded(categories) {
  if (await categories.countDocuments() > 0) return;
  const seedDocs = catalogSeed.flatMap((group) =>
    group.items.map((item) => ({
      group: group.group, value: item.value, label: item.label,
      capacity: inferSeedCapacity(item.value),
      provides: CATEGORY_RESOURCE_SEED[item.value]?.provides || [],
      requirements: CATEGORY_RESOURCE_SEED[item.value]?.requirements || [],
      createdAt: new Date(),
    }))
  );
  if (seedDocs.length) await categories.insertMany(seedDocs);
}

// Backfill idempotente pra bancos já semeados antes do motor de recursos existir (ensureCategoriesSeeded
// só roda uma vez, na coleção vazia — não alcança quem já tinha dados). Só toca documentos sem o campo
// `provides` (nunca sobrescreve edição feita pelo cadastro).
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
    icon: doc.icon || '',
    provides: doc.provides || [],
    requirements: doc.requirements || [],
    canBeContainer: !!doc.canBeContainer,
    coverage: COVERAGE_SHAPES.includes(doc.coverage) ? doc.coverage : null,
  };
}

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

// "value" (usado em products.category, requirements.candidates e provides.resource em toda a
// base) sai direto do label e nunca muda depois — duas categorias com o mesmo nome colidiriam nessa
// chave e uma ficaria inacessível pro motor de sugestões. Mesma checagem de duplicata do createGroup.
async function createCategory({ group, label, capacity, icon, provides, requirements, canBeContainer, coverage }) {
  const categories = await getCategoriesCollection();
  const value = label;
  const all = await categories.find({}, { projection: { value: 1 } }).toArray();
  if (all.some((c) => c.value.toLowerCase() === value.toLowerCase())) {
    throw new Error('Já existe uma categoria com esse nome.');
  }
  const cleanCapacity = sanitizeCapacity(capacity);
  const cleanIcon = icon || '';
  const cleanProvides = sanitizeProvides(provides);
  const cleanRequirements = sanitizeRequirements(requirements);
  const cleanCanBeContainer = !!canBeContainer;
  const { insertedId } = await categories.insertOne({
    group, value, label, capacity: cleanCapacity, icon: cleanIcon,
    provides: cleanProvides, requirements: cleanRequirements, canBeContainer: cleanCanBeContainer, coverage: coverage || null, createdAt: new Date(),
  });
  return { id: insertedId.toString(), group, value, label, capacity: cleanCapacity, icon: cleanIcon, provides: cleanProvides, requirements: cleanRequirements, canBeContainer: cleanCanBeContainer, coverage: coverage || null };
}

// "value" não é editável: é a chave que já pode estar gravada em products.category e nas
// candidates de requirements de outras categorias — renomear só o rótulo exibido não pode quebrar
// essas referências. provides/requirements só entram no $set quando o chamador realmente os envia
// (undefined = não mexe), pra uma edição comum (grupo, nome, capacidade) não apagar o que já estava
// cadastrado ali.
async function updateCategory(id, { group, label, capacity, icon, provides, requirements, canBeContainer, coverage }) {
  if (!ObjectId.isValid(id)) return false;
  const categories = await getCategoriesCollection();
  const existing = await categories.findOne({ _id: new ObjectId(id) });
  if (!existing) return false;
  const cleanCapacity = sanitizeCapacity(capacity);
  const update = { group, label, capacity: cleanCapacity, icon: icon || '', canBeContainer: !!canBeContainer, coverage: coverage || null };
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

  // Bloqueia exclusão enquanto algum requirement de presença (direto ou dentro de uma opção de
  // anyOf) de outra categoria listar esta como candidata — mesma proteção que dependencies[] tinha
  // no motor antigo, agora pro motor novo. Notação de ponto do Mongo atravessa os dois arrays
  // (requirements[] e requirements[].options[]) sozinha: casa se QUALQUER elemento tiver o value.
  const dependentsCount = await categories.countDocuments({
    _id: { $ne: category._id },
    $or: [
      { 'requirements.candidates': category.value },
      { 'requirements.options.candidates': category.value },
    ],
  });
  if (dependentsCount > 0) {
    throw new Error(`Não é possível excluir: ${dependentsCount} categoria(s) usam esta como candidata em algum requisito.`);
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

async function getSettingsCollection() {
  const db = await getDb();
  return db.collection('settings');
}

// Documento único (_id fixo, sem ObjectId — não é uma lista) com as instruções de negócio das
// etapas de IA (ver lib/quoteAudit.js). Campo ausente/null = tela ainda não sobrescreveu; quem
// decide o texto padrão nesse caso é o próprio lib/quoteAudit.js (DEFAULT_*_INSTRUCTIONS).
async function getAiInstructions() {
  const settings = await getSettingsCollection();
  const doc = await settings.findOne({ _id: 'ai_instructions' });
  return { classification: doc?.classification || null, audit: doc?.audit || null };
}

async function updateAiInstructions({ classification, audit }) {
  const settings = await getSettingsCollection();
  await settings.updateOne(
    { _id: 'ai_instructions' },
    { $set: { classification, audit, updatedAt: new Date() } },
    { upsert: true },
  );
  return { classification, audit };
}

async function getUsersCollection() {
  const db = await getDb();
  return db.collection('users');
}

function toPublicUser(doc) {
  return {
    id: doc._id.toString(), email: doc.email, name: doc.name || null, role: doc.role || 'user', createdAt: doc.createdAt || null,
    unrestricted: doc.unrestricted === true, avatar: doc.avatar || null,
    screens: Array.isArray(doc.screens) ? doc.screens : null,
  };
}

async function createUser({ email, passwordHash, name = null }) {
  const users = await getUsersCollection();
  if (await users.findOne({ email })) throw new Error('Já existe uma conta com esse e-mail.');
  // Toda conta nasce "user" — virar admin é uma promoção manual (cadastro de usuários, admin-only),
  // nunca uma escolha do próprio registro.
  const doc = { email, passwordHash, name, role: 'user', createdAt: new Date() };
  const { insertedId } = await users.insertOne(doc);
  return toPublicUser({ _id: insertedId, ...doc });
}

async function listUsers() {
  const users = await getUsersCollection();
  // Conta dev (hidden: true) some da tela de usuários — nem outros admins a veem ou editam por lá.
  const docs = await users.find({ hidden: { $ne: true } }).sort({ email: 1 }).toArray();
  return docs.map(toPublicUser);
}

// Admin-only (checado em server.js) — edita nome/e-mail/senha/papel de qualquer conta. `patch` já
// vem com passwordHash pronto (server.js faz o hash antes de chamar), nunca a senha em texto puro.
async function updateUser(id, patch) {
  if (!ObjectId.isValid(id)) return null;
  const users = await getUsersCollection();
  if (patch.email) {
    const existing = await users.findOne({ email: patch.email, _id: { $ne: new ObjectId(id) } });
    if (existing) throw new Error('Já existe uma conta com esse e-mail.');
  }
  const updated = await users.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: patch },
    { returnDocument: 'after' }
  );
  return updated ? toPublicUser(updated) : null;
}

// Devolve o doc cru (com passwordHash) — só pro fluxo de login conferir a senha.
async function findUserByEmail(email) {
  const users = await getUsersCollection();
  return users.findOne({ email });
}

async function findUserById(id) {
  if (!ObjectId.isValid(id)) return null;
  const users = await getUsersCollection();
  const doc = await users.findOne({ _id: new ObjectId(id) });
  return doc ? toPublicUser(doc) : null;
}

// Conta de recuperação (admin), semeada a cada boot a partir de DEV_EMAIL/DEV_PASSWORD no .env — se
// esquecer a senha própria, trocar a senha do dev no .env e reiniciar já reseta a conta.
// hidden: some da tela de usuários (listUsers). unrestricted: enxerga/edita orçamento de qualquer
// usuário, sem as travas de dono nem de status (ver budget* em db.js) — conta de suporte, não segue
// as mesmas regras de um admin comum.
async function seedDevAdmin({ email, passwordHash }) {
  const users = await getUsersCollection();
  await users.updateOne(
    { email },
    { $set: { email, passwordHash, role: 'admin', hidden: true, unrestricted: true }, $setOnInsert: { name: 'Dev', createdAt: new Date() } },
    { upsert: true }
  );
}

async function getSessionsCollection() {
  const db = await getDb();
  return db.collection('sessions');
}

// _id é o próprio token (string aleatória gerada por lib/auth.js) — sessão não precisa de
// ObjectId, é só um lookup direto por chave.
async function createSession(token, userId, expiresAt) {
  const sessions = await getSessionsCollection();
  await sessions.insertOne({ _id: token, userId: new ObjectId(userId), expiresAt });
}

// Limpeza preguiçosa: uma sessão expirada encontrada aqui já é apagada na hora, em vez de um
// job de limpeza separado — não há motivo pra rodar duas rotinas quando uma leitura já revela a expiração.
async function findSessionUser(token) {
  if (!token) return null;
  const sessions = await getSessionsCollection();
  const session = await sessions.findOne({ _id: token });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await sessions.deleteOne({ _id: token });
    return null;
  }
  return findUserById(session.userId.toString());
}

async function deleteSession(token) {
  const sessions = await getSessionsCollection();
  await sessions.deleteOne({ _id: token });
}

async function getBudgetsCollection() {
  const db = await getDb();
  return db.collection('budgets');
}

function toBudget(doc) {
  return {
    id: doc._id.toString(),
    status: doc.status,
    clientName: doc.clientName || null,
    address: doc.address || null,
    number: doc.number || null,
    lat: Number.isFinite(doc.lat) ? doc.lat : null,
    lng: Number.isFinite(doc.lng) ? doc.lng : null,
    items: doc.items || [],
    positions: doc.positions || {},
    connections: doc.connections || [],
    mapLayout: doc.mapLayout || {},
    floorPlan: doc.floorPlan || null,
    floorPlanLayout: doc.floorPlanLayout || {},
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toBudgetSummary(doc) {
  return {
    id: doc._id.toString(), clientName: doc.clientName || null, status: doc.status,
    // Lista precisa saber se já dá pra abrir o mapa sem buscar o orçamento inteiro — não é mais
    // sinônimo de "fechado" (mapa libera já na etapa "criado", bem antes do orçamento fechar).
    hasAddress: Number.isFinite(doc.lat) && Number.isFinite(doc.lng),
    createdAt: doc.createdAt, updatedAt: doc.updatedAt,
  };
}

async function createBudget(userId) {
  const budgets = await getBudgetsCollection();
  const now = new Date();
  const doc = {
    userId: new ObjectId(userId), status: 'aberto', clientName: null, address: null, number: null, lat: null, lng: null,
    items: [], positions: {}, connections: [], mapLayout: {}, floorPlan: null, floorPlanLayout: {}, createdAt: now, updatedAt: now,
  };
  const { insertedId } = await budgets.insertOne(doc);
  return toBudget({ _id: insertedId, ...doc });
}

// `unrestricted` (conta dev, ver seedDevAdmin) ignora o dono e enxerga/edita orçamento de qualquer
// usuário — as travas de status (fechado só leitura, exclusão só se aberto) continuam valendo, são
// regra de integridade do dado, não de dono.
function ownerFilter(userId, unrestricted) {
  return unrestricted ? {} : { userId: new ObjectId(userId) };
}

async function listBudgetsForUser(userId, unrestricted = false) {
  const budgets = await getBudgetsCollection();
  const docs = await budgets.find(ownerFilter(userId, unrestricted)).sort({ updatedAt: -1 }).toArray();
  return docs.map(toBudgetSummary);
}

async function getBudgetForUser(id, userId, unrestricted = false) {
  if (!ObjectId.isValid(id)) return null;
  const budgets = await getBudgetsCollection();
  const doc = await budgets.findOne({ _id: new ObjectId(id), ...ownerFilter(userId, unrestricted) });
  return doc ? toBudget(doc) : null;
}

async function updateBudgetForUser(id, userId, patch, unrestricted = false) {
  if (!ObjectId.isValid(id)) return null;
  const budgets = await getBudgetsCollection();
  // Orçamento fechado só pode ser visualizado — barra aqui pega tanto o PATCH genérico (itens/
  // posições/conexões/status) quanto setBudgetAddressForUser (que delega pra cá), num lugar só.
  // Exceção: a própria transição PARA "fechado" (finalize) chega aqui com o status ainda
  // "negociação" no banco, então não esbarra nesta trava.
  const current = await budgets.findOne({ _id: new ObjectId(id), ...ownerFilter(userId, unrestricted) }, { projection: { status: 1 } });
  if (!current) return null;
  if (current.status === 'fechado') throw new Error('Orçamento fechado só pode ser visualizado — não é possível editar.');
  // driver mongodb@7: findOneAndUpdate devolve o documento direto (ou null), não mais um envelope
  // { value } como nas versões antigas — desestruturar { value } aqui sempre dava undefined e
  // fazia a função devolver null (404 "Orçamento não encontrado") mesmo quando a escrita já tinha
  // sido aplicada no banco.
  const updated = await budgets.findOneAndUpdate(
    { _id: current._id },
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return updated ? toBudget(updated) : null;
}

// Só grava os dados do endereço/geocodificação — a etapa (status) do orçamento é uma decisão
// separada do consultor (ver validateBudgetSaveRequest + PATCH genérico), não um efeito colateral
// automático de informar o endereço.
async function setBudgetAddressForUser(id, userId, { clientName, address, number, lat, lng }, unrestricted = false) {
  return updateBudgetForUser(id, userId, { clientName, address, number, lat, lng }, unrestricted);
}

// Exclusão só é permitida com o orçamento ainda "aberto" (rascunho não comprometido com endereço
// nem negociação) — filtro por status já vai dentro do deleteOne, atômico, sem janela de corrida
// entre checar e apagar.
async function deleteBudgetForUser(id, userId, unrestricted = false) {
  if (!ObjectId.isValid(id)) return { deleted: false, reason: 'not_found' };
  const budgets = await getBudgetsCollection();
  const current = await budgets.findOne({ _id: new ObjectId(id), ...ownerFilter(userId, unrestricted) }, { projection: { status: 1 } });
  if (!current) return { deleted: false, reason: 'not_found' };
  if (current.status !== 'aberto') return { deleted: false, reason: 'not_aberto' };
  const { deletedCount } = await budgets.deleteOne({ _id: current._id, status: 'aberto' });
  return { deleted: deletedCount > 0 };
}

async function closeDb() {
  if (!dbPromise) return;
  await dbPromise;
  await client.close();
  client = null;
  dbPromise = null;
}

module.exports = {
  listProducts, createProduct, updateProduct, deleteProduct, importProducts,
  listCategories, createCategory, updateCategory, deleteCategory,
  listGroups, createGroup, deleteGroup,
  listResources, createResource, updateResource, deleteResource,
  getAiInstructions, updateAiInstructions,
  createUser, findUserByEmail, findUserById, listUsers, updateUser, seedDevAdmin,
  createSession, findSessionUser, deleteSession,
  createBudget, listBudgetsForUser, getBudgetForUser, updateBudgetForUser, setBudgetAddressForUser, deleteBudgetForUser,
  closeDb,
};
