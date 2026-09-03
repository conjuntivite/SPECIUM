const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  buildGoogleShoppingUrl,
  buildIntelbrasSpecs,
  computeMissingEssentials,
  detectRecipeCategory,
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
} = require('../server');

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

  const client = await fetch(`${baseUrl}/static/app.js`);
  const clientCode = await client.text();
  assert.match(clientCode, /fetch\('\/api\/search'/);

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

test('detectRecipeCategory defaults an unqualified camera query to analógica, the cheaper/more common baseline', () => {
  assert.equal(detectRecipeCategory('Câmera IP Intelbras VIP 1230'), 'camera_ip');
  assert.equal(detectRecipeCategory('Câmera Intelbras Multi HD'), 'camera_analogica');
  assert.equal(detectRecipeCategory('Câmera de segurança'), 'camera_analogica');
  assert.equal(detectRecipeCategory('DVR Intelbras 16 canais'), 'dvr_nvr');
  assert.equal(detectRecipeCategory('Monitor Gamer LG 27"'), null);
});

test('computeMissingEssentials suggests the full IP-camera kit when only the camera is in the budget', () => {
  const { detected_categories, missing } = computeMissingEssentials(['Câmera IP Intelbras VIP 1230']);
  assert.deepEqual(detected_categories, ['camera_ip']);
  assert.deepEqual(missing.map((item) => item.key).sort(), ['cabo_rede', 'caixa_steck', 'canaleta', 'gravacao', 'switch_poe']);
});

test('computeMissingEssentials clears a requirement once a matching item is added to the budget', () => {
  // O switch adicionado também é uma âncora própria (categoria "switch"), então traz sua própria
  // sugestão de rack (não essencial) — cabo_rede já está coberto pelo cabo já no orçamento.
  const { missing } = computeMissingEssentials(['Câmera IP Intelbras VIP 1230', 'Switch Intelbras 8 Portas PoE', 'Cabo de Rede CAT5e 305m']);
  assert.deepEqual(missing.map((item) => item.key).sort(), ['caixa_steck', 'canaleta', 'gravacao', 'rack']);
  assert.equal(missing.find((item) => item.key === 'rack').essential, false);
});

test('computeMissingEssentials treats a memory card as satisfying the recording requirement, no NVR needed', () => {
  const { missing } = computeMissingEssentials(['Câmera IP Intelbras VIP 1230', 'Cartão de Memória 128GB']);
  assert.ok(!missing.some((item) => item.key === 'gravacao'));
});

test('computeMissingEssentials merges requirements from multiple anchors and dedupes shared ones', () => {
  const { detected_categories, missing } = computeMissingEssentials(['Câmera Intelbras Multi HD', 'DVR Intelbras 16 canais']);
  assert.deepEqual(detected_categories.sort(), ['camera_analogica', 'dvr_nvr']);
  // "fonte_12v" e "cabo_coaxial" são exigidos tanto pela câmera quanto pelo DVR — deve aparecer uma vez só.
  assert.equal(missing.filter((item) => item.key === 'fonte_12v').length, 1);
  assert.equal(missing.filter((item) => item.key === 'cabo_coaxial').length, 1);
  // O DVR pede "câmeras compatíveis", mas já há uma câmera no orçamento — requisito satisfeito, não aparece.
  assert.ok(!missing.some((item) => item.key === 'cameras'));
});

test('computeMissingEssentials returns no suggestions for items without a known recipe', () => {
  const expected = { detected_categories: [], missing: [], requirements_by_category: {} };
  assert.deepEqual(computeMissingEssentials(['Monitor Gamer LG 27"']), expected);
  assert.deepEqual(computeMissingEssentials([]), expected);
});

test('computeMissingEssentials exposes requirements_by_category with satisfied_by, for the flow canvas to draw edges', () => {
  const { requirements_by_category } = computeMissingEssentials(['Câmera IP Intelbras VIP 1230', 'Switch Intelbras 8 Portas PoE']);
  const switchReq = requirements_by_category.camera_ip.find((item) => item.key === 'switch_poe');
  assert.equal(switchReq.satisfied_by, 'Switch Intelbras 8 Portas PoE');
  const caboReq = requirements_by_category.camera_ip.find((item) => item.key === 'cabo_rede');
  assert.equal(caboReq.satisfied_by, null);
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
  assert.deepEqual(result.detected_categories, ['camera_ip']);
  assert.ok(result.missing.some((item) => item.key === 'switch_poe'));
  // "items" preserva a ordem de entrada com a categoria detectada de cada um — o canvas usa isso
  // pra saber de qual nó puxar a aresta.
  assert.deepEqual(result.items, [{ title: 'Câmera IP Intelbras VIP 1230', category: 'camera_ip' }]);
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
