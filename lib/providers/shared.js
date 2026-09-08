const { URLSearchParams } = require('node:url');
const { normalize, normalizeForComparison } = require('../text');
const { matchesRequestedModel } = require('../specs');

function priceValue(price) {
  const amount = String(price).match(/R\$\s*[\d.]+,\d{2}/)?.[0] || '';
  const value = Number(amount.replace(/^R\$\s*/, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function buildGoogleShoppingUrl(query) {
  const params = new URLSearchParams({ tbm: 'shop', hl: 'pt-BR', gl: 'br', q: normalize(query) });
  return `https://www.google.com/search?${params}`;
}

function isGoogleHostedLink(url) {
  try { return /(^|\.)google\.[a-z.]{2,}$/i.test(new URL(url).hostname); } catch { return false; }
}

const MIN_RESULTS = 10;
const MAX_PRICE_RATIO_TO_CHEAPEST = 3;

function excludePriceOutliers(offers, maxRatioToCheapest = MAX_PRICE_RATIO_TO_CHEAPEST) {
  const prices = offers.map((offer) => priceValue(offer.price_estimated)).filter(Number.isFinite);
  if (prices.length < 2) return offers;
  const cheapest = Math.min(...prices);
  return offers.filter((offer) => priceValue(offer.price_estimated) <= cheapest * maxRatioToCheapest);
}

function selectTopDistinctStores(deals, limit = 5, excludeStoreKeys = new Set()) {
  const stores = new Set(excludeStoreKeys);
  return deals.filter((deal) => {
    const storeKey = normalizeForComparison(deal.store);
    if (stores.has(storeKey)) return false;
    stores.add(storeKey);
    return true;
  }).slice(0, limit);
}

function selectTopOffers(offers, limit, excludeUrls = new Set()) {
  return offers.filter((offer) => !excludeUrls.has(offer.url)).slice(0, limit);
}

function buildShoppingResponse(query, shopping_url, standaloneOffers, sourceLabel = { subject: 'O Google Shopping', locative: 'no Google Shopping' }, { distinctStores = true } = {}) {
  const matchingOffers = standaloneOffers.filter((offer) => matchesRequestedModel(query, offer.title));
  const exactCandidates = excludePriceOutliers(matchingOffers);
  const outlierUrls = new Set(matchingOffers.filter((offer) => !exactCandidates.includes(offer)).map((offer) => offer.url));

  const deals = distinctStores ? selectTopDistinctStores(exactCandidates, MIN_RESULTS) : selectTopOffers(exactCandidates, MIN_RESULTS);
  const exact_found = deals.length > 0;
  const usedUrls = new Set(deals.map((deal) => deal.url));
  const usedStoreKeys = new Set(deals.map((deal) => normalizeForComparison(deal.store)));

  const remainingSlots = MIN_RESULTS - deals.length;
  const similarPool = standaloneOffers.filter((offer) => !usedUrls.has(offer.url) && !outlierUrls.has(offer.url));
  const similar_deals = remainingSlots > 0
    ? (distinctStores ? selectTopDistinctStores(similarPool, remainingSlots, usedStoreKeys) : selectTopOffers(similarPool, remainingSlots))
    : [];

  const total_found = deals.length + similar_deals.length;
  if (!total_found) return { query, total_found: 0, deals: [], similar_deals: [], exact_found: false, shopping_url, summary_insight: `${sourceLabel.subject} não retornou ofertas para esta busca. Confira a busca direta abaixo.` };

  let summary_insight;
  if (exact_found && !similar_deals.length) summary_insight = `Foram encontradas **${deals.length} ofertas** ${sourceLabel.locative} para **${query}**.`;
  else if (exact_found) summary_insight = `Foram encontradas **${deals.length} ofertas** do modelo exato e **${similar_deals.length} opções semelhantes** ${sourceLabel.locative} para **${query}**.`;
  else summary_insight = `Não encontramos o modelo exato, mas aqui estão **${similar_deals.length} opções semelhantes** ${sourceLabel.locative} para **${query}**.`;

  return { query, total_found, deals, similar_deals, exact_found, shopping_url, summary_insight };
}

module.exports = {
  priceValue,
  buildGoogleShoppingUrl,
  isGoogleHostedLink,
  MIN_RESULTS,
  MAX_PRICE_RATIO_TO_CHEAPEST,
  excludePriceOutliers,
  selectTopDistinctStores,
  selectTopOffers,
  buildShoppingResponse,
};
