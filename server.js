const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL, URLSearchParams } = require('node:url');
const puppeteer = require('puppeteer');
const {
  listProducts, createProduct, updateProduct, deleteProduct,
  listCategories, createCategory, updateCategory, deleteCategory,
  listGroups, createGroup, deleteGroup,
  listResources, createResource, updateResource, deleteResource,
  closeDb,
} = require('./db');

function loadLocalEnvironment() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

loadLocalEnvironment();

const PORT = Number(process.env.APP_PORT || 8000);
const HOST = process.env.APP_HOST || '0.0.0.0';
const STATIC_DIRECTORY = path.join(__dirname, 'web', 'dist');
const MIME_TYPES = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

let shoppingFetcher = (...args) => fetch(...args);

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeForComparison(value) {
  return normalize(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Cada categoria é detectada por palavra-chave na query e tem um extrator de atributos
// (canais, portas, tipo de cabo etc.) usado tanto para casar query x oferta quanto,
// no /api/compare, como fallback de ficha técnica quando a oferta não veio da Intelbras.
// Mikrotik é checado antes de "roteador" porque um Mikrotik quase sempre é descrito como roteador também.
const CATEGORY_DETECTORS = [
  ['dvr_nvr', /\b(dvr|nvr|gravador(?:\s+de\s+v[ií]deo)?)\b/i],
  ['camera', /\bc[aâ]mera(s)?\b/i],
  ['facial', /\bfacial\b/i],
  ['porteiro', /\b(porteiro|interfone)\b/i],
  ['mikrotik', /\bmikrotik\b|\brouterboard\b|\brb\d{3,4}\b/i],
  ['switch', /\bswitch(?:es)?\b/i],
  ['fonte', /\bfonte\b/i],
  ['cabo', /\bcabo\b|\bcat\s?5e?\b|\bcat\s?6\b|\bcci\b/i],
  ['roteador', /\broteador(?:es)?\b/i],
  ['acabamento', /\bcanaleta\b|\btubula[cç][aã]o\b|\bcaixa\s+steck\b|\bquadro\s+de\s+comando\b|\brack\b/i],
];

function detectSecurityCategory(text) {
  const normalizedText = normalize(text).toLowerCase();
  const found = CATEGORY_DETECTORS.find(([, pattern]) => pattern.test(normalizedText));
  return found ? found[0] : null;
}

function extractDvrNvrSpecs(title) {
  const t = normalize(title).toLowerCase();
  const specs = {};
  const channelsMatch = t.match(/\b(\d{1,3})\s*(canais|canal|ch)\b/);
  if (channelsMatch) specs['Canais'] = channelsMatch[1];
  const mpMatch = t.match(/\b(\d)\s*mp\b/);
  if (mpMatch) specs['Resolução'] = `${mpMatch[1]}MP`;
  else if (/\b4k\b/.test(t)) specs['Resolução'] = '4K';
  else if (/\bfull\s?hd\b/.test(t)) specs['Resolução'] = 'Full HD';
  else if (/\bhd\b/.test(t)) specs['Resolução'] = 'HD';
  if (/\bpoe\b/.test(t)) specs['PoE'] = 'Sim';
  return Object.keys(specs).length ? specs : null;
}

function extractCameraSpecs(title) {
  const t = normalize(title).toLowerCase();
  const specs = {};
  const mpMatch = t.match(/\b(\d)\s*mp\b/);
  if (mpMatch) specs['Resolução'] = `${mpMatch[1]}MP`;
  else if (/\bfull\s?hd\b/.test(t)) specs['Resolução'] = 'Full HD';
  else if (/\bhd\b/.test(t)) specs['Resolução'] = 'HD';
  // Só marca o tipo quando a query/título é explícita — sem sinal, não force "Analógica" por padrão
  // (isso faria uma busca genérica por "câmera" rejeitar ofertas IP no casamento de oferta exata).
  if (/\bip\b/.test(t)) specs['Tipo'] = 'IP';
  else if (/\bahd\b|\bmulti\s?hd\b|\bfull\s?color\b|\banal[oó]gica\b/.test(t)) specs['Tipo'] = 'Analógica';
  if (/\binfravermelho\b|\bvis[aã]o\s+noturna\b/.test(t)) specs['Visão noturna'] = 'Sim';
  if (/\bpoe\b/.test(t)) specs['PoE'] = 'Sim';
  return Object.keys(specs).length ? specs : null;
}

function extractFacialSpecs(title) {
  const t = normalize(title).toLowerCase();
  const specs = {};
  const usersMatch = t.match(/\b(\d{2,6})\s*(usu[aá]rios|faces|rostos)\b/);
  if (usersMatch) specs['Capacidade'] = `${usersMatch[1]} usuários`;
  if (/\bwi-?fi\b/.test(t)) specs['Conectividade'] = 'Wi-Fi';
  return Object.keys(specs).length ? specs : null;
}

function extractPorteiroSpecs(title) {
  const t = normalize(title).toLowerCase();
  const specs = {};
  const pointsMatch = t.match(/\b(\d{1,3})\s*(pontos|apartamentos|moradores)\b/);
  if (pointsMatch) specs['Pontos'] = pointsMatch[1];
  if (/\bwi-?fi\b|\bsem\s+fio\b/.test(t)) specs['Wireless'] = 'Sim';
  const screenMatch = t.match(/\b(\d(?:[.,]\d)?)\s*(?:polegadas|")/);
  if (screenMatch) specs['Tela'] = `${screenMatch[1]}"`;
  return Object.keys(specs).length ? specs : null;
}

function extractSwitchSpecs(title) {
  const t = normalize(title).toLowerCase();
  const specs = {};
  const portsMatch = t.match(/\b(\d{1,3})\s*portas\b/);
  if (portsMatch) specs['Portas'] = portsMatch[1];
  if (/\bpoe\b/.test(t)) specs['PoE'] = 'Sim';
  if (/\bgerenci[aá]vel\b/.test(t)) specs['Gerenciável'] = 'Sim';
  if (/\bgiga(?:bit)?\b|\b10\/100\/1000\b/.test(t)) specs['Velocidade'] = 'Gigabit';
  return Object.keys(specs).length ? specs : null;
}

function extractFonteSpecs(title) {
  const t = normalize(title).toLowerCase();
  const specs = {};
  const ampMatch = t.match(/\b(\d+(?:[.,]\d+)?)\s*a\b/);
  if (ampMatch) specs['Corrente'] = `${ampMatch[1]}A`;
  if (/\b12\s?v\b/.test(t)) specs['Tensão'] = '12V';
  if (/\bchaveada\b/.test(t)) specs['Tipo'] = 'Chaveada';
  return Object.keys(specs).length ? specs : null;
}

const CABLE_TYPES = [['CAT5e', /\bcat\s?5e\b/], ['CAT6', /\bcat\s?6\b/], ['CAT5', /\bcat\s?5\b/], ['CCI (cabo contra incêndio)', /\bcci\b/], ['Cabo paralelo', /\bparalelo\b/]];

function extractCaboSpecs(title) {
  const t = normalize(title).toLowerCase();
  const specs = {};
  const typeEntry = CABLE_TYPES.find(([, pattern]) => pattern.test(t));
  if (typeEntry) specs['Tipo'] = typeEntry[0];
  const lengthMatch = t.match(/\b(\d+)\s*m(?:etros)?\b/);
  if (lengthMatch) specs['Metragem'] = `${lengthMatch[1]}m`;
  return Object.keys(specs).length ? specs : null;
}

function extractMikrotikSpecs(title) {
  const t = normalize(title).toLowerCase();
  const match = t.match(/\b(rb\d{3,4}[a-z0-9-]*|hap\s?(?:ac[23²³]?|lite|mini)?|ccr\d{4}[a-z0-9-]*|crs\d{3}[a-z0-9-]*)\b/);
  if (!match) return null;
  return { 'Modelo': match[1].toUpperCase().replace(/\s+/g, '') };
}

function extractRoteadorSpecs(title) {
  const t = normalize(title).toLowerCase();
  const specs = {};
  if (/\bwi-?fi\s?6\b/.test(t)) specs['Padrão Wi-Fi'] = 'Wi-Fi 6';
  else if (/\bwi-?fi\s?5\b|\bac\b/.test(t)) specs['Padrão Wi-Fi'] = 'Wi-Fi 5';
  if (/\bdual\s?band\b/.test(t)) specs['Banda'] = 'Dual Band';
  return Object.keys(specs).length ? specs : null;
}

const FINISHING_TYPES = [['Canaleta', /\bcanaleta\b/], ['Tubulação', /\btubula[cç][aã]o\b/], ['Caixa Steck', /\bcaixa\s+steck\b/], ['Quadro de comando', /\bquadro\s+de\s+comando\b/], ['Rack', /\brack\b/]];

function extractAcabamentoSpecs(title) {
  const t = normalize(title).toLowerCase();
  const specs = {};
  const typeEntry = FINISHING_TYPES.find(([, pattern]) => pattern.test(t));
  if (typeEntry) specs['Tipo'] = typeEntry[0];
  const sizeMatch = t.match(/\b(\d+)\s*(mm|u)\b/);
  if (sizeMatch) specs['Tamanho'] = `${sizeMatch[1]}${sizeMatch[2].toUpperCase()}`;
  return Object.keys(specs).length ? specs : null;
}

const CATEGORY_EXTRACTORS = {
  dvr_nvr: extractDvrNvrSpecs,
  camera: extractCameraSpecs,
  facial: extractFacialSpecs,
  porteiro: extractPorteiroSpecs,
  switch: extractSwitchSpecs,
  fonte: extractFonteSpecs,
  cabo: extractCaboSpecs,
  mikrotik: extractMikrotikSpecs,
  roteador: extractRoteadorSpecs,
  acabamento: extractAcabamentoSpecs,
};

function matchesRequestedModel(query, title) {
  const category = detectSecurityCategory(query);
  if (!category) return true;
  // A oferta precisa pertencer à mesma categoria da query, não só compartilhar um atributo solto
  // (ex.: um rádio comunicador "16 canais" não é um DVR "16 canais" só por ter o mesmo número).
  if (detectSecurityCategory(title) !== category) return false;
  const extractor = CATEGORY_EXTRACTORS[category];
  const querySpecs = extractor(query) || {};
  const titleSpecs = extractor(title) || {};
  return Object.entries(querySpecs).every(([key, value]) => titleSpecs[key] === value);
}

const BUNDLE_PATTERN = /\b(kit|combo)\b/i;

const CATEGORY_ACCESSORY_PATTERNS = {
  dvr_nvr: /\bsuporte\b|\bcapa\b|\bfonte\s+avulsa\b/i,
  camera: /\bsuporte\b|\bcapa\b/i,
  facial: /\bsuporte\b|\bcapa\b/i,
  porteiro: /\bsuporte\b|\bcapa\b/i,
  switch: /\bsuporte\b/i,
  fonte: /\bgabinete\b/i,
  cabo: /\balicate\b|\bferramenta\b/i,
  mikrotik: /\bsuporte\b|\bantena\s+avulsa\b/i,
  roteador: /\bsuporte\b|\bantena\s+avulsa\b/i,
  acabamento: /\bkit\s+ferramentas\b/i,
};

function isStandaloneProductOffer(query, title) {
  const category = detectSecurityCategory(query);
  if (!category) return true;
  const normalizedTitle = normalize(title).toLowerCase();
  if (BUNDLE_PATTERN.test(normalizedTitle)) return false;
  const accessoryPattern = CATEGORY_ACCESSORY_PATTERNS[category];
  return !(accessoryPattern && accessoryPattern.test(normalizedTitle));
}

// Substitui o antigo motor de RECIPES fixo (removido — ver SPEC.md "Motor de sugestões migrado do
// código pro cadastro de categorias" para o registro completo das regras antigas). Acha a categoria
// EXATA do catálogo (ex.: "DVR 16 Canais", não só "dvr") cujo `value` aparece no título — todo item
// do orçamento carrega o value da categoria escolhida no próprio título (ver composeProductTitle no
// BudgetCanvas), então basta achar o value mais longo (mais específico) que bate, pra não confundir
// "Câmera IP" com "Câmera IP PoE".
function detectExactCategory(title, categories) {
  const t = normalize(title).toLowerCase();
  let best = null;
  for (const category of categories) {
    const value = category.value.toLowerCase();
    if (t.includes(value) && (!best || value.length > best.value.length)) best = category;
  }
  return best;
}

function buildDependencyReason(anchorLabel, depLabel, critical, hasAlternatives) {
  if (critical && hasAlternatives) return `${anchorLabel} precisa de ${depLabel} ou de uma das alternativas para funcionar.`;
  if (critical) return `${anchorLabel} não funciona sem ${depLabel}.`;
  return `Recomendado para ${anchorLabel}.`;
}

// --- Motor de recursos/capacidade -----------------------------------------------------------
// Convive com o motor antigo de dependencies[] acima: uma categoria com `requirements[]` cadastrado
// usa este motor; uma categoria só com `dependencies[]` continua no motor antigo (ver
// computeCategoryMissingEssentials, que roda os dois e junta o resultado). Ver SPEC.md ("Motor de
// recursos e capacidade") e arquitetura_motor_regras_capacidade_comprador_inviolavel.txt (enviado
// pelo usuário) para o racional completo.
//
// A demanda de um recurso (ex.: `network.gigabit_port`) é somada uma vez só, GLOBALMENTE, entre
// todas as categorias-âncora presentes no orçamento que o exigem — não por âncora — porque duas
// categorias diferentes (ex.: Câmera IP e Câmera IP PoE) podem consumir o mesmo recurso ao mesmo
// tempo, e um mesmo equipamento (Switch PoE) pode fornecer mais de um recurso simultaneamente
// (portas Gigabit + portas PoE). Sem esse ledger global, a mesma capacidade seria contada errado.

// Soma a quantidade de itens do carrinho por categoria exata (não por título) — dois itens
// diferentes da mesma categoria (raro, mas possível) somam a mesma demanda/oferta.
function sumCategoryQuantities(detectedByItem) {
  const totals = new Map();
  for (const { category, quantity } of detectedByItem) {
    if (!category) continue;
    totals.set(category.value, (totals.get(category.value) || 0) + quantity);
  }
  return totals;
}

function buildSupplyLedger(categoryTotals, byValue) {
  const supply = new Map();
  for (const [value, quantity] of categoryTotals) {
    for (const p of byValue.get(value)?.provides || []) {
      supply.set(p.resource, (supply.get(p.resource) || 0) + p.amount * quantity);
    }
  }
  return supply;
}

// Demanda também é global por recurso: soma unitsPerItem * quantidade de TODA categoria-âncora
// presente que exija aquele recurso (via requisito de capacidade OU opção de capacidade dentro de
// um anyOf), não só da âncora que estiver sendo avaliada no momento.
function buildDemandLedger(categoryTotals, byValue) {
  const demand = new Map();
  const add = (resource, amount) => demand.set(resource, (demand.get(resource) || 0) + amount);
  for (const [value, quantity] of categoryTotals) {
    for (const req of byValue.get(value)?.requirements || []) {
      if (req.type === 'capacity') add(req.resource, req.unitsPerItem * quantity);
      else if (req.type === 'anyOf') {
        for (const option of req.options) {
          if (option.type === 'capacity') add(option.resource, option.unitsPerItem * quantity);
        }
      }
    }
  }
  return demand;
}

// Categorias candidatas pra resolver um déficit de um recurso — usadas tanto no `missing` quanto no
// ProductPickerDialog do front (prompt.categories), que já sabe mostrar produto por categoria quando
// há mais de uma opção. Ordenadas da menor pra maior capacidade (sugestão "mais enxuta" primeiro,
// sem obrigar o comercial a escolher ela — ver seção 16 do documento de arquitetura).
function candidateCategoriesForResource(resource, categories) {
  return categories
    .filter((c) => (c.provides || []).some((p) => p.resource === resource))
    .sort((a, b) => a.provides.find((p) => p.resource === resource).amount - b.provides.find((p) => p.resource === resource).amount)
    .map((c) => c.value);
}

function isPresenceSatisfied(candidates, categoryTotals) {
  return candidates.some((value) => categoryTotals.has(value));
}

function satisfyingCategory(candidates, categoryTotals) {
  return candidates.find((value) => categoryTotals.has(value)) || null;
}

// Avalia `requirements[]` das categorias-âncora presentes no orçamento contra o ledger global de
// oferta/demanda. Retorna o mesmo formato de `requirements_by_category`/`missing` do motor antigo
// (key/label/reason/search_term/essential/severity/satisfied_by), com dois campos a mais:
// `categories` (candidatas pro ProductPickerDialog) e, em requisitos de capacidade, `need`/`have`/
// `deficit` (números, pra reason explicar o déficit em vez de só dizer "falta").
function computeResourceRequirements(categoryTotals, categories, byValue) {
  const supply = buildSupplyLedger(categoryTotals, byValue);
  const demand = buildDemandLedger(categoryTotals, byValue);

  const requirementsByAnchor = {};
  const missingByKey = new Map();

  for (const anchorValue of categoryTotals.keys()) {
    const anchor = byValue.get(anchorValue);
    if (!anchor?.requirements?.length) continue;
    const evaluated = [];

    for (const req of anchor.requirements) {
      if (req.type === 'presence') {
        const satisfied_by = satisfyingCategory(req.candidates, categoryTotals);
        evaluated.push({
          key: `presence:${req.candidates.slice().sort().join('|')}`, label: req.label,
          reason: buildDependencyReason(anchor.label, req.label, req.critical, false),
          search_term: req.label, essential: true,
          severity: req.critical && !satisfied_by ? 'critical' : undefined,
          satisfied_by, categories: req.candidates,
        });
      } else if (req.type === 'capacity') {
        const need = demand.get(req.resource) || 0;
        const have = supply.get(req.resource) || 0;
        const deficit = Math.max(0, need - have);
        evaluated.push({
          key: `resource:${req.resource}`, label: req.label,
          reason: deficit
            ? `${req.label}: faltam ${deficit} (${need} necessário${need === 1 ? '' : 's'}, ${have} disponíve${have === 1 ? 'l' : 'is'}).`
            : buildDependencyReason(anchor.label, req.label, req.critical, false),
          search_term: req.label, essential: true,
          severity: req.critical && deficit ? 'critical' : undefined,
          satisfied_by: deficit ? null : 'ok',
          categories: candidateCategoriesForResource(req.resource, categories),
          need, have, deficit,
        });
      } else if (req.type === 'anyOf') {
        const optionStates = req.options.map((option) => {
          if (option.type === 'presence') {
            return { option, satisfied: isPresenceSatisfied(option.candidates, categoryTotals), key: `presence:${option.candidates.slice().sort().join('|')}`, categories: option.candidates };
          }
          const need = demand.get(option.resource) || 0;
          const have = supply.get(option.resource) || 0;
          return { option, satisfied: need > 0 && have >= need, key: `resource:${option.resource}`, categories: candidateCategoriesForResource(option.resource, categories), need, have };
        });
        const satisfiedBySome = optionStates.some((s) => s.satisfied);
        for (const state of optionStates) {
          const satisfied_by = state.satisfied
            ? (state.option.type === 'presence' ? satisfyingCategory(state.categories, categoryTotals) : 'ok')
            : null;
          evaluated.push({
            key: state.key, label: req.label,
            reason: satisfiedBySome && !state.satisfied
              ? `Alternativa para ${req.label} (${anchor.label}).`
              : buildDependencyReason(anchor.label, req.label, req.critical, true),
            search_term: req.label, essential: true,
            severity: state.satisfied ? null : (satisfiedBySome ? 'optional' : 'critical'),
            satisfied_by, categories: state.categories,
            ...(state.option.type === 'capacity' ? { need: state.need, have: state.have } : {}),
          });
        }
      }
    }

    requirementsByAnchor[anchorValue] = evaluated;
    for (const item of evaluated) {
      const existing = missingByKey.get(item.key);
      if (!existing || (item.severity === 'critical' && existing.severity !== 'critical')) missingByKey.set(item.key, item);
    }
  }

  return { requirementsByAnchor, missingByKey };
}

// Motor de sugestões cadastrável: lê `dependencies`/`requirements` de cada categoria (aba
// Categorias) em vez de regras fixas em código. `cartItems`: [{title, quantity}] ou (chamadas
// antigas/testes) [string], quantidade 1 no default. `categories` entra por parâmetro pra manter a
// função pura/testável sem depender de conexão com o Mongo.
function computeCategoryMissingEssentials(cartItems, categories) {
  const items = (Array.isArray(cartItems) ? cartItems : []).map((item) => {
    const title = normalize(typeof item === 'string' ? item : item?.title);
    const quantity = typeof item === 'string' ? 1 : Math.max(1, Math.trunc(Number(item?.quantity)) || 1);
    return title ? { title, quantity } : null;
  }).filter(Boolean);

  const byValue = new Map(categories.map((c) => [c.value, c]));
  const detectedByItem = items.map((item) => ({ ...item, category: detectExactCategory(item.title, categories) }));
  const categoryTotals = sumCategoryQuantities(detectedByItem);

  const satisfyingTitleByValue = new Map();
  for (const { title, category } of detectedByItem) {
    if (!category) continue;
    if (!satisfyingTitleByValue.has(category.value)) satisfyingTitleByValue.set(category.value, title);
  }

  const detected_categories = [...new Set(detectedByItem.map((d) => d.category?.value).filter(Boolean))]
    .filter((value) => byValue.get(value)?.dependencies?.length || byValue.get(value)?.requirements?.length);

  const missingMap = new Map();
  const requirements_by_category = {};

  // Motor antigo: só roda pra âncoras que ainda usam dependencies[] (categorias já migradas pro
  // motor de recursos têm requirements[] e são puladas aqui — ver computeResourceRequirements).
  for (const anchorValue of detected_categories) {
    const anchor = byValue.get(anchorValue);
    if (!anchor.dependencies?.length) continue;
    const handled = new Set();
    const evaluated = [];

    for (const dep of anchor.dependencies) {
      if (handled.has(dep.categoryValue)) continue;

      const depLabel = byValue.get(dep.categoryValue)?.label || dep.categoryValue;
      if (dep.critical && dep.alternatives.length) {
        const groupValues = [dep.categoryValue, ...dep.alternatives.filter((v) => anchor.dependencies.some((d) => d.categoryValue === v))]
          .filter((v, i, arr) => arr.indexOf(v) === i);
        const satisfiedBySome = groupValues.some((v) => satisfyingTitleByValue.has(v));
        for (const value of groupValues) {
          // Um mesmo valor pode aparecer em duas listas de alternativa mútua desta categoria (ex.:
          // switch PoE está no grupo "energia" E no grupo "portas") — sem este guard, a segunda
          // lista reprocessava e duplicava a linha de quem o primeiro grupo já tinha coberto.
          if (handled.has(value)) continue;
          handled.add(value);
          const label = byValue.get(value)?.label || value;
          const satisfied_by = satisfyingTitleByValue.get(value) || null;
          evaluated.push({
            key: value, label, reason: buildDependencyReason(anchor.label, label, true, true),
            search_term: label, essential: true,
            severity: satisfied_by ? null : (satisfiedBySome ? 'optional' : 'critical'),
            satisfied_by, categories: [value],
          });
        }
      } else {
        handled.add(dep.categoryValue);
        const satisfied_by = satisfyingTitleByValue.get(dep.categoryValue) || null;
        evaluated.push({
          key: dep.categoryValue, label: depLabel, reason: buildDependencyReason(anchor.label, depLabel, dep.critical, false),
          search_term: depLabel, essential: true,
          severity: dep.critical && !satisfied_by ? 'critical' : undefined,
          satisfied_by, categories: [dep.categoryValue],
        });
      }
    }

    requirements_by_category[anchorValue] = evaluated;
    for (const item of evaluated) {
      if (!missingMap.has(item.key)) missingMap.set(item.key, item);
    }
  }

  // Motor novo: ledger de recursos, só pras âncoras com requirements[] cadastrado.
  const { requirementsByAnchor, missingByKey } = computeResourceRequirements(categoryTotals, categories, byValue);
  for (const [anchorValue, evaluated] of Object.entries(requirementsByAnchor)) {
    requirements_by_category[anchorValue] = evaluated;
  }
  for (const [key, item] of missingByKey) {
    if (!missingMap.has(key)) missingMap.set(key, item);
  }

  const missing = [...missingMap.values()]
    .filter((item) => !item.satisfied_by)
    .map(({ key, label, reason, search_term, essential, categories }) => ({ key, label, reason, search_term, essential, categories }));
  return { detected_categories, missing, requirements_by_category };
}

function formatBRL(value) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');
}

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

async function searchIntelbrasShopping(query, fetchImpl = shoppingFetcher) {
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

async function fetchIntelbrasProductSpecs(url, fetchImpl = shoppingFetcher) {
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

async function fetchProductSpecs(url, title, fetchImpl = shoppingFetcher) {
  if (isIntelbrasUrl(url)) return fetchIntelbrasProductSpecs(url, fetchImpl);
  const category = detectSecurityCategory(title);
  if (category) {
    const specs = CATEGORY_EXTRACTORS[category](title);
    if (specs) return { specs, note: null };
  }
  return { specs: null, note: 'Não foi possível identificar especificações reconhecidas para este produto. Confira a ficha técnica diretamente na loja.' };
}

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

function priceValue(price) {
  const amount = String(price).match(/R\$\s*[\d.]+,\d{2}/)?.[0] || '';
  const value = Number(amount.replace(/^R\$\s*/, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function buildGoogleShoppingUrl(query) {
  const params = new URLSearchParams({ tbm: 'shop', hl: 'pt-BR', gl: 'br', q: normalize(query) });
  return `https://www.google.com/search?${params}`;
}

function validateSearchRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('Corpo JSON inválido.');
  const item_name = normalize(request.item_name);
  const brand = normalize(request.brand);
  const model = normalize(request.model);
  if (item_name.length < 2 || item_name.length > 100) throw new Error('Informe um produto com 2 a 100 caracteres.');
  if (brand.length > 50 || model.length > 100) throw new Error('Marca ou modelo excede o tamanho permitido.');
  return { item_name, brand, model, query: [item_name, brand, model].filter(Boolean).join(' ') };
}

function validateCompareRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('Corpo JSON inválido.');
  const items = Array.isArray(request.items) ? request.items.filter((item) => item && typeof item === 'object' && normalize(item.title)) : [];
  if (items.length < 2 || items.length > 3) throw new Error('Selecione de 2 a 3 produtos para comparar.');
  return items.map((item) => ({ url: normalize(item.url), title: normalize(item.title) }));
}

function validateRecipeItems(request) {
  if (!request || typeof request !== 'object') throw new Error('Corpo JSON inválido.');
  const rawItems = Array.isArray(request.items) ? request.items : [];
  const items = rawItems.map((item) => {
    const title = normalize(typeof item === 'string' ? item : item?.title);
    if (!title) return null;
    const rawQuantity = Math.trunc(Number(typeof item === 'string' ? 1 : item?.quantity));
    return { title, quantity: Number.isFinite(rawQuantity) && rawQuantity > 0 ? rawQuantity : 1 };
  }).filter(Boolean);
  if (!items.length) throw new Error('Informe ao menos um item no orçamento.');
  if (items.length > 50) throw new Error('Limite de 50 itens por orçamento.');
  return items;
}

function validateRecipePriceItems(request) {
  if (!request || typeof request !== 'object') throw new Error('Corpo JSON inválido.');
  const items = Array.isArray(request.items) ? request.items : [];
  const parsed = items
    .map((item) => ({ label: normalize(item?.label) || normalize(item?.search_term), search_term: normalize(item?.search_term) }))
    .filter((item) => item.search_term);
  if (!parsed.length) throw new Error('Informe ao menos um item para verificar preço.');
  if (parsed.length > 20) throw new Error('Limite de 20 itens por verificação de preço.');
  return parsed;
}

function validateProductRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('Corpo JSON inválido.');
  const category = normalize(request.category);
  const brand = normalize(request.brand);
  const model = normalize(request.model);
  if (!category || category.length > 100) throw new Error('Informe uma categoria válida.');
  if (!brand || brand.length > 50) throw new Error('Informe a marca (até 50 caracteres).');
  if (!model || model.length > 100) throw new Error('Informe o modelo (até 100 caracteres).');
  return { category, brand, model };
}

// dependencies: [{ categoryValue, critical, alternatives }] — outras categorias que esta exige (ou
// sugere) no orçamento. "alternatives" lista outras dependencies desta MESMA categoria que, se
// presentes junto no orçamento, dispensam esta de ser crítica (ex.: Switch PoE e Fonte 12V viram
// alternativas mútuas na Câmera IP PoE). Sanitização fina (dedupe, auto-referência) fica em db.js,
// que já sabe o "value" final da categoria.
function validateDependenciesShape(raw) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error('Dependências inválidas.');
  if (raw.length > 50) throw new Error('Limite de 50 dependências por categoria.');
  return raw.map((dep) => {
    const categoryValue = normalize(dep?.categoryValue);
    if (!categoryValue) throw new Error('Cada dependência precisa apontar para uma categoria válida.');
    const alternatives = Array.isArray(dep?.alternatives) ? dep.alternatives.map((v) => normalize(v)).filter(Boolean) : [];
    return { categoryValue, critical: !!dep?.critical, alternatives };
  });
}

// provides: [{ resource, amount }] — quanto desse recurso uma unidade desta categoria fornece (ex.:
// Switch PoE Giga 16 Portas fornece 16 de `network.gigabit_port` e 16 de `power.poe_port`).
// requirements: [{ id, label, critical, type: 'presence'|'capacity', ... } | { type: 'anyOf', options: [...] }]
// — o que uma unidade desta categoria exige. Validação aqui é só de forma (shape); sanitização fina
// (dedupe, limites) fica em db.js, igual ao padrão já usado por dependencies. Ver categoryResourceSeed.js
// e SPEC.md ("Motor de recursos e capacidade") pro racional — o cadastro (CategoryFormDialog) ainda
// não edita esses dois campos, só a API/seed; por isso ambos são opcionais aqui.
function validateProvidesShape(raw) {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error('Recursos fornecidos inválidos.');
  if (raw.length > 20) throw new Error('Limite de 20 recursos fornecidos por categoria.');
  return raw.map((entry) => {
    const resource = normalize(entry?.resource);
    if (!resource) throw new Error('Cada recurso fornecido precisa de um identificador.');
    return { resource, amount: entry?.amount };
  });
}

function validateRequirementOptionShape(raw) {
  if (raw?.type === 'capacity') {
    const resource = normalize(raw?.resource);
    if (!resource) throw new Error('Requisito de capacidade precisa de um recurso.');
    return { type: 'capacity', resource, unitsPerItem: raw?.unitsPerItem };
  }
  const candidates = Array.isArray(raw?.candidates) ? raw.candidates.map((v) => normalize(v)).filter(Boolean) : [];
  if (!candidates.length) throw new Error('Requisito de presença precisa de ao menos uma categoria candidata.');
  return { type: 'presence', candidates };
}

function validateRequirementsShape(raw) {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error('Requisitos inválidos.');
  if (raw.length > 30) throw new Error('Limite de 30 requisitos por categoria.');
  return raw.map((req) => {
    const id = normalize(req?.id);
    const label = normalize(req?.label);
    if (!id || !label) throw new Error('Cada requisito precisa de id e rótulo.');
    const critical = !!req?.critical;
    if (req?.type === 'anyOf') {
      const options = Array.isArray(req.options) ? req.options.map(validateRequirementOptionShape) : [];
      if (options.length < 2) throw new Error('Requisito "qualquer um" precisa de ao menos 2 opções.');
      return { id, label, type: 'anyOf', critical, options };
    }
    return { id, label, critical, ...validateRequirementOptionShape(req) };
  });
}

// capacity: opcional — quantas unidades de outra coisa uma unidade DESTA categoria comporta (portas
// de switch, canais de DVR/NVR). Ausente/0 = categoria sem noção de capacidade. Campo legado,
// mantido pelo cadastro atual; não confundir com `provides`, que é o mesmo conceito só que por
// recurso nomeado (ver acima).
function validateCategoryRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('Corpo JSON inválido.');
  const group = normalize(request.group);
  const label = normalize(request.label);
  if (!group || group.length > 60) throw new Error('Informe um grupo válido (até 60 caracteres).');
  if (!label || label.length > 100) throw new Error('Informe um nome de categoria válido (até 100 caracteres).');
  const rawCapacity = Number(request.capacity);
  const capacity = Number.isFinite(rawCapacity) && rawCapacity > 0 ? Math.trunc(rawCapacity) : null;
  const dependencies = validateDependenciesShape(request.dependencies);
  const provides = validateProvidesShape(request.provides);
  const requirements = validateRequirementsShape(request.requirements);
  return { group, label, capacity, dependencies, provides, requirements };
}

// key: identificador técnico gravado em provides[].resource/requirements[].resource (ex.:
// "network.gigabit_port") — letras/números/ponto/underscore, mesmo formato usado por
// categoryResourceSeed.js. label: nome amigável mostrado nos seletores de recurso.
function validateResourceRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('Corpo JSON inválido.');
  const key = normalize(request.key).toLowerCase();
  const label = normalize(request.label);
  if (!key || key.length > 100 || !/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/.test(key)) {
    throw new Error('Informe uma chave válida (ex: network.gigabit_port — letras, números, ponto e underscore, começando com letra).');
  }
  if (!label || label.length > 100) throw new Error('Informe um nome para o recurso (até 100 caracteres).');
  return { key, label };
}

function isGoogleHostedLink(url) {
  try { return /(^|\.)google\.[a-z.]{2,}$/i.test(new URL(url).hostname); } catch { return false; }
}

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

async function searchSerperShopping(query, apiKey = process.env.SERPER_API_KEY, fetchImpl = shoppingFetcher) {
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

async function searchSerpApiShopping(query, apiKey = process.env.SERPAPI_API_KEY, fetchImpl = shoppingFetcher) {
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

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; if (body.length > 1_000_000) request.destroy(); });
    request.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Corpo JSON inválido.')); } });
    request.on('error', reject);
  });
}

function serveStatic(requestPath, response) {
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/(?:static\/)?/, '');
  const filePath = path.resolve(STATIC_DIRECTORY, relativePath);
  if (!filePath.startsWith(`${STATIC_DIRECTORY}${path.sep}`)) return sendJson(response, 403, { detail: 'Acesso negado.' });
  fs.readFile(filePath, (error, file) => {
    if (error) return sendJson(response, 404, { detail: 'Arquivo não encontrado.' });
    response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
    response.end(file);
  });
}

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
      // "items" ecoa a categoria exata detectada de cada item de entrada, na mesma ordem — o canvas
      // (estilo n8n) usa isso pra saber de qual nó desenhar a aresta, sem duplicar detecção em JS.
      const items = cartItems.map(({ title }) => ({ title, category: detectExactCategory(title, categories)?.value || null }));
      return sendJson(response, 200, { ...computeCategoryMissingEssentials(cartItems, categories), items });
    }
    if (request.method === 'POST' && url.pathname === '/api/recipe/prices') {
      const body = await readJson(request);
      const items = validateRecipePriceItems(body);
      const results = await Promise.all(items.map(fetchRecipeItemPrice));
      return sendJson(response, 200, { results });
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
  shoppingFetcher = fetcher;
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
