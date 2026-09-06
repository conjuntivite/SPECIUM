// Pré-build das dependências entre categorias — a tradução, categoria por categoria, das receitas
// que viviam fixas em server.js (RECIPES). Usada só na primeira semeadura da coleção "categories"
// (ver ensureCategoriesSeeded em db.js); depois disso quem manda é o cadastro (aba Categorias), não
// este arquivo. Toda dependência aqui é só presença/alternativa — "qualquer switch", "qualquer NVR"
// ou "qualquer DVR" enumera as variantes como alternativas mútuas (uma resolve todas as outras),
// sem nenhuma conta de quantidade/canal por trás. Já tentamos uma versão com capacidade (portas por
// câmera, canais por câmera) e ela quebrava sempre que mais de uma variante do mesmo grupo ficava
// marcada ao mesmo tempo (a necessidade somava errado, multiplicada por cada uma) — tirado de
// propósito, mantém só o que o cadastro consegue validar sem essa armadilha.

const FINISHING_KIT = ['Canaleta', 'Cano Corrugado', 'Caixa de Passagem', 'Cotovelo', 'Abraçadeira', 'Eletroduto', 'Adaptador'];
const SWITCH_POE_FAST_ALL = ['Switch PoE Fast 4 Portas', 'Switch PoE Fast 8 Portas', 'Switch PoE Fast 16 Portas', 'Switch PoE Fast 24 Portas'];
const SWITCH_POE_GIGA_ALL = ['Switch PoE Giga 4 Portas', 'Switch PoE Giga 8 Portas', 'Switch PoE Giga 16 Portas', 'Switch PoE Giga 24 Portas'];
const SWITCH_GIGA_ALL = ['Switch Giga 4 Portas', 'Switch Giga 8 Portas', 'Switch Giga 16 Portas', 'Switch Giga 24 Portas'];
const SWITCH_FAST_ALL = ['Switch Fast 4 Portas', 'Switch Fast 8 Portas', 'Switch Fast 16 Portas', 'Switch Fast 24 Portas'];
const SWITCH_POE_ALL = [...SWITCH_POE_FAST_ALL, ...SWITCH_POE_GIGA_ALL];
const NVR_ALL = ['NVR 4 Canais', 'NVR 8 Canais', 'NVR 16 Canais', 'NVR 24 Canais', 'NVR 32 Canais', 'NVR 48 Canais', 'NVR 64 Canais'];
const DVR_ALL = ['DVR 4 Canais', 'DVR 8 Canais', 'DVR 16 Canais', 'DVR 24 Canais', 'DVR 32 Canais', 'DVR 48 Canais', 'DVR 64 Canais'];
const SWITCH_ALL = [...SWITCH_FAST_ALL, ...SWITCH_GIGA_ALL, ...SWITCH_POE_ALL];

function critical(value) {
  return { categoryValue: value, critical: true, alternatives: [] };
}
function mutualCritical(values) {
  return values.map((value) => ({ categoryValue: value, critical: true, alternatives: values.filter((v) => v !== value) }));
}
function suggested(values) {
  return values.map((value) => ({ categoryValue: value, critical: false, alternatives: [] }));
}

// Cada chave é o `value` exato da categoria. Comentário ao lado remete à receita original em
// server.js (RECIPES) de onde a regra foi extraída.
const CATEGORY_DEPENDENCY_SEED = {
  // camera_ip
  'Câmera IP': [
    critical('Fonte 12V'),
    ...mutualCritical(SWITCH_ALL),
    ...mutualCritical(NVR_ALL),
    ...suggested(['Cabo de Rede CAT6', 'Caixa Steck', ...FINISHING_KIT]),
  ],
  // camera_ip_poe
  'Câmera IP PoE': [
    ...mutualCritical(['Fonte 12V', ...SWITCH_POE_ALL]),
    ...mutualCritical(SWITCH_ALL),
    ...mutualCritical(NVR_ALL),
    ...suggested(['Cabo de Rede CAT6', 'Caixa Steck', ...FINISHING_KIT]),
  ],
  // camera_analogica
  'Câmera Analógica': [
    ...mutualCritical(DVR_ALL),
    ...suggested(['Cabo Coaxial CFTV', 'Baluns', 'Conector BNC/P4', 'Fonte 12V', 'Caixa Steck', ...FINISHING_KIT]),
  ],
  // camera_ip (- nvr) + camera_acusense overlay
  'Câmera AcuSense IP': [
    critical('Fonte 12V'),
    ...mutualCritical(['Cartão de Memória', ...NVR_ALL]),
    ...mutualCritical(SWITCH_ALL),
    ...suggested(['Cabo de Rede CAT6', 'Caixa Steck', 'Central de Alarme', ...FINISHING_KIT]),
  ],
  // camera_ip_poe (- nvr) + camera_acusense overlay
  'Câmera AcuSense IP PoE': [
    ...mutualCritical(['Fonte 12V', ...SWITCH_POE_ALL]),
    ...mutualCritical(['Cartão de Memória', ...NVR_ALL]),
    ...mutualCritical(SWITCH_ALL),
    ...suggested(['Cabo de Rede CAT6', 'Caixa Steck', 'Central de Alarme', ...FINISHING_KIT]),
  ],
  // camera_analogica (inalterada) + camera_acusense overlay
  'Câmera AcuSense Analógica': [
    ...mutualCritical(['Cartão de Memória', ...NVR_ALL]),
    ...mutualCritical(DVR_ALL),
    ...suggested(['Cabo Coaxial CFTV', 'Baluns', 'Conector BNC/P4', 'Fonte 12V', 'Caixa Steck', 'Central de Alarme', ...FINISHING_KIT]),
  ],
  'Terminal Facial': suggested(['Fonte 12V', 'Fechadura Elétrica', 'Cabo de Rede CAT6', 'Nobreak']),
  'Vídeo Porteiro': suggested(['Fonte 12V', 'Cabo de Rede CAT6', 'Fechadura Elétrica', 'Caixa Steck']),
  'Mikrotik': suggested(['Fonte 12V', 'Cabo de Rede CAT6', 'Rack']),
  'Roteador Wi-Fi': suggested(['Cabo de Rede CAT6', 'Nobreak']),
};

for (const dvr of DVR_ALL) {
  CATEGORY_DEPENDENCY_SEED[dvr] = [critical('HD Interno (armazenamento)'), ...suggested(['Câmera Analógica', 'Fonte 12V', 'Cabo Coaxial CFTV', 'Nobreak'])];
}
for (const nvr of NVR_ALL) {
  CATEGORY_DEPENDENCY_SEED[nvr] = [critical('HD Interno (armazenamento)'), ...suggested(['Câmera IP PoE', 'Fonte 12V', 'Cabo de Rede CAT6', 'Nobreak'])];
}
for (const sw of SWITCH_ALL) {
  CATEGORY_DEPENDENCY_SEED[sw] = suggested(['Cabo de Rede CAT6', 'Rack']);
}

module.exports = { CATEGORY_DEPENDENCY_SEED };
