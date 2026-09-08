const { formatBRL } = require('../money');
const { priceValue, buildGoogleShoppingUrl, buildShoppingResponse } = require('./shared');
const { searchIntelbrasShopping } = require('./intelbras');
const { searchAmazonShopping } = require('./amazon');
const { searchSerperShopping } = require('./serper');
const { searchSerpApiShopping } = require('./serpapi');

// A Intelbras é o provedor gratuito padrão (catálogo próprio + ficha técnica estruturada).
// Serper/SerpApi (Google Shopping) cobrem o resto do mercado — inclusive o Mercado Livre de forma
// indireta, quando o Google indexa um anúncio do ML — já que o ML bloqueia acesso automatizado direto
// (403, inclusive na API pública oficial; ver README/SPEC).
const SEARCH_PROVIDERS = {
  intelbras: { label: 'Intelbras (catálogo oficial)', search: searchIntelbrasShopping, hasKey: () => true },
  amazon: { label: 'Amazon (busca própria)', search: searchAmazonShopping, hasKey: () => true },
  serper: { label: 'Serper', search: searchSerperShopping, hasKey: () => Boolean(process.env.SERPER_API_KEY) },
  serpapi: { label: 'SerpApi', search: searchSerpApiShopping, hasKey: () => Boolean(process.env.SERPAPI_API_KEY) },
};
const AGGREGATE_PROVIDER = 'all';
const DEFAULT_PROVIDER = AGGREGATE_PROVIDER;

async function searchAllProviders(query) {
  const shopping_url = buildGoogleShoppingUrl(query);
  const settled = await Promise.allSettled(Object.values(SEARCH_PROVIDERS).map((provider) => provider.search(query)));
  const seen = new Set();
  const standaloneOffers = settled
    .flatMap((result) => (result.status === 'fulfilled' ? [...(result.value.deals || []), ...(result.value.similar_deals || [])] : []))
    .filter((offer) => {
      if (seen.has(offer.url)) return false;
      seen.add(offer.url);
      return true;
    })
    .sort((first, second) => priceValue(first.price_estimated) - priceValue(second.price_estimated));
  return buildShoppingResponse(query, shopping_url, standaloneOffers, { subject: 'Nenhum provedor de busca', locative: 'nos provedores de busca combinados' });
}

async function fetchRecipeItemPrice(item) {
  const result = await searchAllProviders(item.search_term);
  const prices = [...(result.deals || []), ...(result.similar_deals || [])].map((deal) => priceValue(deal.price_estimated)).filter(Number.isFinite);
  const average_price = prices.length ? formatBRL(prices.reduce((sum, price) => sum + price, 0) / prices.length) : null;
  return { label: item.label, search_term: item.search_term, average_price, ...result };
}

module.exports = { SEARCH_PROVIDERS, AGGREGATE_PROVIDER, DEFAULT_PROVIDER, searchAllProviders, fetchRecipeItemPrice };
