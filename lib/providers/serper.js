const { normalize } = require('../text');
const { isStandaloneProductOffer } = require('../specs');
const { priceValue, buildGoogleShoppingUrl, isGoogleHostedLink, buildShoppingResponse } = require('./shared');
const { getShoppingFetcher } = require('./shoppingFetcher');

function normalizeSerperShopping(shopping) {
  if (!Array.isArray(shopping)) return [];
  const seen = new Set();
  return shopping.map((offer) => {
    const title = normalize(offer?.title);
    const store = normalize(offer?.source) || 'Google Shopping';
    const price_estimated = normalize(offer?.price);
    const rawUrl = normalize(offer?.link);
    if (!title || !price_estimated || !/^https:\/\//i.test(rawUrl)) return null;
    const isDirectStoreLink = !isGoogleHostedLink(rawUrl);
    const url = isDirectStoreLink ? rawUrl : buildGoogleShoppingUrl(`${title} ${store}`.trim());
    if (seen.has(url)) return null;
    seen.add(url);
    const delivery = normalize(offer?.delivery);
    return {
      title,
      store,
      price_estimated,
      url,
      installment_info: null,
      snippet: delivery ? `Oferta encontrada no Google Shopping. ${delivery}.` : 'Oferta encontrada no Google Shopping.',
      recommendation_reason: isDirectStoreLink
        ? 'Preço retornado pelo Google Shopping via Serper; confirme estoque e frete na loja.'
        : 'O Google não forneceu um link direto da loja para esta oferta; o link abre a busca deste produto no Google Shopping.',
      is_used: /\busado\b/i.test(`${title} ${offer?.condition || ''}`),
    };
  }).filter(Boolean).sort((first, second) => priceValue(first.price_estimated) - priceValue(second.price_estimated));
}

async function searchSerperShopping(query, apiKey = process.env.SERPER_API_KEY, fetchImpl = getShoppingFetcher()) {
  const shopping_url = buildGoogleShoppingUrl(query);
  if (!apiKey) return { query, total_found: 0, deals: [], similar_deals: [], exact_found: false, shopping_url, summary_insight: 'A chave do Serper não está configurada no servidor.' };
  try {
    const response = await fetchImpl('https://google.serper.dev/shopping', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'br', hl: 'pt-br', num: 40 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Serper respondeu HTTP ${response.status}`);
    const payload = await response.json();
    const standaloneOffers = normalizeSerperShopping(payload.shopping).filter((offer) => isStandaloneProductOffer(query, offer.title));
    return buildShoppingResponse(query, shopping_url, standaloneOffers);
  } catch {
    return { query, total_found: 0, deals: [], similar_deals: [], exact_found: false, shopping_url, summary_insight: 'O Serper não respondeu à consulta automática. Abra a busca abaixo para conferir diretamente.' };
  }
}

module.exports = { normalizeSerperShopping, searchSerperShopping };
