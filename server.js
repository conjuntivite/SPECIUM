const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL, URLSearchParams } = require('node:url');
const puppeteer = require('puppeteer');
const { listProducts, createProduct, updateProduct, deleteProduct, closeDb } = require('./db');

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

// "Receita de bolo": para cada categoria-âncora que o comercial já colocou no orçamento, lista os
// complementos essenciais para o equipamento funcionar. Cada requisito é satisfeito se QUALQUER item
// já presente no orçamento (de qualquer categoria) bater no padrão — não depende de rastrear categoria
// exata, então um item digitado livremente ("cabo cat6") já resolve o requisito "cabo de rede".
const REQUIREMENT_PATTERNS = {
  cabo_rede: /\bcabo\b|\bcat\s?5e?\b|\bcat\s?6\b|\butp\b|\bpar\s+tran[cç]ado\b/i,
  cabo_coaxial: /\bcoaxial\b/i,
  conectores_bnc_p4: /\bconector(?:es)?\b|\bbnc\b|\bp4\b/i,
  baluns: /\bbaluns?\b/i,
  switch_poe: /(?=.*\bswitch\b)(?=.*\bpoe\b)/i,
  switch_giga: /(?=.*\bswitch\b)(?=.*\b(?:giga(?:bit)?|10\/100\/1000)\b)/i,
  caixa_steck: /\bcaixa\s+steck\b/i,
  // Kit de acabamento: cada item vira sua própria sugestão/caixa na lateral, não uma só combinada.
  canaleta: /\bcanaletas?\b/i,
  corrugado: /\bcorrugados?\b/i,
  caixa_passagem: /\bcaixa\s+de\s+passagem\b/i,
  cotovelo: /\bcotovelos?\b/i,
  abracadeira: /\babra[çc]adeiras?\b/i,
  eletroduto: /\beletroduto\b/i,
  adaptador: /\badaptador(?:es)?\b/i,
  nvr: /\b(dvr|nvr|gravador)\b/i,
  // Cartão de memória só entra como opção de gravação pra câmera AcuSense (ver camera_acusense) — a
  // regra original não estende essa alternativa pra câmera IP/analógica comum.
  cartao_memoria: /\bcart[aã]o\s+de\s+mem[oó]ria\b|\bmicro\s?sd\b/i,
  dvr: /\b(dvr|gravador)\b/i,
  // "HD" sozinho é ambíguo demais pra casar: em título de câmera/DVR quase sempre é resolução
  // ("Multi HD", "Full HD"), não armazenamento — achado testando a rotina de combinações aleatórias
  // (uma câmera "Multi HD" no orçamento satisfazia o HD de armazenamento do DVR por engano). Só conta
  // como storage quando vem com contexto inequívoco: HDD/SSD/disco rígido, "HD interno", "HD para
  // DVR/NVR", ou uma capacidade em TB/GB (câmera nunca é anunciada em TB/GB).
  hd_interno: /\bhdd\b|\bssd\b|\bdisco\s*r[ií]gido\b|\bhd\s+interno\b|\bhd\s+para\s+(dvr|nvr)\b|\b\d+\s?(tb|gb)\b/i,
  cameras: /\bc[aâ]mera(s)?\b/i,
  fonte_12v: /\bfonte\b/i,
  // Mesmo padrão de fonte_12v, chave própria: opção alternativa dentro de alternativeRequirement,
  // não pode compartilhar chave com o fonte_12v "obrigatório" usado por outras categorias.
  fonte_poe_alt: /\bfonte\b/i,
  fechadura: /\bfechadura\b|\beletro[ií]m[aã]\b/i,
  nobreak: /\bnobreak\b/i,
  rack: /\brack\b/i,
  central_alarme: /\bcentral\s+de\s+alarme\b/i,
};

// critical: mesmo vermelho "⛔ Sem isso não liga" usado pelas opções de alternativeRequirement, mas
// pra um requisito único (não alternativo) onde não ter o item impede o equipamento de funcionar —
// ex.: câmera IP sem PoE não liga sem fonte 12V própria, não é só "recomendado".
function requirement(key, label, reason, search_term, essential = true, { critical = false } = {}) {
  return { key, label, reason, search_term, essential, critical, pattern: REQUIREMENT_PATTERNS[key] };
}

// Compartilhado pelas 3 recipes de câmera (IP, IP PoE, analógica): sete caixas separadas na lateral,
// uma por item do kit de acabamento — recomendadas (não essenciais), não uma sugestão combinada.
const FINISHING_KIT_REQUIREMENTS = [
  requirement('canaleta', 'Canaleta', 'Acabamento e proteção do cabeamento aparente.', 'canaleta', false),
  requirement('corrugado', 'Cano corrugado', 'Proteção extra para cabeamento embutido em parede/laje.', 'cano corrugado', false),
  requirement('caixa_passagem', 'Caixa de passagem', 'Facilita emendas e mudanças de direção do cabeamento embutido.', 'caixa de passagem', false),
  requirement('cotovelo', 'Cotovelo', 'Faz a curva do eletroduto/canaleta sem forçar o cabo.', 'cotovelo eletroduto', false),
  requirement('abracadeira', 'Abraçadeira', 'Organiza e fixa o cabeamento aparente.', 'abraçadeira nylon', false),
  requirement('eletroduto', 'Eletroduto', 'Proteção rígida para cabeamento embutido.', 'eletroduto', false),
  requirement('adaptador', 'Adaptador', 'Conecta trechos de tamanhos/tipos diferentes de eletroduto ou canaleta.', 'adaptador eletroduto', false),
];

// Requisito satisfeito por QUALQUER UMA de duas ou mais opções (ex.: câmera IP PoE liga com switch
// PoE OU fonte 12V — não precisa das duas). Ao contrário de requirement(), cada opção vira sua própria
// sugestão no canvas (ver computeMissingEssentials): as duas em vermelho enquanto nenhuma foi
// escolhida, e a que sobra em laranja assim que a outra é adicionada ao orçamento.
function alternativeRequirement(key, reason, options) {
  return { key, reason, alternatives: options.map(({ key: altKey, label, search_term }) => ({ key: altKey, label, search_term, pattern: REQUIREMENT_PATTERNS[altKey] })) };
}

const RECIPES = {
  // Câmera IP sem "PoE" explícito no título: tratada como não-PoE (mesmo critério de default já usado
  // para IP x Analógica) — sem PoE ela não liga só com o cabo de rede, precisa de fonte 12V própria.
  camera_ip: {
    requires: [
      requirement('cabo_rede', 'Cabo de rede (CAT5e/CAT6)', 'Liga a câmera IP ao switch/rede.', 'cabo de rede cat5e'),
      requirement('fonte_12v', 'Fonte 12V', 'Câmera IP sem PoE não liga só com o cabo de rede — precisa de fonte própria. Câmera IP normal não liga num switch PoE, o switch PoE não é opção aqui.', 'fonte 12v 1a', true, { critical: true }),
      requirement('switch_giga', 'Switch Gigabit', 'Toda câmera IP deve ir com switch Giga, para priorizar qualidade e evitar travamento.', 'switch giga'),
      requirement('nvr', 'NVR', 'Sem gravação a câmera só transmite ao vivo, sem histórico.', 'nvr'),
      requirement('caixa_steck', 'Caixa Steck', 'Protege emendas e conexões do cabeamento.', 'caixa steck'),
      ...FINISHING_KIT_REQUIREMENTS,
    ],
  },
  camera_ip_poe: {
    requires: [
      requirement('cabo_rede', 'Cabo de rede (CAT5e/CAT6)', 'Liga a câmera IP ao switch/rede.', 'cabo de rede cat5e'),
      alternativeRequirement('alimentacao_poe_ou_fonte', 'Câmera IP PoE recebe energia pelo próprio cabo de rede através de um switch PoE — sem switch PoE, precisa de fonte 12V dedicada. Sem nenhum dos dois a câmera não liga.', [
        { key: 'switch_poe', label: 'Switch PoE', search_term: 'switch poe' },
        { key: 'fonte_poe_alt', label: 'Fonte 12V', search_term: 'fonte 12v 1a' },
      ]),
      requirement('switch_giga', 'Switch Gigabit', 'Toda câmera IP deve ir com switch Giga, para priorizar qualidade e evitar travamento.', 'switch giga'),
      requirement('nvr', 'NVR', 'Sem gravação a câmera só transmite ao vivo, sem histórico.', 'nvr'),
      requirement('caixa_steck', 'Caixa Steck', 'Protege emendas e conexões do cabeamento.', 'caixa steck'),
      ...FINISHING_KIT_REQUIREMENTS,
    ],
  },
  camera_analogica: {
    requires: [
      requirement('cabo_coaxial', 'Cabo coaxial (CFTV)', 'Leva vídeo e energia da câmera analógica até o DVR.', 'cabo coaxial cftv'),
      requirement('baluns', 'Baluns (transformador de vídeo)', 'Sem baluns a câmera analógica não transmite em instalação por par trançado/rede.', 'balun cftv'),
      requirement('conectores_bnc_p4', 'Conectores BNC/P4', 'Fecha as pontas do cabo coaxial na câmera e no DVR.', 'conector bnc p4'),
      requirement('fonte_12v', 'Fonte 12V', 'Câmera analógica não recebe energia pelo cabo de vídeo — precisa de fonte própria.', 'fonte 12v 1a'),
      requirement('dvr', 'DVR', 'Câmera analógica não grava sozinha — sem DVR não há gravação nem visualização centralizada.', 'dvr'),
      requirement('caixa_steck', 'Caixa Steck', 'Protege emendas e conexões do cabeamento.', 'caixa steck'),
      ...FINISHING_KIT_REQUIREMENTS,
    ],
  },
  // Overlay: câmera AcuSense (Hikvision) soma este requisito ao do tipo de câmera (IP/analógica)
  // detectado no mesmo título — ver detectOverlayCategories.
  camera_acusense: {
    requires: [
      requirement('central_alarme', 'Central de alarme', 'Câmera AcuSense sozinha não é monitorada: sem central de alarme os disparos de linha virtual não geram evento via contact ID. Exceção: cliente quer monitorar só pelo aplicativo Hikvision, sem central de alarme — nesse caso não é necessária.', 'central de alarme'),
      // Reaproveita a chave 'nvr' da câmera IP/analógica de propósito — mesmo padrão, então um NVR
      // já no orçamento satisfaz as duas ao mesmo tempo. Cartão de memória só é opção aqui: é a
      // exceção específica da AcuSense, não vale pra câmera comum (ver REQUIREMENT_PATTERNS.cartao_memoria).
      alternativeRequirement('gravacao_acusense', 'AcuSense grava por NVR ou, se o modelo suportar, direto num cartão de memória — sem nenhum dos dois só dá pra ver ao vivo, sem histórico.', [
        { key: 'nvr', label: 'NVR', search_term: 'nvr' },
        { key: 'cartao_memoria', label: 'Cartão de Memória', search_term: 'cartão de memória 128gb' },
      ]),
    ],
  },
  // DVR e NVR viraram categorias próprias (não mais uma "dvr_nvr" combinada): DVR é o gravador
  // clássico de câmera analógica (coaxial), NVR é o gravador de câmera IP (rede) — na prática pedem
  // cabeamento diferente, então misturar os dois numa receita só estava errado. `detectSecurityCategory`
  // (usada pela busca/comparação de preço) continua tratando os dois como "dvr_nvr" combinado —
  // essa distinção é só pra receita de orçamento, ver detectRecipeCategory.
  dvr: {
    requires: [
      requirement('hd_interno', 'HD interno (armazenamento)', 'Sem HD o DVR não grava, só exibe ao vivo.', 'hd para dvr', true, { critical: true }),
      requirement('cameras', 'Câmeras analógicas compatíveis', 'Um gravador sozinho não gera imagem — precisa das câmeras nos canais.', 'câmera analógica'),
      requirement('fonte_12v', 'Fonte', 'Alimentação do equipamento, caso não esteja inclusa.', 'fonte 12v'),
      requirement('cabo_coaxial', 'Cabo coaxial (CFTV)', 'DVR trabalha com câmeras analógicas ligadas por cabo coaxial.', 'cabo coaxial cftv'),
      requirement('nobreak', 'Nobreak', 'Evita perda de gravação e corrupção do HD em queda de energia.', 'nobreak', false),
    ],
  },
  nvr: {
    requires: [
      requirement('hd_interno', 'HD interno (armazenamento)', 'Sem HD o NVR não grava, só exibe ao vivo.', 'hd para nvr', true, { critical: true }),
      requirement('cameras', 'Câmeras IP compatíveis', 'Um gravador sozinho não gera imagem — precisa das câmeras nos canais.', 'câmera ip'),
      requirement('fonte_12v', 'Fonte', 'Alimentação do equipamento, caso não esteja inclusa.', 'fonte 12v'),
      requirement('cabo_rede', 'Cabo de rede (CAT5e/CAT6)', 'NVR trabalha com câmeras IP ligadas por rede, não por cabo coaxial.', 'cabo de rede cat5e'),
      requirement('nobreak', 'Nobreak', 'Evita perda de gravação e corrupção do HD em queda de energia.', 'nobreak', false),
    ],
  },
  facial: {
    requires: [
      requirement('fonte_12v', 'Fonte 12V', 'Alimentação do terminal.', 'fonte 12v'),
      requirement('fechadura', 'Fechadura elétrica / eletroímã', 'O terminal facial controla o acesso, mas precisa acionar uma fechadura para travar/destravar.', 'fechadura elétrica'),
      requirement('cabo_rede', 'Cabo de rede', 'A maioria dos terminais faciais é IP e precisa de rede para sincronizar usuários/eventos.', 'cabo de rede cat5e'),
      requirement('nobreak', 'Nobreak', 'Evita que o terminal fique fora do ar em queda de energia, já que controla acesso físico.', 'nobreak', false),
    ],
  },
  porteiro: {
    requires: [
      requirement('fonte_12v', 'Fonte', 'Alimentação do equipamento.', 'fonte 12v'),
      requirement('cabo_rede', 'Cabeamento (rede ou par trançado conforme o modelo)', 'Liga a botoeira externa à central/monitor.', 'cabo de rede cat5e'),
      requirement('fechadura', 'Fechadura elétrica', 'Vídeo porteiro normalmente aciona uma fechadura elétrica para abrir a porta/portão remotamente.', 'fechadura elétrica'),
      requirement('caixa_steck', 'Caixa Steck', 'Protege as conexões da botoeira externa.', 'caixa steck'),
    ],
  },
  mikrotik: {
    requires: [
      requirement('fonte_12v', 'Fonte', 'Confirme se o modelo já acompanha fonte — RBs menores (hAP) geralmente incluem, CCR/CRS de rack costumam não incluir.', 'fonte 24v mikrotik', false),
      requirement('cabo_rede', 'Cabo de rede', 'Necessário para ligar o equipamento à rede.', 'cabo de rede cat6'),
      requirement('rack', 'Rack', 'Necessário só se o modelo escolhido for de montar em rack (CCR/CRS).', 'rack', false),
    ],
  },
  roteador: {
    requires: [
      requirement('cabo_rede', 'Cabo de rede', 'Necessário para ligar o equipamento à rede.', 'cabo de rede cat6'),
      requirement('nobreak', 'Nobreak', 'Mantém a rede ativa em queda de energia.', 'nobreak', false),
    ],
  },
  switch: {
    requires: [
      requirement('cabo_rede', 'Cabo de rede', 'Necessário para ligar os equipamentos ao switch.', 'cabo de rede cat6'),
      requirement('rack', 'Rack', 'Necessário se o switch for de montar em rack (19").', 'rack', false),
    ],
  },
};

function detectRecipeCategory(title) {
  const category = detectSecurityCategory(title);
  if (category === 'dvr_nvr') {
    // DVR é pra câmera analógica (coaxial), NVR é pra câmera IP (rede) — cabeamento diferente, então
    // viram receitas separadas aqui. Sem "NVR" explícito, o default é DVR: é o mais comum/tradicional
    // em CFTV nacional, mesmo critério de "variante mais comum" já usado pra câmera IP x analógica.
    return /\bnvr\b/i.test(title) ? 'nvr' : 'dvr';
  }
  if (category !== 'camera') return category;
  if (!/\bip\b/i.test(title)) return 'camera_analogica';
  // Sem "PoE" explícito, trata como não-PoE — mesmo critério de default já usado para IP x Analógica:
  // a variante mais restritiva/comum, para não deixar de sugerir a fonte 12V que ela vai precisar.
  return /\bpoe\b/i.test(title) ? 'camera_ip_poe' : 'camera_ip';
}

// Overlay: some anchors add requirements on top of the base category detected above, without
// replacing it (ex.: uma câmera AcuSense continua precisando do kit normal de câmera IP/analógica).
function detectOverlayCategories(title, baseCategory) {
  if (!/^camera/.test(baseCategory || '')) return [];
  return /\bacusense\b/i.test(title) ? ['camera_acusense'] : [];
}

function findSatisfyingTitle(pattern, titles, lowerTitles) {
  const index = lowerTitles.findIndex((title) => pattern.test(title));
  return index === -1 ? null : titles[index];
}

// Um requisito com alternatives vira uma linha por opção, nunca uma linha combinada: nenhuma
// escolhida ainda = as duas "critical" (vermelho); uma escolhida = ela some (satisfied_by aponta
// pra ela) e a outra vira "optional" (laranja) — ainda dá pra arrastar, só deixou de ser obrigatória.
function evaluateAlternativeRequirement(item, titles, lowerTitles) {
  const evaluated = item.alternatives.map((alt) => ({ ...alt, satisfied_by: findSatisfyingTitle(alt.pattern, titles, lowerTitles) }));
  const anySatisfied = evaluated.some((alt) => alt.satisfied_by);
  return evaluated.map((alt) => ({
    key: alt.key,
    label: alt.label,
    reason: item.reason,
    search_term: alt.search_term,
    essential: true,
    severity: alt.satisfied_by ? null : (anySatisfied ? 'optional' : 'critical'),
    satisfied_by: alt.satisfied_by,
  }));
}

// requirements_by_category dá ao front-end (canvas estilo n8n) a árvore completa por âncora, já
// com quem satisfaz cada requisito — assim ele desenha a aresta certa (âncora → nó real quando já
// satisfeito, âncora → nó de sugestão quando ainda falta) sem duplicar a lógica de casamento em JS.
function computeMissingEssentials(cartTitles) {
  const titles = (Array.isArray(cartTitles) ? cartTitles : []).map(normalize).filter(Boolean);
  const lowerTitles = titles.map((title) => title.toLowerCase());
  const detected_categories = [...new Set(titles.flatMap((title) => {
    const baseCategory = detectRecipeCategory(title);
    return [baseCategory, ...detectOverlayCategories(title, baseCategory)];
  }).filter((category) => RECIPES[category]))];
  const requirementsByKey = new Map();
  const requirements_by_category = {};
  // AcuSense soma seu próprio par alternativo NVR-ou-cartão (ver camera_acusense) — o 'nvr' isolado e
  // obrigatório da câmera IP/analógica base fica redundante (e contradiz a regra: AcuSense pode ser
  // vendida sem NVR quando usa cartão), então some daqui quando o overlay estiver ativo.
  const hasAcusense = detected_categories.includes('camera_acusense');
  for (const category of detected_categories) {
    const requires = hasAcusense && (category === 'camera_ip' || category === 'camera_ip_poe')
      ? RECIPES[category].requires.filter((item) => item.key !== 'nvr')
      : RECIPES[category].requires;
    requirements_by_category[category] = requires.flatMap((item) => {
      if (item.alternatives) return evaluateAlternativeRequirement(item, titles, lowerTitles);
      const { key, label, reason, search_term, essential, critical, pattern } = item;
      const satisfied_by = findSatisfyingTitle(pattern, titles, lowerTitles);
      return [{ key, label, reason, search_term, essential, severity: critical && !satisfied_by ? 'critical' : undefined, satisfied_by }];
    });
    for (const item of requires) {
      if (item.alternatives) {
        for (const alt of item.alternatives) requirementsByKey.set(alt.key, { key: alt.key, label: alt.label, reason: item.reason, search_term: alt.search_term, essential: true, pattern: alt.pattern });
      } else {
        requirementsByKey.set(item.key, item);
      }
    }
  }
  const missing = [...requirementsByKey.values()]
    .filter((item) => !lowerTitles.some((title) => item.pattern.test(title)))
    .map(({ key, label, reason, search_term, essential }) => ({ key, label, reason, search_term, essential }));
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
  const items = Array.isArray(request.items) ? request.items : [];
  const titles = items.map((item) => normalize(typeof item === 'string' ? item : item?.title)).filter(Boolean);
  if (!titles.length) throw new Error('Informe ao menos um item no orçamento.');
  if (titles.length > 50) throw new Error('Limite de 50 itens por orçamento.');
  return titles;
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
      const titles = validateRecipeItems(body);
      // "items" ecoa a categoria detectada de cada item de entrada, na mesma ordem — o canvas
      // (estilo n8n) usa isso pra saber de qual nó desenhar a aresta, sem duplicar detecção em JS.
      const items = titles.map((title) => ({ title, category: detectRecipeCategory(title) }));
      return sendJson(response, 200, { ...computeMissingEssentials(titles), items });
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
  computeMissingEssentials,
  detectOverlayCategories,
  detectRecipeCategory,
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
  RECIPES,
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
