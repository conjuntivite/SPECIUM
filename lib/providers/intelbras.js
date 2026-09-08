const { normalize } = require('../text');
const { formatBRL } = require('../money');
const { detectSecurityCategory, isStandaloneProductOffer, CATEGORY_EXTRACTORS } = require('../specs');
const { priceValue, buildGoogleShoppingUrl, buildShoppingResponse } = require('./shared');
const { getShoppingFetcher } = require('./shoppingFetcher');

// Provedor gratuito padrão: loja oficial da Intelbras (VTEX). Sem chave, sem bloqueio anti-bot
// (confirmado por teste direto) e já devolve ficha técnica estruturada junto com o preço.
function normalizeIntelbrasOffers(products) {
  if (!Array.isArray(products)) return [];
  const seen = new Set();
  return products.map((product) => {
    const item = product?.items?.[0];
    const seller = item?.sellers?.find((entry) => entry?.sellerDefault) || item?.sellers?.[0];
    const offer = seller?.commertialOffer;
    const title = normalize(product?.productName);
    const priceAmount = Number(offer?.Price);
    const linkText = normalize(product?.linkText);
    if (!title || !linkText || !Number.isFinite(priceAmount) || priceAmount <= 0 || offer?.IsAvailable === false) return null;
    const url = `https://loja.intelbras.com.br/${linkText}/p`;
    if (seen.has(url)) return null;
    seen.add(url);
    const installment = Array.isArray(offer?.Installments) ? offer.Installments.find((entry) => entry.NumberOfInstallments > 1) : null;
    return {
      title,
      store: 'Intelbras',
      price_estimated: formatBRL(priceAmount),
      url,
      installment_info: installment ? `${installment.NumberOfInstallments}x de ${formatBRL(installment.Value)}` : null,
      snippet: Number(offer?.AvailableQuantity) > 0 ? 'Em estoque na loja oficial da Intelbras.' : 'Oferta encontrada na loja oficial da Intelbras.',
      recommendation_reason: 'Preço e ficha técnica oficiais, obtidos diretamente do catálogo da Intelbras.',
      is_used: false,
    };
  }).filter(Boolean).sort((first, second) => priceValue(first.price_estimated) - priceValue(second.price_estimated));
}

async function searchIntelbrasShopping(query, fetchImpl = getShoppingFetcher()) {
  const shopping_url = buildGoogleShoppingUrl(query);
  try {
    const response = await fetchImpl(`https://loja.intelbras.com.br/api/catalog_system/pub/products/search?ft=${encodeURIComponent(query)}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Intelbras respondeu HTTP ${response.status}`);
    const products = await response.json();
    const standaloneOffers = normalizeIntelbrasOffers(products).filter((offer) => isStandaloneProductOffer(query, offer.title));
    return buildShoppingResponse(query, shopping_url, standaloneOffers, { subject: 'A Intelbras', locative: 'no catálogo oficial da Intelbras' }, { distinctStores: false });
  } catch {
    return { query, total_found: 0, deals: [], similar_deals: [], exact_found: false, shopping_url, summary_insight: 'A Intelbras não respondeu à consulta automática. Abra a busca abaixo para conferir diretamente.' };
  }
}

function isIntelbrasUrl(url) {
  try { return new URL(url).hostname === 'loja.intelbras.com.br'; } catch { return false; }
}

function extractIntelbrasLinkText(url) {
  try { return new URL(url).pathname.replace(/^\//, '').replace(/\/p$/, '') || null; } catch { return null; }
}

const INTELBRAS_IGNORED_SPEC_FIELDS = new Set(['segmento', 'hasServiceType', 'buyTogetherProducts']);

function buildIntelbrasSpecs(product) {
  const fieldNames = Array.isArray(product?.allSpecifications) ? product.allSpecifications : [];
  const specs = {};
  for (const field of fieldNames) {
    if (INTELBRAS_IGNORED_SPEC_FIELDS.has(field) || /^produto\s*-\s*bloco/i.test(field) || /^n[uú]mero homologa[cç][aã]o/i.test(field)) continue;
    const value = product[field];
    const text = Array.isArray(value) ? value.filter((entry) => typeof entry === 'string').join(', ').trim() : '';
    if (text) specs[field] = text;
  }
  return Object.keys(specs).length ? specs : null;
}

async function fetchIntelbrasProductSpecs(url, fetchImpl = getShoppingFetcher()) {
  const linkText = extractIntelbrasLinkText(url);
  if (!linkText) return { specs: null, note: 'Não foi possível identificar o produto na Intelbras a partir do link informado.' };
  try {
    const response = await fetchImpl(`https://loja.intelbras.com.br/api/catalog_system/pub/products/search/${linkText}/p`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Intelbras respondeu HTTP ${response.status}`);
    const [product] = await response.json();
    const specs = product ? buildIntelbrasSpecs(product) : null;
    return specs ? { specs, note: null } : { specs: null, note: 'A Intelbras não retornou especificações estruturadas para este produto.' };
  } catch {
    return { specs: null, note: 'Não foi possível carregar a ficha técnica oficial da Intelbras para este produto.' };
  }
}

async function fetchProductSpecs(url, title, fetchImpl = getShoppingFetcher()) {
  if (isIntelbrasUrl(url)) return fetchIntelbrasProductSpecs(url, fetchImpl);
  const category = detectSecurityCategory(title);
  if (category) {
    const specs = CATEGORY_EXTRACTORS[category](title);
    if (specs) return { specs, note: null };
  }
  return { specs: null, note: 'Não foi possível identificar especificações reconhecidas para este produto. Confira a ficha técnica diretamente na loja.' };
}

module.exports = {
  normalizeIntelbrasOffers,
  searchIntelbrasShopping,
  isIntelbrasUrl,
  extractIntelbrasLinkText,
  buildIntelbrasSpecs,
  fetchIntelbrasProductSpecs,
  fetchProductSpecs,
};
