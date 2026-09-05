const { MongoClient, ObjectId } = require('mongodb');

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

async function closeDb() {
  if (!dbPromise) return;
  await dbPromise;
  await client.close();
  client = null;
  dbPromise = null;
}

module.exports = { listProducts, createProduct, updateProduct, deleteProduct, closeDb };
