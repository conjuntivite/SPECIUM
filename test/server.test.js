const test = require('node:test');
const { after } = test;
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildGoogleShoppingUrl,
  buildIntelbrasSpecs,
  computeMissingEssentials,
  detectOverlayCategories,
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

test('detectRecipeCategory defaults an unqualified camera query to analógica, the cheaper/more common baseline', () => {
  assert.equal(detectRecipeCategory('Câmera IP Intelbras VIP 1230'), 'camera_ip');
  assert.equal(detectRecipeCategory('Câmera IP Intelbras VIP 1230 PoE'), 'camera_ip_poe');
  assert.equal(detectRecipeCategory('Câmera Intelbras Multi HD'), 'camera_analogica');
  assert.equal(detectRecipeCategory('Câmera de segurança'), 'camera_analogica');
  assert.equal(detectRecipeCategory('DVR Intelbras 16 canais'), 'dvr');
  assert.equal(detectRecipeCategory('NVR Intelbras 16 canais'), 'nvr');
  assert.equal(detectRecipeCategory('Gravador Intelbras 16 canais'), 'dvr');
  assert.equal(detectRecipeCategory('Monitor Gamer LG 27"'), null);
});

test('detectOverlayCategories adds camera_acusense on top of the base camera category, never standalone', () => {
  assert.deepEqual(detectOverlayCategories('Câmera IP AcuSense Intelbras', 'camera_ip'), ['camera_acusense']);
  assert.deepEqual(detectOverlayCategories('Câmera Multi HD AcuSense', 'camera_analogica'), ['camera_acusense']);
  assert.deepEqual(detectOverlayCategories('Câmera IP Intelbras VIP 1230', 'camera_ip'), []);
  // "acusense" só vale como overlay de câmera — um DVR AcuSense não é regrado por essa exceção.
  assert.deepEqual(detectOverlayCategories('DVR AcuSense Intelbras', 'dvr'), []);
});

test('computeMissingEssentials suggests the full IP-camera kit when only the camera is in the budget, non-PoE by default needs its own fonte 12V', () => {
  const { detected_categories, missing } = computeMissingEssentials(['Câmera IP Intelbras VIP 1230']);
  assert.deepEqual(detected_categories, ['camera_ip']);
  assert.deepEqual(missing.map((item) => item.key).sort(), [
    'abracadeira', 'adaptador', 'cabo_rede', 'caixa_passagem', 'caixa_steck', 'canaleta', 'corrugado', 'cotovelo', 'eletroduto', 'fonte_12v', 'nvr', 'switch_giga',
  ].sort());
  // Kit de acabamento: 7 caixas separadas, todas recomendadas (não essenciais) — não uma sugestão combinada.
  for (const key of ['canaleta', 'corrugado', 'caixa_passagem', 'cotovelo', 'abracadeira', 'eletroduto', 'adaptador']) {
    assert.equal(missing.find((item) => item.key === key).essential, false);
  }
});

test('computeMissingEssentials marks fonte 12V as critical (red) for a plain, non-PoE camera IP — it has no PoE-switch alternative, unlike the PoE variant', () => {
  const { requirements_by_category } = computeMissingEssentials(['Câmera IP Intelbras VIP 1230']);
  const fonteReq = requirements_by_category.camera_ip.find((item) => item.key === 'fonte_12v');
  assert.equal(fonteReq.severity, 'critical');
  const switchReq = requirements_by_category.camera_ip.find((item) => item.key === 'switch_poe');
  assert.equal(switchReq, undefined);

  const { requirements_by_category: withFonte } = computeMissingEssentials(['Câmera IP Intelbras VIP 1230', 'Fonte 12V 2A']);
  assert.equal(withFonte.camera_ip.find((item) => item.key === 'fonte_12v').severity, undefined);
});

test('computeMissingEssentials marks HD as the critical (red), first-listed suggestion for a DVR or NVR — without it the gravador não grava', () => {
  const { requirements_by_category } = computeMissingEssentials(['DVR Intelbras 16 canais']);
  assert.equal(requirements_by_category.dvr[0].key, 'hd_interno');
  assert.equal(requirements_by_category.dvr[0].severity, 'critical');

  const { requirements_by_category: withHd } = computeMissingEssentials(['DVR Intelbras 16 canais', 'HD para DVR 1TB']);
  assert.equal(withHd.dvr.find((item) => item.key === 'hd_interno').severity, undefined);

  const { requirements_by_category: nvrReqs } = computeMissingEssentials(['NVR Intelbras 16 canais']);
  assert.equal(nvrReqs.nvr[0].key, 'hd_interno');
  assert.equal(nvrReqs.nvr[0].severity, 'critical');
});

test('computeMissingEssentials pairs DVR with coax/analog-camera suggestions and NVR with network-cable/IP-camera suggestions', () => {
  const { requirements_by_category: dvrReqs } = computeMissingEssentials(['DVR Intelbras 16 canais']);
  assert.ok(dvrReqs.dvr.some((item) => item.key === 'cabo_coaxial'));
  assert.ok(!dvrReqs.dvr.some((item) => item.key === 'cabo_rede'));

  const { requirements_by_category: nvrReqs } = computeMissingEssentials(['NVR Intelbras 16 canais']);
  assert.ok(nvrReqs.nvr.some((item) => item.key === 'cabo_rede'));
  assert.ok(!nvrReqs.nvr.some((item) => item.key === 'cabo_coaxial'));
});

test('computeMissingEssentials: HD keeps being suggested for a DVR/NVR regardless of order — regression for a camera with "HD" in its title (resolution, not storage) falsely satisfying it', () => {
  // "Multi HD"/"Full HD" é resolução de câmera, não HD de armazenamento — antes desse fix, ter uma
  // dessas câmeras no orçamento ANTES do DVR fazia o hd_interno já aparecer "satisfeito".
  const { requirements_by_category: cameraFirst } = computeMissingEssentials(['Câmera Intelbras Multi HD', 'DVR Intelbras 16 canais']);
  assert.equal(cameraFirst.dvr.find((item) => item.key === 'hd_interno').satisfied_by, null);

  const { requirements_by_category: dvrFirst } = computeMissingEssentials(['DVR Intelbras 16 canais', 'Câmera Intelbras Multi HD']);
  assert.equal(dvrFirst.dvr.find((item) => item.key === 'hd_interno').satisfied_by, null);

  // Um HD de verdade (com capacidade, ou "HD interno") continua satisfazendo normalmente.
  const { requirements_by_category: withRealHd } = computeMissingEssentials(['DVR Intelbras 16 canais', 'HD Interno (armazenamento)']);
  assert.equal(withRealHd.dvr.find((item) => item.key === 'hd_interno').satisfied_by, 'HD Interno (armazenamento)');
  const { requirements_by_category: withCapacityHd } = computeMissingEssentials(['DVR Intelbras 16 canais', 'HD Seagate Purple 1TB']);
  assert.equal(withCapacityHd.dvr.find((item) => item.key === 'hd_interno').satisfied_by, 'HD Seagate Purple 1TB');
});

test('computeMissingEssentials matches each finishing-kit item by its singular form (regression: "Adaptador" alone, not just "Adaptadores")', () => {
  const { missing } = computeMissingEssentials([
    'Câmera IP Intelbras VIP 1230', 'Canaleta', 'Cano Corrugado', 'Caixa de Passagem', 'Cotovelo', 'Abraçadeira', 'Eletroduto', 'Adaptador',
  ]);
  for (const key of ['canaleta', 'corrugado', 'caixa_passagem', 'cotovelo', 'abracadeira', 'eletroduto', 'adaptador']) {
    assert.ok(!missing.some((item) => item.key === key), `${key} deveria estar satisfeito`);
  }
});

test('computeMissingEssentials shows both PoE-camera power options as critical until one is chosen, then flips the other to optional', () => {
  const { detected_categories, requirements_by_category: neither } = computeMissingEssentials(['Câmera IP PoE Intelbras VIP 1230']);
  assert.deepEqual(detected_categories, ['camera_ip_poe']);
  const altsNeither = neither.camera_ip_poe.filter((item) => item.key === 'switch_poe' || item.key === 'fonte_poe_alt');
  assert.equal(altsNeither.length, 2);
  assert.ok(altsNeither.every((item) => item.severity === 'critical' && !item.satisfied_by));

  const { requirements_by_category: withFonte } = computeMissingEssentials(['Câmera IP PoE Intelbras VIP 1230', 'Fonte 12V 2A']);
  const fonteAlt = withFonte.camera_ip_poe.find((item) => item.key === 'fonte_poe_alt');
  const switchAlt = withFonte.camera_ip_poe.find((item) => item.key === 'switch_poe');
  assert.equal(fonteAlt.satisfied_by, 'Fonte 12V 2A');
  assert.equal(fonteAlt.severity, null);
  assert.equal(switchAlt.satisfied_by, null);
  assert.equal(switchAlt.severity, 'optional');

  const { requirements_by_category: withSwitchPoe } = computeMissingEssentials(['Câmera IP PoE Intelbras VIP 1230', 'Switch Intelbras 8 Portas PoE']);
  const switchAlt2 = withSwitchPoe.camera_ip_poe.find((item) => item.key === 'switch_poe');
  const fonteAlt2 = withSwitchPoe.camera_ip_poe.find((item) => item.key === 'fonte_poe_alt');
  assert.equal(switchAlt2.satisfied_by, 'Switch Intelbras 8 Portas PoE');
  assert.equal(fonteAlt2.severity, 'optional');
});

test('computeMissingEssentials requires a central de alarme for an AcuSense camera, on top of the normal camera kit', () => {
  const { detected_categories, missing } = computeMissingEssentials(['Câmera IP AcuSense Intelbras VIP 1230']);
  assert.deepEqual(detected_categories.sort(), ['camera_acusense', 'camera_ip']);
  assert.ok(missing.some((item) => item.key === 'central_alarme'));
  const { missing: withCentral } = computeMissingEssentials(['Câmera IP AcuSense Intelbras VIP 1230', 'Central de Alarme Intelbras']);
  assert.ok(!withCentral.some((item) => item.key === 'central_alarme'));
});

test('computeMissingEssentials requires baluns for an analog camera, alongside coax/BNC/fonte/DVR', () => {
  const { missing } = computeMissingEssentials(['Câmera Intelbras Multi HD']);
  assert.deepEqual(missing.map((item) => item.key).sort(), [
    'abracadeira', 'adaptador', 'baluns', 'cabo_coaxial', 'caixa_passagem', 'caixa_steck', 'canaleta', 'conectores_bnc_p4', 'corrugado', 'cotovelo', 'dvr', 'eletroduto', 'fonte_12v',
  ].sort());
});

test('POST /api/recipe/suggestions exposes the same critical/optional severity over HTTP', async (t) => {
  const server = http.createServer(requestHandler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${baseUrl}/api/recipe/suggestions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ title: 'Switch Intelbras 8 Portas' }, { title: 'Câmera IP PoE Intelbras VIP 1230' }] }),
  });
  const result = await response.json();
  const alts = result.requirements_by_category.camera_ip_poe.filter((item) => item.key === 'switch_poe' || item.key === 'fonte_poe_alt');
  assert.equal(alts.length, 2);
  assert.ok(alts.every((item) => item.severity === 'critical'));
});

test('computeMissingEssentials clears a requirement once a matching item is added to the budget', () => {
  // O switch adicionado também é uma âncora própria (categoria "switch"), então traz sua própria
  // sugestão de rack (não essencial) — cabo_rede e switch_giga já estão cobertos pelo switch PoE giga
  // adicionado ao orçamento.
  const { missing } = computeMissingEssentials(['Câmera IP Intelbras VIP 1230', 'Switch Intelbras 8 Portas PoE Gigabit', 'Cabo de Rede CAT5e 305m']);
  assert.deepEqual(missing.map((item) => item.key).sort(), [
    'abracadeira', 'adaptador', 'caixa_passagem', 'caixa_steck', 'canaleta', 'corrugado', 'cotovelo', 'eletroduto', 'fonte_12v', 'nvr', 'rack',
  ].sort());
  assert.equal(missing.find((item) => item.key === 'rack').essential, false);
  assert.equal(missing.find((item) => item.key === 'canaleta').essential, false);
});

test('computeMissingEssentials: a memory card does NOT satisfy the recording need for a plain camera — only NVR does, cartão is AcuSense-only', () => {
  const { missing } = computeMissingEssentials(['Câmera IP Intelbras VIP 1230', 'Cartão de Memória 128GB']);
  assert.ok(missing.some((item) => item.key === 'nvr'));
});

test('computeMissingEssentials shows "Cartão de Memória" as a recording option only for an AcuSense camera, not for a plain IP camera', () => {
  const { requirements_by_category: plain } = computeMissingEssentials(['Câmera IP Intelbras VIP 1230']);
  assert.ok(!plain.camera_ip.some((item) => item.key === 'cartao_memoria'));

  const { detected_categories, requirements_by_category: acusense } = computeMissingEssentials(['Câmera IP AcuSense Intelbras VIP 1230']);
  assert.ok(detected_categories.includes('camera_acusense'));
  const cartaoReq = acusense.camera_acusense.find((item) => item.key === 'cartao_memoria');
  const nvrReq = acusense.camera_acusense.find((item) => item.key === 'nvr');
  assert.equal(cartaoReq.severity, 'critical');
  assert.equal(nvrReq.severity, 'critical');

  // Cartão de memória sozinho já resolve a gravação pra AcuSense — NVR vira só alternativa opcional,
  // não crítica (mesmo padrão de severidade usado pro par switch PoE / fonte 12V).
  const { requirements_by_category: withCartao } = computeMissingEssentials(['Câmera IP AcuSense Intelbras VIP 1230', 'Cartão de Memória 128GB']);
  const cartaoAfter = withCartao.camera_acusense.find((item) => item.key === 'cartao_memoria');
  const nvrAfter = withCartao.camera_acusense.find((item) => item.key === 'nvr');
  assert.equal(cartaoAfter.satisfied_by, 'Cartão de Memória 128GB');
  assert.equal(nvrAfter.satisfied_by, null);
  assert.equal(nvrAfter.severity, 'optional');
  // A câmera IP base não repete um "NVR obrigatório" avulso quando o overlay AcuSense já cobre isso.
  assert.ok(!withCartao.camera_ip.some((item) => item.key === 'nvr'));
});

test('computeMissingEssentials merges requirements from multiple anchors and dedupes shared ones', () => {
  const { detected_categories, missing } = computeMissingEssentials(['Câmera Intelbras Multi HD', 'DVR Intelbras 16 canais']);
  assert.deepEqual(detected_categories.sort(), ['camera_analogica', 'dvr']);
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
  const { requirements_by_category } = computeMissingEssentials(['Câmera IP Intelbras VIP 1230', 'Switch Intelbras 8 Portas PoE Gigabit']);
  const switchReq = requirements_by_category.camera_ip.find((item) => item.key === 'switch_giga');
  assert.equal(switchReq.satisfied_by, 'Switch Intelbras 8 Portas PoE Gigabit');
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
  assert.ok(result.missing.some((item) => item.key === 'switch_giga'));
  assert.ok(result.missing.some((item) => item.key === 'fonte_12v'));
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

// --- Rotina: itens do orçamento em combinações aleatórias ---
// Regra pedida pelo usuário: um acessório sozinho (ex.: Fonte 12V) nunca obriga a adicionar mais nada;
// um item-âncora sozinho (ex.: qualquer câmera, DVR/NVR, switch, facial, porteiro, Mikrotik, roteador)
// sempre obriga pelo menos uma sugestão. Catálogo abaixo é o mesmo de web/src/data/catalog.json.
// PRNG determinístico (não Math.random) pra rodar sempre igual entre execuções.
const SWITCH_PORT_COUNTS = ['4', '8', '16', '24'];
const SWITCH_VARIANTS = ['Switch Fast', 'Switch Giga', 'Switch PoE Fast', 'Switch PoE Giga'];
const SWITCH_ITEMS = SWITCH_VARIANTS.flatMap((variant) => SWITCH_PORT_COUNTS.map((ports) => `${variant} ${ports} Portas`));
const DVR_NVR_CHANNEL_COUNTS = ['4', '8', '16', '24', '32', '48', '64'];
const DVR_ITEMS = DVR_NVR_CHANNEL_COUNTS.map((channels) => `DVR ${channels} Canais`);
const NVR_ITEMS = DVR_NVR_CHANNEL_COUNTS.map((channels) => `NVR ${channels} Canais`);
const ANCHOR_ITEMS = [
  'Câmera IP PoE', 'Câmera IP', 'Câmera Analógica',
  'Câmera AcuSense IP PoE', 'Câmera AcuSense IP', 'Câmera AcuSense Analógica',
  ...DVR_ITEMS, ...NVR_ITEMS, ...SWITCH_ITEMS, 'Mikrotik', 'Roteador Wi-Fi',
  'Terminal Facial', 'Vídeo Porteiro',
];
const ACCESSORY_ITEMS = [
  'HD Interno (armazenamento)', 'Cartão de Memória', 'Cabo de Rede CAT6', 'Cabo Coaxial CFTV', 'Baluns',
  'Conector BNC/P4', 'Rack', 'Fonte 12V', 'Nobreak', 'Fechadura Elétrica', 'Central de Alarme',
  'Caixa Steck', 'Canaleta', 'Cano Corrugado', 'Caixa de Passagem', 'Cotovelo', 'Abraçadeira',
  'Eletroduto', 'Adaptador',
];
const CATALOG = [...ANCHOR_ITEMS, ...ACCESSORY_ITEMS];

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomSubset(items, rng, size) {
  const pool = [...items];
  const picked = [];
  for (let i = 0; i < size && pool.length; i++) picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return picked;
}

test('rotina: cada item-âncora sozinho (câmeras, DVR/NVR, switch, facial, porteiro, Mikrotik, roteador) força pelo menos uma sugestão', () => {
  for (const anchorTitle of ANCHOR_ITEMS) {
    const { detected_categories, missing } = computeMissingEssentials([anchorTitle]);
    assert.ok(detected_categories.length > 0, `"${anchorTitle}" deveria ser detectado como âncora`);
    assert.ok(missing.length > 0, `"${anchorTitle}" sozinho deveria gerar pelo menos uma sugestão`);
  }
});

test('rotina: cada acessório sozinho (fonte, cabo, baluns, kit de acabamento etc.) não força nada — nem câmera, nem qualquer outro item', () => {
  for (const accessoryTitle of ACCESSORY_ITEMS) {
    const { detected_categories, missing } = computeMissingEssentials([accessoryTitle]);
    assert.deepEqual(detected_categories, [], `"${accessoryTitle}" sozinho não deveria ancorar categoria nenhuma`);
    assert.deepEqual(missing, [], `"${accessoryTitle}" sozinho não deveria gerar sugestão nenhuma`);
  }
});

test('rotina: 50 combinações aleatórias só de acessórios (sem âncora) continuam sem exigir nada', () => {
  const rng = seededRandom(20260903);
  for (let i = 0; i < 50; i++) {
    const combo = randomSubset(ACCESSORY_ITEMS, rng, 1 + Math.floor(rng() * ACCESSORY_ITEMS.length));
    const { detected_categories, missing } = computeMissingEssentials(combo);
    assert.deepEqual(detected_categories, [], `combinação só de acessórios não deveria ancorar: ${combo.join(', ')}`);
    assert.deepEqual(missing, [], `combinação só de acessórios não deveria sugerir nada: ${combo.join(', ')}`);
  }
});

test('rotina: 200 orçamentos aleatórios (âncoras + acessórios misturados) nunca quebram e nunca ficam inconsistentes', () => {
  const rng = seededRandom(42);
  for (let i = 0; i < 200; i++) {
    const combo = randomSubset(CATALOG, rng, 1 + Math.floor(rng() * 8));
    const { detected_categories, missing, requirements_by_category } = computeMissingEssentials(combo);

    // Toda categoria com sugestões precisa estar em detected_categories, e vice-versa.
    assert.deepEqual(Object.keys(requirements_by_category).sort(), [...detected_categories].sort(), combo.join(', '));

    for (const category of Object.keys(requirements_by_category)) {
      for (const req of requirements_by_category[category]) {
        // Coerência: se o requisito diz que algo do carrinho o satisfez, esse item precisa realmente
        // estar no carrinho (não pode ser inventado).
        if (req.satisfied_by) assert.ok(combo.includes(req.satisfied_by), `satisfied_by "${req.satisfied_by}" não está no carrinho: ${combo.join(', ')}`);
        assert.ok(req.key && req.label && req.search_term, `requisito malformado em "${category}": ${JSON.stringify(req)}`);
      }
    }

    // Combinação sem nenhum item-âncora nunca deveria ter categoria detectada nem sugestão.
    if (!combo.some((title) => ANCHOR_ITEMS.includes(title))) {
      assert.deepEqual(detected_categories, [], `sem âncora não deveria detectar categoria: ${combo.join(', ')}`);
      assert.deepEqual(missing, [], `sem âncora não deveria sugerir nada: ${combo.join(', ')}`);
    }
  }
});

// O comercial só consegue lançar no orçamento o que existe no catálogo do front (web/src/data/catalog.json)
// — não tem mais caixa de texto livre (ver ajuste anterior). Por isso a rotina acima só faz sentido
// validando exatamente esse catálogo: se ele muda e ninguém atualiza ANCHOR_ITEMS/ACCESSORY_ITEMS
// aqui, esse teste falha e avisa, em vez de deixar a rotina de aleatórios validar (ou deixar de
// validar) um item fantasma.
test('rotina: o catálogo em web/src/data/catalog.json é exatamente o mesmo catálogo coberto por esta rotina de testes', () => {
  const catalogPath = path.join(__dirname, '..', 'web', 'src', 'data', 'catalog.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const valuesInCatalog = catalog.flatMap((group) => group.items.map((item) => item.value));
  assert.deepEqual(valuesInCatalog.sort(), [...CATALOG].sort());
});
