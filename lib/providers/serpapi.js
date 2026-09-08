const { normalize } = require('../text');
const { isStandaloneProductOffer } = require('../specs');
const { priceValue, buildGoogleShoppingUrl, isGoogleHostedLink, buildShoppingResponse } = require('./shared');
const { getShoppingFetcher } = require('./shoppingFetcher');

function normalizeSerpApiShopping(shoppingResults) {
  if (!Array.isArray(shoppingResults)) return [];
  const seen = new Set();
  return shoppingResults.map((offer) => {
    const title = normalize(offer?.title);
    const store = normalize(offer?.source) || 'Google Shopping';
    const price_estimated = normalize(offer?.price);
    const rawUrl = normalize(offer?.product_link);
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
      installment_info: normalize(offer?.installment?.price) || null,
      snippet: delivery ? `Oferta encontrada no Google Shopping via SerpApi. ${delivery}.` : 'Oferta encontrada no Google Shopping via SerpApi.',
      recommendation_reason: isDirectStoreLink
        ? 'Preço retornado pelo Google Shopping via SerpApi; confirme estoque e frete na loja.'
        : 'O Google não forneceu um link direto da loja para esta oferta; o link abre a busca deste produto no Google Shopping.',
      is_used: /\busado\b/i.test(`${title} ${offer?.second_hand_condition || ''}`),
    };
  }).filter(Boolean).sort((first, second) => priceValue(first.price_estimated) - priceValue(second.price_estimated));
}

async function searchSerpApiShopping(query, apiKey = process.env.SERPAPI_API_KEY, fetchImpl = getShoppingFetcher()) {
  const shopping_url = buildGoogleShoppingUrl(query);
  if (!apiKey) return { query, total_found: 0, deals: [], similar_deals: [], exact_found: false, shopping_url, summary_insight: 'A chave do SerpApi não está configurada no servidor.' };
  try {
    const params = new URLSearchParams({ engine: 'google_shopping', q: query, gl: 'br', hl: 'pt-br', api_key: apiKey });
    const response = await fetchImpl(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`SerpApi respondeu HTTP ${response.status}`);
    const payload = await response.json();
    const standaloneOffers = normalizeSerpApiShopping(payload.shopping_results).filter((offer) => isStandaloneProductOffer(query, offer.title));
    return buildShoppingResponse(query, shopping_url, standaloneOffers);
  } catch {
    return { query, total_found: 0, deals: [], similar_deals: [], exact_found: false, shopping_url, summary_insight: 'O SerpApi não respondeu à consulta automática. Abra a busca abaixo para conferir diretamente.' };
  }
}

module.exports = { normalizeSerpApiShopping, searchSerpApiShopping };
