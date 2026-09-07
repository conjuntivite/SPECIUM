const test = require('node:test');
const { after } = test;
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  buildGoogleShoppingUrl,
  buildIntelbrasSpecs,
  computeCategoryMissingEssentials,
  detectExactCategory,
  detectSecurityCategory,
  excludePriceOutliers,
  extractCaboSpecs,
  extractCameraSpecs,
  extractDvrNvrSpecs,
  extractMikrotikSpecs,
  extractSwitchSpecs,
  fetchIntelbrasProductSpecs,
  fetchProductSpecs,
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
  closeDb,
} = require('../server');

// Sem isso, a conexão do driver MongoDB mantém o processo vivo e `node --test` nunca retorna
// depois de mostrar o resultado.
after(() => closeDb());

function fakeAmazonBrowser(items) {
  return {
    newPage: async () => ({
      setExtraHTTPHeaders: async () => {},
      goto: async () => {},
      evaluate: async () => items,
      close: async () => {},
    }),
  };
}

function intelbrasProduct(overrides = {}) {
  return {
    productName: 'DVR Intelbras MHDX 1116 16 Canais',
    linkText: 'dvr-mhdx-1116-16-canais',
    allSpecifications: ['Fabricante', 'Modelo do produto', 'Garantia', 'segmento', 'Produto - bloco 1 imagem'],
    Fabricante: ['Intelbras S.a.'],
    'Modelo do produto': ['MHDX 1116'],
    Garantia: ['3 anos'],
    segmento: ['CFTV'],
    'Produto - bloco 1 imagem': ['https://example.test/img.png'],
    items: [{
      sellers: [{
        sellerDefault: true,
        commertialOffer: { Price: 899.9, IsAvailable: true, AvailableQuantity: 10, Installments: [{ NumberOfInstallments: 1, Value: 899.9 }, { NumberOfInstallments: 10, Value: 89.99 }] },
      }],
    }],
    ...overrides,
  };
}

test('builds a Brazil Portuguese Google Shopping query URL', () => {
  const url = new URL(buildGoogleShoppingUrl('DVR Intelbras 16 canais'));
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.searchParams.get('tbm'), 'shop');
  assert.equal(url.searchParams.get('gl'), 'br');
  assert.equal(url.searchParams.get('hl'), 'pt-BR');
});

test('detects the security-electronics category from a query, checking Mikrotik before generic router', () => {
  assert.equal(detectSecurityCategory('DVR Intelbras 16 canais'), 'dvr_nvr');
  assert.equal(detectSecurityCategory('Switch PoE 8 portas'), 'switch');
  assert.equal(detectSecurityCategory('Roteador Mikrotik hAP ac2'), 'mikrotik');
  assert.equal(detectSecurityCategory('Monitor Gamer LG 27"'), null);
});

test('matches DVR/NVR offers by channel count and resolution', () => {
  const query = 'DVR 16 canais Full HD';
  assert.equal(matchesRequestedModel(query, 'DVR Intelbras MHDX 1116 16 Canais Full HD'), true);
  assert.equal(matchesRequestedModel(query, 'DVR Intelbras MHDX 1108 8 Canais Full HD'), false);
  assert.equal(matchesRequestedModel(query, 'DVR Intelbras MHDX 1116 16 Canais HD'), false);
});

test('rejects offers from a different product category that merely share an attribute value', () => {
  // Achado em teste manual: a busca por "DVR ... 16 canais" na Intelbras também retorna um
  // rádio comunicador de 16 canais — mesmo número, produto completamente diferente.
  assert.equal(matchesRequestedModel('DVR 16 canais', 'Rádio Comunicador com 16 Canais RC 3002 G2 Intelbras'), false);
});

test('matches switch offers requiring PoE when the query asks for it', () => {
  const query = 'Switch 8 portas PoE';
  assert.equal(matchesRequestedModel(query, 'Switch Intelbras 8 Portas PoE Gerenciável'), true);
  assert.equal(matchesRequestedModel(query, 'Switch Intelbras 8 Portas Comum'), false);
});

test('matches cabling offers by exact cable type (CAT5e is not CAT5)', () => {
  const query = 'Cabo CAT5e 305m';
  assert.equal(matchesRequestedModel(query, 'Cabo de Rede CAT5e Furukawa 305m'), true);
  assert.equal(matchesRequestedModel(query, 'Cabo de Rede CAT5 Furukawa 305m'), false);
});

test('matches Mikrotik offers by model code', () => {
  const query = 'Mikrotik hAP ac2';
  assert.equal(matchesRequestedModel(query, 'Roteador Mikrotik hAP ac2 Dual Band'), true);
  assert.equal(matchesRequestedModel(query, 'Roteador Mikrotik RB750Gr3'), false);
});

test('excludes kits/combos and category-specific accessories from a standalone DVR search', () => {
  const query = 'DVR 16 canais';
  assert.equal(isStandaloneProductOffer(query, 'DVR Intelbras MHDX 1116 16 Canais'), true);
  assert.equal(isStandaloneProductOffer(query, 'Kit CFTV Completo DVR 16 Canais + 8 Câmeras'), false);
  assert.equal(isStandaloneProductOffer(query, 'Suporte de Parede para DVR 16 Canais'), false);
});

test('excludes gabinete bundles from a standalone power-supply search', () => {
  const query = 'Fonte 12V 5A';
  assert.equal(isStandaloneProductOffer(query, 'Fonte Intelbras 12V 5A Chaveada'), true);
  assert.equal(isStandaloneProductOffer(query, 'Gabinete CFTV com Fonte 12V 5A'), false);
});

test('extracts DVR/NVR specs directly from the title', () => {
  assert.deepEqual(extractDvrNvrSpecs('DVR Intelbras MHDX 1116 16 Canais Full HD PoE'), { Canais: '16', Resolução: 'Full HD', PoE: 'Sim' });
  assert.equal(extractDvrNvrSpecs('Monitor Gamer LG 27"'), null);
});

test('extracts switch specs directly from the title', () => {
  assert.deepEqual(extractSwitchSpecs('Switch Intelbras 8 Portas PoE Gerenciável Gigabit'), { Portas: '8', PoE: 'Sim', Gerenciável: 'Sim', Velocidade: 'Gigabit' });
});

test('extracts cabling specs, preferring CAT5e over CAT5', () => {
  assert.deepEqual(extractCaboSpecs('Cabo de Rede CAT5e Furukawa 305m'), { Tipo: 'CAT5e', Metragem: '305m' });
});

test('extracts a Mikrotik model code', () => {
  assert.deepEqual(extractMikrotikSpecs('Roteador Mikrotik hAP ac2 Dual Band'), { Modelo: 'HAPAC2' });
});

test('normalizes and orders Serper Shopping offers by price', () => {
  const deals = normalizeSerperShopping([
    { title: 'DVR Intelbras MHDX 1116 16 Canais', source: 'Casas Bahia', link: 'https://www.casasbahia.com.br/a', price: 'R$ 950,00', delivery: 'Frete grátis' },
    { title: 'DVR Intelbras MHDX 1116 16 Canais', source: 'Mercado Livre', link: 'https://produto.mercadolivre.com.br/b', price: 'R$ 899,90', delivery: 'R$ 20,00 de frete' },
  ]);
  assert.equal(deals.length, 2);
  assert.equal(deals[0].store, 'Mercado Livre');
  assert.equal(deals[0].price_estimated, 'R$ 899,90');
});

test('replaces Google-hosted product panel links with a working Shopping search link', () => {
  const deals = normalizeSerperShopping([
    { title: 'Switch Intelbras 8 Portas PoE', source: 'Pichau', price: 'R$ 450,00',
      link: 'https://www.google.com/search?ibp=oshop&q=switch+intelbras&prds=catalogid:123&gl=br&udm=28' },
  ]);
  assert.equal(deals.length, 1);
  assert.doesNotMatch(deals[0].url, /ibp=oshop/);
  assert.match(deals[0].recommendation_reason, /não forneceu um link direto/);
});

test('normalizes SerpApi Shopping offers and replaces Google-hosted product links', () => {
  const deals = normalizeSerpApiShopping([
    { title: 'Mikrotik hAP ac2', source: 'Kalunga', price: 'R$ 550,00', product_link: 'https://www.kalunga.com.br/a' },
  ]);
  assert.equal(deals[0].store, 'Kalunga');
  assert.equal(deals[0].url, 'https://www.kalunga.com.br/a');
});

test('drops price outliers and keeps the cheapest distinct-store deals', () => {
  const offers = [
    { title: 'A', store: 'Loja A', price_estimated: 'R$ 100,00' },
    { title: 'B', store: 'Loja B', price_estimated: 'R$ 250,00' },
    { title: 'C', store: 'Loja C', price_estimated: 'R$ 330,00' },
  ];
  assert.deepEqual(excludePriceOutliers(offers).map((o) => o.store), ['Loja A', 'Loja B']);
  assert.equal(selectTopDistinctStores(offers, 2).length, 2);
});

test('normalizes Intelbras VTEX catalog items, building product URLs and formatting BRL prices', () => {
  const deals = normalizeIntelbrasOffers([
    intelbrasProduct(),
    intelbrasProduct({ productName: 'DVR esgotado', linkText: 'dvr-esgotado', items: [{ sellers: [{ sellerDefault: true, commertialOffer: { Price: 500, IsAvailable: false } }] }] }),
  ]);
  assert.equal(deals.length, 1);
  assert.equal(deals[0].store, 'Intelbras');
  assert.equal(deals[0].price_estimated, 'R$ 899,90');
  assert.equal(deals[0].url, 'https://loja.intelbras.com.br/dvr-mhdx-1116-16-canais/p');
  assert.equal(deals[0].installment_info, '10x de R$ 89,99');
});

test('searches the Intelbras catalog and applies the standard model/standalone filters', async () => {
  const result = await searchIntelbrasShopping('DVR 16 canais', async () => new Response(JSON.stringify([intelbrasProduct()]), { status: 200 }));
  assert.equal(result.exact_found, true);
  assert.equal(result.deals[0].store, 'Intelbras');
});

test('returns a safe fallback when the Intelbras catalog does not respond', async () => {
  const result = await searchIntelbrasShopping('DVR 16 canais', async () => { throw new Error('network down'); });
  assert.equal(result.total_found, 0);
  assert.match(result.summary_insight, /não respondeu/i);
});

test('builds a structured spec sheet from the Intelbras product payload, dropping marketing fields', () => {
  const specs = buildIntelbrasSpecs(intelbrasProduct());
  assert.equal(specs['Fabricante'], 'Intelbras S.a.');
  assert.equal(specs['Modelo do produto'], 'MHDX 1116');
  assert.equal(specs['segmento'], undefined);
  assert.equal(specs['Produto - bloco 1 imagem'], undefined);
});

test('fetches structured Intelbras specs by re-querying the product endpoint from its URL', async () => {
  const result = await fetchIntelbrasProductSpecs('https://loja.intelbras.com.br/dvr-mhdx-1116-16-canais/p', async () => new Response(JSON.stringify([intelbrasProduct()]), { status: 200 }));
  assert.equal(result.specs['Modelo do produto'], 'MHDX 1116');
  assert.equal(result.note, null);
});

test('fetchProductSpecs prefers structured Intelbras data, falls back to title extraction, then admits defeat', async () => {
  const intelbras = await fetchProductSpecs('https://loja.intelbras.com.br/dvr-mhdx-1116-16-canais/p', 'DVR Intelbras MHDX 1116 16 Canais', async () => new Response(JSON.stringify([intelbrasProduct()]), { status: 200 }));
  assert.equal(intelbras.specs['Modelo do produto'], 'MHDX 1116');

  const fallback = await fetchProductSpecs('https://pichau.example/a', 'Switch Intelbras 8 Portas PoE Gerenciável', async () => { throw new Error('should not fetch'); });
  assert.deepEqual(fallback.specs, { Portas: '8', PoE: 'Sim', Gerenciável: 'Sim' });

  const unknown = await fetchProductSpecs('https://pichau.example/b', 'Monitor Gamer LG 27"', async () => { throw new Error('should not fetch'); });
  assert.equal(unknown.specs, null);
  assert.match(unknown.note, /não foi possível identificar/i);
});

test('normalizes Amazon offers, ignoring sponsored results and building canonical product URLs', () => {
  const deals = normalizeAmazonOffers([
    { asin: 'B0C9YPC4ZG', sponsored: false, title: 'Switch TP-Link 8 Portas Gigabit', price: 'R$ 250,00' },
    { asin: 'B0972BP9YR', sponsored: true, title: 'Anúncio patrocinado', price: 'R$ 1,00' },
  ]);
  assert.equal(deals.length, 1);
  assert.equal(deals[0].store, 'Amazon');
});

test('excludes notebooks/kits from a standalone router search on Amazon', async () => {
  const browser = fakeAmazonBrowser([
    { asin: 'A1', sponsored: false, title: 'Roteador TP-Link Archer AX55 Wi-Fi 6', price: 'R$ 450,00' },
    { asin: 'A2', sponsored: false, title: 'Kit Roteador + Repetidor Wi-Fi 6', price: 'R$ 600,00' },
  ]);
  const result = await searchAmazonShopping('Roteador Wi-Fi 6', async () => browser);
  assert.equal(result.deals.length, 1);
  assert.doesNotMatch(result.deals[0].title, /kit/i);
});

test('returns a safe message when the SerpApi key is not configured', async (t) => {
  const previous = process.env.SERPAPI_API_KEY;
  delete process.env.SERPAPI_API_KEY;
  t.after(() => { if (previous !== undefined) process.env.SERPAPI_API_KEY = previous; });

  const result = await searchSerpApiShopping('Switch PoE 8 portas', undefined, async () => { throw new Error('should not fetch without a key'); });
  assert.equal(result.total_found, 0);
  assert.match(result.summary_insight, /não está configurada/);
});

test('reports configured providers on /health, with Intelbras and Amazon always available', async (t) => {
  const previous = process.env.SERPAPI_API_KEY;
  delete process.env.SERPAPI_API_KEY;
  t.after(() => { if (previous !== undefined) process.env.SERPAPI_API_KEY = previous; });

  const server = http.createServer(requestHandler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${baseUrl}/health`);
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.search_providers.intelbras, true);
  assert.equal(result.search_providers.amazon, true);
  assert.equal(result.search_providers.serpapi, false);
  assert.equal(result.search_providers.all, true);
});

test('routes /api/search to Intelbras by default field name, and to a specific provider on request', async (t) => {
  setGoogleShoppingFetcher(async () => new Response(JSON.stringify([intelbrasProduct()]), { status: 200 }));
  t.after(() => setGoogleShoppingFetcher((...args) => fetch(...args)));

  const server = http.createServer(requestHandler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${baseUrl}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_name: 'DVR', brand: 'Intelbras', model: '16 canais', provider: 'intelbras' }),
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.provider, 'intelbras');
  assert.equal(result.deals[0].store, 'Intelbras');
});

test('combines offers from every provider into a single ranked list', async (t) => {
  process.env.SERPER_API_KEY = 'test-key';
  setGoogleShoppingFetcher(async (url) => {
    const target = String(url);
    if (target.includes('loja.intelbras.com.br')) return new Response(JSON.stringify([intelbrasProduct()]), { status: 200 });
    if (target.includes('serper.dev')) {
      return new Response(JSON.stringify({ shopping: [{ title: 'DVR Intelbras MHDX 1116 16 Canais', source: 'Casas Bahia', link: 'https://casasbahia.example/a', price: 'R$ 850,00' }] }), { status: 200 });
    }
    throw new Error(`unexpected fetch target: ${target}`);
  });
  setAmazonBrowserLauncher(async () => fakeAmazonBrowser([{ asin: 'A1', sponsored: false, title: 'DVR Intelbras MHDX 1116 16 Canais', price: 'R$ 920,00' }]));
  t.after(() => {
    delete process.env.SERPER_API_KEY;
    setGoogleShoppingFetcher((...args) => fetch(...args));
    setAmazonBrowserLauncher(async () => { throw new Error('no browser configured in tests'); });
  });

  const result = await searchAllProviders('DVR 16 canais');
  const stores = result.deals.map((deal) => deal.store);
  assert.ok(stores.includes('Intelbras'));
  assert.ok(stores.includes('Casas Bahia'));
  assert.ok(stores.includes('Amazon'));
  assert.equal(result.deals[0].store, 'Casas Bahia');
});

test('POST /api/compare validates the selection size and mixes structured Intelbras specs with title fallbacks', async (t) => {
  setGoogleShoppingFetcher(async () => new Response(JSON.stringify([intelbrasProduct()]), { status: 200 }));
  t.after(() => setGoogleShoppingFetcher((...args) => fetch(...args)));

  const server = http.createServer(requestHandler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const tooFew = await fetch(`${baseUrl}/api/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ url: 'https://a.example/1', title: 'DVR Intelbras MHDX 1116 16 Canais' }] }),
  });
  assert.equal(tooFew.status, 400);

  const response = await fetch(`${baseUrl}/api/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [
      { url: 'https://loja.intelbras.com.br/dvr-mhdx-1116-16-canais/p', title: 'DVR Intelbras MHDX 1116 16 Canais' },
      { url: 'https://pichau.example/a', title: 'Switch Intelbras 8 Portas PoE' },
    ] }),
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].specs['Modelo do produto'], 'MHDX 1116');
  assert.deepEqual(result.results[1].specs, { Portas: '8', PoE: 'Sim' });
});

test('serves the interface and performs a direct search over HTTP', async (t) => {
  setGoogleShoppingFetcher(async () => new Response(JSON.stringify([intelbrasProduct()]), { status: 200 }));
  t.after(() => setGoogleShoppingFetcher((...args) => fetch(...args)));

  const server = http.createServer(requestHandler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);
  const pageHtml = await page.text();
  const scriptSrc = pageHtml.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
  assert.ok(scriptSrc, 'não encontrou o <script> do bundle React em web/dist/index.html');

  const client = await fetch(`${baseUrl}${scriptSrc}`);
  const clientCode = await client.text();
  assert.match(clientCode, /\/api\/search/);

  const response = await fetch(`${baseUrl}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_name: 'DVR', brand: 'Intelbras', model: '16 canais', provider: 'intelbras' }),
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.total_found, 1);
});

test('extracts camera specs, only tagging IP/Analógica when the title is explicit', () => {
  assert.deepEqual(extractCameraSpecs('Câmera IP Intelbras VIP 1230 B Full HD PoE'), { Resolução: 'Full HD', Tipo: 'IP', PoE: 'Sim' });
  assert.deepEqual(extractCameraSpecs('Câmera Multi HD Intelbras 4MP Infravermelho'), { Resolução: '4MP', Tipo: 'Analógica', 'Visão noturna': 'Sim' });
  assert.equal(extractCameraSpecs('Câmera de segurança'), null);
});

test('POST /api/recipe/suggestions expõe severidade critical/optional para o requisito de alimentação (anyOf) da Câmera IP PoE, agora via motor de recursos', async (t) => {
  const server = http.createServer(requestHandler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  // "Switch Intelbras 8 Portas" não bate com nenhuma categoria exata (falta Fast/Giga/PoE no
  // título) — nenhuma opção do requisito "Alimentação" (PoE por capacidade OU Fonte 12V por
  // presença) fica satisfeita, então as duas continuam críticas.
  const response = await fetch(`${baseUrl}/api/recipe/suggestions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ title: 'Switch Intelbras 8 Portas' }, { title: 'Câmera IP PoE Intelbras VIP 1230' }] }),
  });
  const result = await response.json();
  const reqs = result.requirements_by_category['Câmera IP PoE'];
  const powerOptions = reqs.filter((item) => item.label === 'Alimentação');
  assert.equal(powerOptions.length, 2);
  assert.ok(powerOptions.every((item) => item.severity === 'critical'));

  // Switch PoE Fast 8 Portas fornece 8 portas PoE — cobre a demanda de alimentação de 1 câmera
  // (capacidade), então a opção de PoE fica satisfeita e a Fonte 12V (a outra opção do anyOf) vira
  // opcional. A conectividade Gigabit continua crítica à parte: switch Fast não fornece esse recurso.
  const withSwitchPoe = await fetch(`${baseUrl}/api/recipe/suggestions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ title: 'Switch PoE Fast 8 Portas Intelbras' }, { title: 'Câmera IP PoE Intelbras VIP 1230' }] }),
  });
  const result2 = await withSwitchPoe.json();
  const reqs2 = result2.requirements_by_category['Câmera IP PoE'];
  const powerOptions2 = reqs2.filter((item) => item.label === 'Alimentação');
  const poeOption = powerOptions2.find((item) => item.key === 'resource:power.poe_port');
  const fonteOption = powerOptions2.find((item) => item.key === 'presence:Fonte 12V');
  assert.equal(poeOption.severity, null);
  assert.equal(poeOption.satisfied_by, 'ok');
  assert.equal(fonteOption.severity, 'optional');
  const network = reqs2.find((item) => item.key === 'resource:network.gigabit_port');
  assert.equal(network.severity, 'critical');
});

test('POST /api/recipe/suggestions validates the payload and returns missing essentials over HTTP', async (t) => {
  const server = http.createServer(requestHandler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const empty = await fetch(`${baseUrl}/api/recipe/suggestions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [] }),
  });
  assert.equal(empty.status, 400);

  const response = await fetch(`${baseUrl}/api/recipe/suggestions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ title: 'Câmera IP Intelbras VIP 1230' }] }),
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(result.detected_categories, ['Câmera IP']);
  assert.ok(result.missing.some((item) => item.key === 'resource:network.gigabit_port'));
  assert.ok(result.missing.some((item) => item.key === 'presence:Fonte 12V'));
  assert.equal(result.missing.find((item) => item.key === 'presence:Fonte 12V').essential, true);
  // "items" preserva a ordem de entrada com a categoria exata detectada de cada um — o canvas usa
  // isso pra saber de qual nó puxar a aresta.
  assert.deepEqual(result.items, [{ title: 'Câmera IP Intelbras VIP 1230', category: 'Câmera IP' }]);
});

// --- computeCategoryMissingEssentials / detectExactCategory: motor de sugestões cadastrável ---
// Fixture isolada (não depende do Mongo) pra testar as funções puras.

function fixtureCategory(value) {
  return { id: value, group: 'Teste', value, label: value };
}

test('detectExactCategory prefere o value mais longo/específico quando um é prefixo do outro', () => {
  const categories = [fixtureCategory('Câmera IP'), fixtureCategory('Câmera IP PoE')];
  assert.equal(detectExactCategory('Câmera IP PoE Intelbras VIP 3230', categories).value, 'Câmera IP PoE');
  assert.equal(detectExactCategory('Câmera IP Intelbras VIP 1230', categories).value, 'Câmera IP');
  assert.equal(detectExactCategory('Monitor Gamer 27"', categories), null);
});

test('computeCategoryMissingEssentials ignora categorias sem requirements cadastrado (acessórios-folha não viram âncora)', () => {
  const categories = [fixtureCategory('Fonte 12V')];
  const result = computeCategoryMissingEssentials(['Fonte 12V 2A Intelbras'], categories);
  assert.deepEqual(result, { detected_categories: [], missing: [], requirements_by_category: {} });
});

test('computeCategoryMissingEssentials: strings simples continuam funcionando com quantidade 1 (compat com chamadas antigas)', () => {
  const categories = [
    fixtureResourceCategory('Câmera IP', { requirements: [
      { id: 'power', label: 'Fonte 12V', type: 'presence', candidates: ['Fonte 12V'], critical: true },
    ] }),
    fixtureCategory('Fonte 12V'),
  ];
  const result = computeCategoryMissingEssentials(['Câmera IP Intelbras VIP 1230'], categories);
  assert.equal(result.requirements_by_category['Câmera IP'][0].severity, 'critical');
});

// --- Motor de recursos/capacidade (requirements[]/provides[]) ---
// Fixtures isoladas (não dependem do Mongo), cobrindo os cenários do documento de arquitetura
// (arquitetura_motor_regras_capacidade_comprador_inviolavel.txt): ledger global por recurso, soma de
// capacidade entre vários equipamentos, e o caso canônico "16 câmeras cabem, a 17ª não".

function fixtureResourceCategory(value, { provides = [], requirements = [] } = {}) {
  return { id: value, group: 'Teste', value, label: value, provides, requirements };
}

const cameraIpPoeFixture = fixtureResourceCategory('Câmera IP PoE', {
  requirements: [
    { id: 'network', label: 'Conectividade Gigabit', type: 'capacity', resource: 'network.gigabit_port', unitsPerItem: 1, critical: true },
    { id: 'power', label: 'Alimentação', type: 'anyOf', critical: true, options: [
      { type: 'capacity', resource: 'power.poe_port', unitsPerItem: 1 },
      { type: 'presence', candidates: ['Fonte 12V'] },
    ] },
    { id: 'recording', label: 'Gravação (NVR)', type: 'capacity', resource: 'recording.ip_channel', unitsPerItem: 1, critical: true },
  ],
});

function switchPoeGigaFixture(ports) {
  return fixtureResourceCategory(`Switch PoE Giga ${ports} Portas`, {
    provides: [{ resource: 'network.gigabit_port', amount: ports }, { resource: 'power.poe_port', amount: ports }],
  });
}

function nvrFixture(channels) {
  return fixtureResourceCategory(`NVR ${channels} Canais`, { provides: [{ resource: 'recording.ip_channel', amount: channels }] });
}

function switchGigaFixture(ports) {
  return fixtureResourceCategory(`Switch Giga ${ports} Portas`, { provides: [{ resource: 'network.gigabit_port', amount: ports }] });
}

function switchPoeFastFixture(ports) {
  return fixtureResourceCategory(`Switch PoE Fast ${ports} Portas`, { provides: [{ resource: 'power.poe_port', amount: ports }] });
}

test('computeCategoryMissingEssentials (motor de recursos): 16 câmeras IP PoE + switch PoE Giga 16 portas + NVR 16 canais fecha sem déficit', () => {
  const categories = [cameraIpPoeFixture, switchPoeGigaFixture(16), nvrFixture(16)];
  const result = computeCategoryMissingEssentials([
    { title: 'Câmera IP PoE Intelbras VIP 3230', quantity: 16 },
    { title: 'Switch PoE Giga 16 Portas Intelbras', quantity: 1 },
    { title: 'NVR 16 Canais Intelbras', quantity: 1 },
  ], categories);

  const reqs = result.requirements_by_category['Câmera IP PoE'];
  assert.equal(reqs.find((r) => r.key === 'resource:network.gigabit_port').deficit, 0);
  assert.equal(reqs.find((r) => r.key === 'resource:recording.ip_channel').deficit, 0);
  const power = reqs.filter((r) => r.label === 'Alimentação');
  assert.ok(power.some((r) => r.key === 'resource:power.poe_port' && r.severity === null));
  // A opção de alimentação não usada (Fonte 12V) segue aparecendo em `missing` como alternativa
  // opcional — mesmo comportamento do motor antigo pra um par satisfeito por só um dos lados (ver
  // teste "alternativa mútua fica crítica nos dois lados..." acima); nenhum item crítico sobra.
  assert.deepEqual(result.missing.map((item) => item.key), ['presence:Fonte 12V']);
});

test('computeCategoryMissingEssentials (motor de recursos): a 17ª câmera estoura a capacidade do switch de 16 portas e sugere os candidatos maiores', () => {
  const categories = [cameraIpPoeFixture, switchPoeGigaFixture(16), switchPoeGigaFixture(24), nvrFixture(16)];
  const result = computeCategoryMissingEssentials([
    { title: 'Câmera IP PoE Intelbras VIP 3230', quantity: 17 },
    { title: 'Switch PoE Giga 16 Portas Intelbras', quantity: 1 },
    { title: 'NVR 16 Canais Intelbras', quantity: 1 },
  ], categories);

  const network = result.requirements_by_category['Câmera IP PoE'].find((r) => r.key === 'resource:network.gigabit_port');
  assert.equal(network.need, 17);
  assert.equal(network.have, 16);
  assert.equal(network.deficit, 1);
  assert.equal(network.severity, 'critical');
  // Candidatas ordenadas da menor pra maior capacidade que resolveria o déficit — nunca obriga a
  // escolher a menor, só ordena (ver seção 16 do documento de arquitetura).
  assert.deepEqual(network.categories, ['Switch PoE Giga 16 Portas', 'Switch PoE Giga 24 Portas']);

  // A alimentação também estoura (mesmo switch fornece as duas portas) e a gravação também, já que
  // o NVR também ficou pra trás — a mesma câmera extra afeta os três recursos que ela consome.
  const recording = result.requirements_by_category['Câmera IP PoE'].find((r) => r.key === 'resource:recording.ip_channel');
  assert.equal(recording.deficit, 1);
  const power = result.requirements_by_category['Câmera IP PoE'].filter((r) => r.label === 'Alimentação');
  assert.ok(power.every((r) => r.severity === 'critical'));
});

test('computeCategoryMissingEssentials (motor de recursos): prioriza o Switch PoE Giga (resolve conectividade E alimentação) em vez de dois switches de propósito único', () => {
  // Switch Giga (só conectividade, menos portas) e Switch PoE Fast (só alimentação, menos portas)
  // teriam prioridade se a ordenação fosse só por capacidade crescente — o teste prova que o Switch
  // PoE Giga (mais portas, mas resolve os dois déficits de uma vez) vem na frente mesmo assim.
  const categories = [cameraIpPoeFixture, switchGigaFixture(4), switchPoeFastFixture(4), switchPoeGigaFixture(8)];
  const result = computeCategoryMissingEssentials([{ title: 'Câmera IP PoE Intelbras VIP 3230', quantity: 1 }], categories);

  const reqs = result.requirements_by_category['Câmera IP PoE'];
  const network = reqs.find((r) => r.key === 'resource:network.gigabit_port');
  assert.deepEqual(network.categories, ['Switch PoE Giga 8 Portas', 'Switch Giga 4 Portas']);

  const power = reqs.find((r) => r.key === 'resource:power.poe_port');
  assert.deepEqual(power.categories, ['Switch PoE Giga 8 Portas', 'Switch PoE Fast 4 Portas']);
});

test('computeCategoryMissingEssentials (motor de recursos): capacidade soma entre vários equipamentos do mesmo recurso (dois NVRs)', () => {
  const categories = [cameraIpPoeFixture, switchPoeGigaFixture(24), nvrFixture(16), nvrFixture(8)];
  const result = computeCategoryMissingEssentials([
    { title: 'Câmera IP PoE Intelbras VIP 3230', quantity: 22 },
    { title: 'Switch PoE Giga 24 Portas Intelbras', quantity: 1 },
    { title: 'NVR 16 Canais Intelbras', quantity: 1 },
    { title: 'NVR 8 Canais Intelbras', quantity: 1 },
  ], categories);

  const recording = result.requirements_by_category['Câmera IP PoE'].find((r) => r.key === 'resource:recording.ip_channel');
  assert.equal(recording.have, 24); // 16 + 8, um NVR só não bastaria
  assert.equal(recording.deficit, 0);
});

test('POST /api/recipe/prices searches each suggested item and reports its average price', async (t) => {
  setGoogleShoppingFetcher(async () => new Response(JSON.stringify([intelbrasProduct({ productName: 'Switch PoE Intelbras', linkText: 'switch-poe' })]), { status: 200 }));
  t.after(() => setGoogleShoppingFetcher((...args) => fetch(...args)));

  const server = http.createServer(requestHandler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${baseUrl}/api/recipe/prices`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ label: 'Switch PoE', search_term: 'switch poe' }] }),
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.results[0].label, 'Switch PoE');
  assert.equal(result.results[0].average_price, 'R$ 899,90');
});

test('CRUD de /api/products: cadastra, lista por categoria, atualiza e remove um produto', async (t) => {
  const server = http.createServer(requestHandler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const category = `__teste__ DVR 16 Canais ${Date.now()}`;

  const invalid = await fetch(`${baseUrl}/api/products`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category }),
  });
  assert.equal(invalid.status, 400);

  const created = await fetch(`${baseUrl}/api/products`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, brand: 'Intelbras', model: 'DS-7216K1-HQHIMS' }),
  });
  const product = await created.json();
  assert.equal(created.status, 201);
  assert.equal(product.brand, 'Intelbras');

  const listed = await fetch(`${baseUrl}/api/products?category=${encodeURIComponent(category)}`);
  const { products } = await listed.json();
  assert.equal(products.length, 1);
  assert.equal(products[0].model, 'DS-7216K1-HQHIMS');

  const updated = await fetch(`${baseUrl}/api/products/${product.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, brand: 'Hikvision', model: 'DS-7216HQHI-K1' }),
  });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).brand, 'Hikvision');

  const missingUpdate = await fetch(`${baseUrl}/api/products/ffffffffffffffffffffffff`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, brand: 'X', model: 'Y' }),
  });
  assert.equal(missingUpdate.status, 404);

  const deleted = await fetch(`${baseUrl}/api/products/${product.id}`, { method: 'DELETE' });
  assert.equal(deleted.status, 200);
  const afterDelete = await fetch(`${baseUrl}/api/products?category=${encodeURIComponent(category)}`);
  assert.deepEqual((await afterDelete.json()).products, []);
});

test('CRUD de /api/categories: lista a pré-build semeada, cadastra, atualiza e remove uma categoria', async (t) => {
  const server = http.createServer(requestHandler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const label = `__teste__ Categoria ${Date.now()}`;

  const invalid = await fetch(`${baseUrl}/api/categories`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group: 'Teste' }),
  });
  assert.equal(invalid.status, 400);

  const listedBefore = await fetch(`${baseUrl}/api/categories`);
  const { categories: seeded } = await listedBefore.json();
  assert.ok(seeded.some((c) => c.group === 'Câmeras' && c.value === 'Câmera IP PoE'));

  const created = await fetch(`${baseUrl}/api/categories`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group: '__teste__ Grupo', label }),
  });
  const category = await created.json();
  assert.equal(created.status, 201);
  assert.equal(category.group, '__teste__ Grupo');
  assert.equal(category.value, label);

  // "value" (=label) é a chave usada em products.category/requirements.candidates/provides.resource
  // em toda a base — duplicata colidiria nela, então recusa mesmo em outro grupo e mesmo com
  // maiúsculas/minúsculas diferentes (mesma regra de nome duplicado do createGroup).
  const dupSameCase = await fetch(`${baseUrl}/api/categories`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group: '__teste__ Outro Grupo', label }),
  });
  assert.equal(dupSameCase.status, 400);
  assert.match((await dupSameCase.json()).detail, /já existe/i);

  const dupDifferentCase = await fetch(`${baseUrl}/api/categories`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group: '__teste__ Grupo', label: label.toUpperCase() }),
  });
  assert.equal(dupDifferentCase.status, 400);

  const updated = await fetch(`${baseUrl}/api/categories/${category.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group: '__teste__ Grupo 2', label: `${label} editado` }),
  });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).label, `${label} editado`);

  const missingUpdate = await fetch(`${baseUrl}/api/categories/ffffffffffffffffffffffff`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group: 'X', label: 'Y' }),
  });
  assert.equal(missingUpdate.status, 404);

  const deleted = await fetch(`${baseUrl}/api/categories/${category.id}`, { method: 'DELETE' });
  assert.equal(deleted.status, 200);
  const afterDelete = await fetch(`${baseUrl}/api/categories`);
  assert.equal((await afterDelete.json()).categories.some((c) => c.id === category.id), false);
});

test('DELETE /api/categories/:id recusa remover categoria com produto cadastrado, e libera depois que o produto sai', async (t) => {
  const server = http.createServer(requestHandler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const label = `__teste__ Categoria em uso ${Date.now()}`;

  const category = await (await fetch(`${baseUrl}/api/categories`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group: '__teste__ Grupo', label }),
  })).json();

  const product = await (await fetch(`${baseUrl}/api/products`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: label, brand: 'Intelbras', model: 'X' }),
  })).json();

  const blocked = await fetch(`${baseUrl}/api/categories/${category.id}`, { method: 'DELETE' });
  assert.equal(blocked.status, 400);
  assert.match((await blocked.json()).detail, /produto/i);

  await fetch(`${baseUrl}/api/products/${product.id}`, { method: 'DELETE' });

  const allowed = await fetch(`${baseUrl}/api/categories/${category.id}`, { method: 'DELETE' });
  assert.equal(allowed.status, 200);
});

test('DELETE /api/categories/:id recusa remover categoria referenciada como candidata num requirement de outra (presença direta ou dentro de anyOf), e libera depois que a referência sai', async (t) => {
  const server = http.createServer(requestHandler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = Date.now();

  const candidate = await (await fetch(`${baseUrl}/api/categories`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group: '__teste__ Grupo', label: `__teste__ Candidata ${suffix}` }),
  })).json();

  const dependent = await (await fetch(`${baseUrl}/api/categories`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      group: '__teste__ Grupo', label: `__teste__ Dependente ${suffix}`,
      requirements: [
        { id: 'req', label: 'Requisito', type: 'presence', candidates: [candidate.value], critical: false },
      ],
    }),
  })).json();

  const blocked = await fetch(`${baseUrl}/api/categories/${candidate.id}`, { method: 'DELETE' });
  assert.equal(blocked.status, 400);
  assert.match((await blocked.json()).detail, /categoria/i);

  // Também bloqueia quando a referência está dentro de uma opção de anyOf, não só num requisito direto.
  await fetch(`${baseUrl}/api/categories/${dependent.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      group: dependent.group, label: dependent.label,
      requirements: [
        { id: 'req', label: 'Requisito', type: 'anyOf', critical: false, options: [
          { type: 'presence', candidates: [candidate.value] },
          { type: 'capacity', resource: 'network.gigabit_port', unitsPerItem: 1 },
        ] },
      ],
    }),
  });
  const stillBlocked = await fetch(`${baseUrl}/api/categories/${candidate.id}`, { method: 'DELETE' });
  assert.equal(stillBlocked.status, 400);

  await fetch(`${baseUrl}/api/categories/${dependent.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group: dependent.group, label: dependent.label, requirements: [] }),
  });

  const allowed = await fetch(`${baseUrl}/api/categories/${candidate.id}`, { method: 'DELETE' });
  assert.equal(allowed.status, 200);

  await fetch(`${baseUrl}/api/categories/${dependent.id}`, { method: 'DELETE' });
});

test('CRUD de /api/groups: lista, cadastra, recusa nome duplicado e bloqueia exclusão enquanto uma categoria usar o grupo', async (t) => {
  const server = http.createServer(requestHandler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const name = `__teste__ Grupo ${Date.now()}`;

  const listedBefore = await fetch(`${baseUrl}/api/groups`);
  assert.equal(listedBefore.status, 200);
  assert.ok((await listedBefore.json()).groups.some((g) => g.name === 'Câmeras'));

  const created = await fetch(`${baseUrl}/api/groups`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  });
  const group = await created.json();
  assert.equal(created.status, 201);
  assert.equal(group.name, name);

  const duplicate = await fetch(`${baseUrl}/api/groups`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.toLowerCase() }),
  });
  assert.equal(duplicate.status, 400);

  const category = await (await fetch(`${baseUrl}/api/categories`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group: name, label: `__teste__ Categoria do grupo ${Date.now()}` }),
  })).json();

  const blocked = await fetch(`${baseUrl}/api/groups/${group.id}`, { method: 'DELETE' });
  assert.equal(blocked.status, 400);
  assert.match((await blocked.json()).detail, /categoria/i);

  await fetch(`${baseUrl}/api/categories/${category.id}`, { method: 'DELETE' });

  const allowed = await fetch(`${baseUrl}/api/groups/${group.id}`, { method: 'DELETE' });
  assert.equal(allowed.status, 200);
});

test('CRUD de /api/resources: lista os 4 recursos semeados, cadastra, recusa chave duplicada/inválida, edita o nome e bloqueia exclusão enquanto uma categoria usar o recurso', async (t) => {
  const server = http.createServer(requestHandler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = Date.now();
  const key = `teste.recurso_${suffix}`;

  const listedBefore = await fetch(`${baseUrl}/api/resources`);
  assert.equal(listedBefore.status, 200);
  assert.ok((await listedBefore.json()).resources.some((r) => r.key === 'network.gigabit_port'));

  const invalidKey = await fetch(`${baseUrl}/api/resources`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'Chave Inválida!!', label: 'x' }),
  });
  assert.equal(invalidKey.status, 400);

  const created = await fetch(`${baseUrl}/api/resources`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, label: 'Recurso de teste' }),
  });
  const resource = await created.json();
  assert.equal(created.status, 201);
  assert.equal(resource.key, key);

  const duplicate = await fetch(`${baseUrl}/api/resources`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, label: 'outro' }),
  });
  assert.equal(duplicate.status, 400);

  const updated = await fetch(`${baseUrl}/api/resources/${resource.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'Recurso de teste (editado)' }),
  });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).label, 'Recurso de teste (editado)');

  const category = await (await fetch(`${baseUrl}/api/categories`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      group: '__teste__ Grupo', label: `__teste__ Categoria com recurso ${suffix}`,
      provides: [{ resource: key, amount: 1 }],
    }),
  })).json();

  const blocked = await fetch(`${baseUrl}/api/resources/${resource.id}`, { method: 'DELETE' });
  assert.equal(blocked.status, 400);
  assert.match((await blocked.json()).detail, /categoria/i);

  await fetch(`${baseUrl}/api/categories/${category.id}`, { method: 'DELETE' });

  const allowed = await fetch(`${baseUrl}/api/resources/${resource.id}`, { method: 'DELETE' });
  assert.equal(allowed.status, 200);
});

