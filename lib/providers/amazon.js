const puppeteer = require('puppeteer');
const { normalize } = require('../text');
const { isStandaloneProductOffer } = require('../specs');
const { priceValue, buildGoogleShoppingUrl, buildShoppingResponse } = require('./shared');

let launchAmazonBrowser = () => puppeteer.launch({ headless: true });
let amazonBrowserPromise = null;

async function getAmazonBrowser() {
  if (!amazonBrowserPromise) {
    amazonBrowserPromise = Promise.resolve(launchAmazonBrowser()).catch((error) => {
      amazonBrowserPromise = null;
      throw error;
    });
  }
  return amazonBrowserPromise;
}

function setAmazonBrowserLauncher(launcher) {
  launchAmazonBrowser = launcher;
  amazonBrowserPromise = null;
}

async function scrapeAmazonSearchPage(query, browserGetter) {
  const browser = await browserGetter();
  const page = await browser.newPage();
  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });
    await page.goto(`https://www.amazon.com.br/s?k=${encodeURIComponent(query)}`, { waitUntil: 'networkidle2', timeout: 20_000 });
    return await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div[data-component-type="s-search-result"]'));
      return cards.map((card) => {
        const sponsored = Boolean(card.querySelector('.puis-sponsored-label-text, [data-component-type="sp-sponsored-result"]'));
        const titleEl = card.querySelector('h2 a span, h2 span');
        const priceEl = card.querySelector('.a-price .a-offscreen');
        return {
          asin: card.getAttribute('data-asin'),
          sponsored,
          title: titleEl ? titleEl.textContent.trim() : null,
          price: priceEl ? priceEl.textContent.trim() : null,
        };
      });
    });
  } finally {
    await page.close();
  }
}

function normalizeAmazonOffers(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  return items.map((item) => {
    if (item?.sponsored) return null;
    const title = normalize(item?.title);
    const asin = normalize(item?.asin);
    const price_estimated = normalize(item?.price);
    if (!title || !asin || !/^R\$/.test(price_estimated)) return null;
    const url = `https://www.amazon.com.br/dp/${asin}`;
    if (seen.has(url)) return null;
    seen.add(url);
    return {
      title,
      store: 'Amazon',
      price_estimated,
      url,
      installment_info: null,
      snippet: 'Oferta encontrada na busca da Amazon.',
      recommendation_reason: 'Preço obtido diretamente da página de busca da Amazon.',
      is_used: /\brecondicionado\b|\busado\b|\brenewed\b/i.test(title),
    };
  }).filter(Boolean).sort((first, second) => priceValue(first.price_estimated) - priceValue(second.price_estimated));
}

async function searchAmazonShopping(query, browserGetter = getAmazonBrowser) {
  const shopping_url = buildGoogleShoppingUrl(query);
  try {
    const items = await scrapeAmazonSearchPage(query, browserGetter);
    const standaloneOffers = normalizeAmazonOffers(items).filter((offer) => isStandaloneProductOffer(query, offer.title));
    return buildShoppingResponse(query, shopping_url, standaloneOffers, { subject: 'A Amazon', locative: 'na busca da Amazon' }, { distinctStores: false });
  } catch {
    return { query, total_found: 0, deals: [], similar_deals: [], exact_found: false, shopping_url, summary_insight: 'A Amazon não respondeu à consulta automática. Abra a busca abaixo para conferir diretamente.' };
  }
}

module.exports = {
  getAmazonBrowser,
  setAmazonBrowserLauncher,
  scrapeAmazonSearchPage,
  normalizeAmazonOffers,
  searchAmazonShopping,
};
