const http = require('node:http');
const { URL } = require('node:url');
const {
  listProducts, createProduct, updateProduct, deleteProduct, importProducts,
  listCategories, createCategory, updateCategory, deleteCategory,
  listGroups, createGroup, deleteGroup,
  listResources, createResource, updateResource, deleteResource,
  closeDb,
} = require('./db');

// server.js é só a composição: boot de ambiente, o router HTTP puro e o start do processo. Toda
// regra de negócio (extração de specs, motor de recursos/capacidade, provedores de busca,
// validação) mora em lib/ — ver lib/ para o detalhamento por módulo.
const { PORT, HOST } = require('./lib/env');
const { normalize } = require('./lib/text');
const {
  detectSecurityCategory, detectExactCategory, matchesRequestedModel, isStandaloneProductOffer,
  extractDvrNvrSpecs, extractCameraSpecs, extractFacialSpecs, extractPorteiroSpecs, extractSwitchSpecs,
  extractFonteSpecs, extractCaboSpecs, extractMikrotikSpecs, extractRoteadorSpecs, extractAcabamentoSpecs,
} = require('./lib/specs');
const { computeCategoryMissingEssentials } = require('./lib/recipeEngine');
const { sendJson, sendCsv, readJson, serveStatic } = require('./lib/http');
const {
  validateSearchRequest, validateCompareRequest, validateRecipeItems, validateRecipePriceItems,
  validateProductRequest, validateCategoryRequest, validateResourceRequest,
} = require('./lib/validators');
const { buildProductTemplateCsv, parseProductImportCsv } = require('./lib/productImport');
const { setShoppingFetcher } = require('./lib/providers/shoppingFetcher');
const { excludePriceOutliers, selectTopDistinctStores, buildGoogleShoppingUrl } = require('./lib/providers/shared');
const {
  normalizeIntelbrasOffers, searchIntelbrasShopping, buildIntelbrasSpecs, fetchIntelbrasProductSpecs, fetchProductSpecs,
} = require('./lib/providers/intelbras');
const { normalizeAmazonOffers, searchAmazonShopping, setAmazonBrowserLauncher } = require('./lib/providers/amazon');
const { normalizeSerperShopping, searchSerperShopping } = require('./lib/providers/serper');
const { normalizeSerpApiShopping, searchSerpApiShopping } = require('./lib/providers/serpapi');
const { SEARCH_PROVIDERS, AGGREGATE_PROVIDER, DEFAULT_PROVIDER, searchAllProviders, fetchRecipeItemPrice } = require('./lib/providers');

async function requestHandler(request, response) {
  if (request.method === 'OPTIONS') return sendJson(response, 204, {});
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      const providers = Object.fromEntries(Object.entries(SEARCH_PROVIDERS).map(([key, provider]) => [key, provider.hasKey()]));
      providers[AGGREGATE_PROVIDER] = true;
      return sendJson(response, 200, { status: 'healthy', search_providers: providers });
    }
    if (request.method === 'POST' && url.pathname === '/api/search') {
      const body = await readJson(request);
      const { query } = validateSearchRequest(body);
      const requestedProvider = normalize(body.provider).toLowerCase();
      const providerKey = requestedProvider === AGGREGATE_PROVIDER || !SEARCH_PROVIDERS[requestedProvider] ? DEFAULT_PROVIDER : requestedProvider;
      const result = providerKey === AGGREGATE_PROVIDER ? await searchAllProviders(query) : await SEARCH_PROVIDERS[providerKey].search(query);
      return sendJson(response, 200, { ...result, provider: providerKey });
    }
    if (request.method === 'POST' && url.pathname === '/api/compare') {
      const body = await readJson(request);
      const items = validateCompareRequest(body);
      const results = await Promise.all(items.map(async (item) => ({ url: item.url, ...(await fetchProductSpecs(item.url, item.title)) })));
      return sendJson(response, 200, { results });
    }
    if (request.method === 'POST' && url.pathname === '/api/recipe/suggestions') {
      const body = await readJson(request);
      const cartItems = validateRecipeItems(body);
      const categories = await listCategories();
      const resources = await listResources();
      // "items" ecoa a categoria exata detectada de cada item de entrada, na mesma ordem — o canvas
      // (estilo n8n) usa isso pra saber de qual nó desenhar a aresta, sem duplicar detecção em JS.
      const items = cartItems.map(({ title }) => ({ title, category: detectExactCategory(title, categories)?.value || null }));
      return sendJson(response, 200, { ...computeCategoryMissingEssentials(cartItems, categories, resources), items });
    }
    if (request.method === 'POST' && url.pathname === '/api/recipe/prices') {
      const body = await readJson(request);
      const items = validateRecipePriceItems(body);
      const results = await Promise.all(items.map(fetchRecipeItemPrice));
      return sendJson(response, 200, { results });
    }
    if (request.method === 'GET' && url.pathname === '/api/products/template') {
      const categories = await listCategories();
      return sendCsv(response, 'produtos-modelo.csv', buildProductTemplateCsv(categories));
    }
    if (request.method === 'POST' && url.pathname === '/api/products/import') {
      const body = await readJson(request);
      const csvText = typeof body.csv === 'string' ? body.csv : '';
      if (!csvText.trim()) throw new Error('Envie o conteúdo da planilha.');
      const categories = await listCategories();
      const { products, errors } = parseProductImportCsv(csvText, categories);
      if (errors.length) return sendJson(response, 400, { detail: 'A planilha tem linhas inválidas.', errors });
      return sendJson(response, 200, await importProducts(products));
    }
    if (request.method === 'GET' && url.pathname === '/api/products') {
      const category = normalize(url.searchParams.get('category'));
      return sendJson(response, 200, { products: await listProducts(category || undefined) });
    }
    if (request.method === 'POST' && url.pathname === '/api/products') {
      const body = await readJson(request);
      return sendJson(response, 201, await createProduct(validateProductRequest(body)));
    }
    const productIdMatch = url.pathname.match(/^\/api\/products\/([a-f0-9]{24})$/i);
    if (productIdMatch && request.method === 'PUT') {
      const id = productIdMatch[1];
      const data = validateProductRequest(await readJson(request));
      if (!(await updateProduct(id, data))) return sendJson(response, 404, { detail: 'Produto não encontrado.' });
      return sendJson(response, 200, { id, ...data });
    }
    if (productIdMatch && request.method === 'DELETE') {
      const id = productIdMatch[1];
      if (!(await deleteProduct(id))) return sendJson(response, 404, { detail: 'Produto não encontrado.' });
      return sendJson(response, 200, { deleted: true });
    }
    if (request.method === 'GET' && url.pathname === '/api/categories') {
      return sendJson(response, 200, { categories: await listCategories() });
    }
    if (request.method === 'POST' && url.pathname === '/api/categories') {
      const body = await readJson(request);
      return sendJson(response, 201, await createCategory(validateCategoryRequest(body)));
    }
    const categoryIdMatch = url.pathname.match(/^\/api\/categories\/([a-f0-9]{24})$/i);
    if (categoryIdMatch && request.method === 'PUT') {
      const id = categoryIdMatch[1];
      const data = validateCategoryRequest(await readJson(request));
      if (!(await updateCategory(id, data))) return sendJson(response, 404, { detail: 'Categoria não encontrada.' });
      return sendJson(response, 200, { id, ...data });
    }
    if (categoryIdMatch && request.method === 'DELETE') {
      const id = categoryIdMatch[1];
      if (!(await deleteCategory(id))) return sendJson(response, 404, { detail: 'Categoria não encontrada.' });
      return sendJson(response, 200, { deleted: true });
    }
    if (request.method === 'GET' && url.pathname === '/api/groups') {
      return sendJson(response, 200, { groups: await listGroups() });
    }
    if (request.method === 'POST' && url.pathname === '/api/groups') {
      const body = await readJson(request);
      return sendJson(response, 201, await createGroup(body?.name));
    }
    const groupIdMatch = url.pathname.match(/^\/api\/groups\/([a-f0-9]{24})$/i);
    if (groupIdMatch && request.method === 'DELETE') {
      const id = groupIdMatch[1];
      if (!(await deleteGroup(id))) return sendJson(response, 404, { detail: 'Grupo não encontrado.' });
      return sendJson(response, 200, { deleted: true });
    }
    if (request.method === 'GET' && url.pathname === '/api/resources') {
      return sendJson(response, 200, { resources: await listResources() });
    }
    if (request.method === 'POST' && url.pathname === '/api/resources') {
      const body = await readJson(request);
      return sendJson(response, 201, await createResource(validateResourceRequest(body)));
    }
    const resourceIdMatch = url.pathname.match(/^\/api\/resources\/([a-f0-9]{24})$/i);
    if (resourceIdMatch && request.method === 'PUT') {
      const id = resourceIdMatch[1];
      const label = normalize((await readJson(request)).label);
      if (!label || label.length > 100) throw new Error('Informe um nome para o recurso (até 100 caracteres).');
      if (!(await updateResource(id, { label }))) return sendJson(response, 404, { detail: 'Recurso não encontrado.' });
      return sendJson(response, 200, { id, label });
    }
    if (resourceIdMatch && request.method === 'DELETE') {
      const id = resourceIdMatch[1];
      if (!(await deleteResource(id))) return sendJson(response, 404, { detail: 'Recurso não encontrado.' });
      return sendJson(response, 200, { deleted: true });
    }
    if (request.method === 'GET') return serveStatic(url.pathname, response);
    return sendJson(response, 404, { detail: 'Rota não encontrada.' });
  } catch (error) {
    return sendJson(response, 400, { detail: error.message || 'Erro interno do servidor.' });
  }
}

function startServer() {
  const server = http.createServer(requestHandler);
  server.listen(PORT, HOST, () => console.log(`Comprador Inviolável em http://localhost:${PORT}`));
  return server;
}

function setGoogleShoppingFetcher(fetcher) {
  setShoppingFetcher(fetcher);
}

if (require.main === module) startServer();

module.exports = {
  buildGoogleShoppingUrl,
  buildIntelbrasSpecs,
  computeCategoryMissingEssentials,
  detectExactCategory,
  detectSecurityCategory,
  excludePriceOutliers,
  extractAcabamentoSpecs,
  extractCaboSpecs,
  extractCameraSpecs,
  extractDvrNvrSpecs,
  extractFacialSpecs,
  extractFonteSpecs,
  extractMikrotikSpecs,
  extractPorteiroSpecs,
  extractRoteadorSpecs,
  extractSwitchSpecs,
  fetchIntelbrasProductSpecs,
  fetchProductSpecs,
  fetchRecipeItemPrice,
  isStandaloneProductOffer,
  matchesRequestedModel,
  normalizeAmazonOffers,
  normalizeIntelbrasOffers,
  normalizeSerperShopping,
  normalizeSerpApiShopping,
  requestHandler,
  searchAllProviders,
  searchAmazonShopping,
  searchIntelbrasShopping,
  searchSerperShopping,
  searchSerpApiShopping,
  selectTopDistinctStores,
  setAmazonBrowserLauncher,
  setGoogleShoppingFetcher,
  startServer,
  validateProductRequest,
  closeDb,
};
