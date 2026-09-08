const { normalize } = require('./text');

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

module.exports = {
  detectSecurityCategory,
  extractDvrNvrSpecs,
  extractCameraSpecs,
  extractFacialSpecs,
  extractPorteiroSpecs,
  extractSwitchSpecs,
  extractFonteSpecs,
  extractCaboSpecs,
  extractMikrotikSpecs,
  extractRoteadorSpecs,
  extractAcabamentoSpecs,
  CATEGORY_EXTRACTORS,
  matchesRequestedModel,
  isStandaloneProductOffer,
  detectExactCategory,
};
