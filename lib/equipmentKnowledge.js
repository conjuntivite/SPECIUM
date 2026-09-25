// Fichas técnicas dos fornecedores de controle de acesso/portaria remota (ONE PORTARIA e SIAM),
// destiladas dos datasheets e manuais oficiais deles (Drive dos fornecedores, set/2026). Cada ficha
// só entra no prompt de auditoria quando o NOME de algum item do orçamento bater com `match` — o
// modelo gratuito tem contexto pequeno, então não dá pra mandar tudo sempre. Só fatos lidos nos
// documentos; ao mudar/estender, mantenha o rótulo do fornecedor no texto ("ONE:" / "SIAM:").
const { callOpenRouter, candidateModels } = require('./openrouter');

const EQUIPMENT_KNOWLEDGE = [
  // ---------- ONE PORTARIA ----------
  { match: /c[oó]rtex|endpoint|one\s*portaria/i, text: 'ONE (portaria remota/autogerenciada): uma central Córtex + endpoints ligados por rede (precisa de switch). Todo endpoint precisa de fonte 12V (plug P4). Leitor Wiegand só liga em Endpoint 4 Portas ou FULL; Multi-IO, Sound e AquaMonitor não têm porta Wiegand. Endpoints 4 Portas/FULL/Multi-IO/Sound são compatíveis com Córtex 4 e 5. Fechadura/eletroímã liga no relé do endpoint (eletroímã no NF, trava elétrica no NA) com fonte própria — o relé só comuta. Portão pivotante/deslizante/basculante usa o Receptor FULL.' },
  { match: /c[oó]rtex|endpoint|one\s*portaria/i, text: 'ONE (guia de instalação oficial): cabo de leitor Wiegand blindado com no máximo 30 m; ligar cada dispositivo direto no switch/roteador (não cascatear); fontes SEPARADAS para faciais, eletroímãs e endpoints (nunca uma fonte só para todos os endpoints); link de no mínimo 30 Mbps de upload e download, com redundância, e VPN entre o condomínio e a base de monitoramento; equipamento em área externa com IP66 (botoeira de uso interno não vai em área externa); nobreak e baterias dimensionados para a carga total; só equipamentos homologados pela ONE (lista no Blog de Equipamentos da ONE).' },
  { match: /c[oó]rtex|endpoint|one\s*portaria/i, text: 'ONE (planos comerciais do SERVIÇO de portaria remota — é escopo de venda, NÃO exigência técnica de compatibilidade entre equipamentos: um leitor facial/controladora de acesso não exige câmera, por exemplo. Nem todo orçamento precisa de tudo; só aponte falta se o orçamento pretende ser uma portaria remota completa): todos os planos trazem câmeras Full HD, transmissão de dados com redundância, baterias e nobreak para portas e portões, alerta de portão aberto (sensor), notificação de carona, controle remoto veicular e botoeira de saída. Do plano intermediário em diante: leitura facial. Avançado/completo: portas sociais motorizadas, link redundante, interfone de elevador, monitoramento de caixa d\'água. Só no completo: cerca elétrica interligada, antenas veiculares, armário inteligente. Portaria autogerenciada (AG/AG Plus): câmeras Full HD, botoeira de saída, controle remoto veicular, leitura facial, interfonia via app. O hardware ONE costuma ser locado/comodato pelo afiliado, não vendido ao condomínio.' },
  { match: /c[oó]rtex\s*ag\b/i, text: 'ONE Córtex AG: só portaria AUTO-GERENCIADA, 1 condomínio, no máximo 30 endpoints e 30 leitores IP. LAN 10/100 sem PoE; fonte externa AC 100-240V -> 5V/3A. Só em locação/comodato: é normal ele constar no orçamento sem custo — NÃO aponte a presença dele como erro. Cenário: switch -> Endpoint 4 Portas -> leitores Wiegand, sensores e comandos.' },
  { match: /c[oó]rtex\s*(v\.?\s*)?5\b/i, text: 'ONE Córtex V5: LAN 10/100, fonte AC 100-240V -> 12V/5A, lê QR Code, aceita até 4 câmeras RTSP. Garantia só durante a vigência do contrato: é cedido em comodato e costuma constar no orçamento sem custo (normal, não é erro).' },
  { match: /c[oó]rtex\s*(v\.?\s*)?6\b/i, text: 'ONE Córtex V6: sucessor do V5 (display, web nova), 2GB RAM, LAN 10/100/1000, fonte AC 100-240V -> 12V/5A. Gerencia vários endpoints e vários leitores faciais online. Garantia só durante a vigência do contrato: é cedido em comodato e costuma constar no orçamento sem custo (normal, não é erro).' },
  { match: /endpoint.*4\s*portas|4\s*portas.*endpoint/i, text: 'ONE Endpoint 4 Portas: 4 portas Wiegand 26/34 bits (4 leitores), saída 12V para alimentar os leitores, 4 entradas de contato seco (sensores) e 4 relés NA/NF de 10A (o diagrama do mesmo datasheet cita 15A). Fonte P4 12V.' },
  { match: /endpoint.*full|endpoint\s*full/i, text: 'ONE Endpoint FULL: 2 portas Wiegand 26/34 bits, 8 entradas de contato seco, 4 relés NA/NF de 10A. Fonte P4 12V/5A (mais forte que os outros endpoints).' },
  { match: /multi[\s-]*io|mult[\s-]*io/i, text: 'ONE Endpoint Multi-IO: SEM Wiegand — 4 entradas de contato seco e 4 relés NA/NF de até 15A (automação de portão/motor). Fonte P4 12V.' },
  { match: /endpoint.*sound|one\s*sound/i, text: 'ONE Endpoint Sound: toca áudios (WAV, microSD 16GB) na portaria remota; saída de 8 ohms, máx 30W, então PRECISA de caixa de som. Fonte 12V.' },
  { match: /aqua\s*monitor/i, text: 'ONE Endpoint AquaMonitor: monitora caixa d\'água. 2 relés (bombas, máx 15A), sonda hidrostática 0-100% (sinal 0-10V, vendida à parte do endpoint), 3 entradas para sensores (temperatura, umidade, vibração, corrente). Ethernet ou Wi-Fi. Fonte P4 12V/2A.' },
  { match: /mesa\s*(de\s*)?cadastro/i, text: 'ONE Mesa de Cadastro USB: cadastra tags RFID 13MHz (Mifare) e 125MHz e controles remotos RF 433,92MHz (Linear, Citrox CX-7421, PPA ZAP 2 e 4). Conexão USB (Windows/Linux/iOS). É ferramenta de cadastro, 1 por operação, não por portaria.' },
  { match: /receptor.*433|433.*receptor|(receptor|receptora|recpetora)\s*full/i, text: 'ONE Receptor 433 (Delay/FULL): recebe controles remotos 433,92MHz e entrega Wiegand 26 bits (liga no Endpoint 4 Portas/FULL); alcance ~40m; 12V; 1 unidade atende vários portões. O FULL tem antena externa, limitação de frequência, code learning e delay p/ Nice.' },
  { match: /f(alt|alh)a\s*(de\s*)?energia/i, text: 'ONE Sensor de Falha de Energia: entrada 110/220V, saída contato seco (NF com energia, NA sem). Deve ser ligado direto na rede elétrica, nunca depois do nobreak (senão não detecta a falta).' },

  // ---------- SIAM ----------
  { match: /idbm|\bras\b|siam/i, text: 'SIAM (rede RAS): a central iDBM+ comanda um barramento RAS de dispositivos (controladoras, leitoras de expansão, sensores IMU, atuadores). O manual dá 55-65 dispositivos como limite absoluto e avisa problemas acima de 50 — não passar de ~50 por iDBM+. Cabo recomendado: cobre 0,5mm (CCI 4/6 vias ou UTP CAT5e). Distância máx. do cabo cai com a quantidade de dispositivos: 5 disp = ~190m, 10 = ~95m, 15 = ~63m, 20 = ~47m.' },
  { match: /protetor\s*ras|protetor\s*de\s*linha/i, text: 'SIAM Protetor RAS: protege só a comunicação RAS (não a fonte). Duas saídas protegidas, máx 15 dispositivos por saída; acima de 30 dispositivos exige outro protetor. Indicado quando o cabo RAS sai do painel da iDBM+.' },
  { match: /ptsm|multiplicador|testador\s*ras/i, text: 'SIAM Multiplicador PTSM-6: distribui a alimentação/RAS a vários dispositivos, corrente máx 10A na entrada. Testador RAS: ferramenta de instalação (não é item por obra).' },
  { match: /\bliva\b|cubieboard|servidor\s*siam/i, text: 'SIAM Servidor (mini PC Ubuntu, linhas LIVA/Cubieboard): guarda todo o sistema WSSIAM; cada servidor LIVA atende até 4 iDBM+. Fonte 12V/3A (LIVA X, X2, Concordia) ou 19V/3,42A (LIVA Z, ZE, ZA) — fontes diferentes, não intercambiáveis.' },
  { match: /1p4l|controladora\s*ras/i, text: 'SIAM Controladora RAS 1P4L: controle de acesso de portas/portões com leitoras Wiegand (RFID, senha, biometria); leitoras QR Code e controle remoto entram pela expansão. Até 30.000 chaves, 7.000 usuários e 16 dispositivos simultâneos. Precisa estar na rede RAS (iDBM+).' },
  { match: /ip\s*controller|\bipc\b|dual\s*gate|dualgate/i, text: 'SIAM IP Controller (IPC, RS485): até 65.000 chaves/usuários; aceita leitoras SIAM, Wiegand e integradas via API (RFID, senha, biometria, facial, QR). Dual Gate é EXPANSÃO da IPC (2 gateif, não funciona sozinha; até 8 dispositivos IPC/Dual Gate). Manuais marcados "em desenvolvimento".' },
  { match: /i12o2/i, text: 'SIAM I12O2: filho da IPC via RS485; até 24 sensores (12 zonas duplas) e 2 cargas de até 4A. Configuração só via Postman por enquanto (produto em desenvolvimento).' },
  { match: /i8o2|i802/i, text: 'SIAM i8O2: 2 relés + 8 entradas de zona dupla. Como central de alarme: até 16 sensores em até 4 partições, evento via Contact ID. O firmware é diferente por função — i8O2 de catraca NÃO substitui i8O2 de automação (e vice-versa).' },
  { match: /bruson|digicon|\bfoca\b|alianza|1cxl|stile/i, text: 'SIAM Catracas: a SIAM não fabrica a catraca, integra as de mercado (Digicon Catrax Plus, Bruson, Foca com placa FC-150, Alianza) com controladora 1CXL ou i8O2 Stile + leitoras. Se a catraca já tem placa de comando (ex.: Digicon) a integração é diferente da catraca sem placa (Bruson sem CPU Lite).' },
  { match: /controladora\s*(de\s*)?elevador/i, text: 'SIAM Controladora de Elevador: PCI instalada dentro do painel do elevador, liga nas teclas (chaves ópticas) para limitar os andares por usuário — exige abrir o painel do elevador (serviço de instalação).' },
  { match: /discador/i, text: 'SIAM Discador CID: backup de envio Contact-ID para a central de monitoramento por linha telefônica ou rádio/GPRS. Só funciona com receptores que usam CID (SIGMA, MONI, IRIS).' },
  { match: /\b(q101|le[\s-]?170|kr00\d|r00\d|c00\d)\b/i, text: 'SIAM Leitoras: Q101 e LE 170 são UHF passivo 900MHz (veicular; Q101 até 4m, LE 170 até 12m; Wiegand 26/34, 12V) — acima de 3m de cabo na Q101 usar fonte auxiliar. KR00x = RFID+senha IP68 (área externa); R00x = RFID econômica IP65; C00x = leitoras de controle remoto (alcance 80-100m). Todas usadas com controladora SIAM.' },
  { match: /\bimu\b|imee|no-?break\s*monitor|interface\s*sensor\s*de\s*tens/i, text: 'SIAM Sensores da rede RAS: IMU Discreto (2 sensores NF/NA), IMU Inundação (sonda de água), IMU Tensão (110/220V, avisa falta de energia), IMEE Monofásico (medição de energia), No-Break Monitor (monitora nobreak: 2 tensões DC + rede AC).' },
  { match: /atuador\s*(rel[eé]|triac)|\b1a1r\b/i, text: 'SIAM Atuadores (rede RAS): Atuador Relé 1A1R (motores, bombas, lâmpadas de maior potência) e Atuador TRIAC (só lâmpadas em corrente alternada).' },
];

function relevantKnowledge(items) {
  const names = items.map((i) => i.name);
  return EQUIPMENT_KNOWLEDGE.filter((k) => names.some((n) => k.match.test(n))).map((k) => `- ${k.text}`).join('\n');
}

// Assistente de conversa (aba "Assistente"): aqui vão TODAS as fichas de uma vez (~3k tokens),
// porque a pergunta é livre e não dá pra saber pelo nome do item qual ficha importa.
const ASSISTANT_MAX_MESSAGES = 20;
const ASSISTANT_MAX_CHARS = 2000;

function validateAssistantMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) throw new Error('Envie ao menos uma pergunta.');
  const recent = messages.slice(-ASSISTANT_MAX_MESSAGES);
  const clean = recent.map((m) => {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string') throw new Error('Mensagem inválida.');
    const content = m.content.trim();
    if (!content || content.length > ASSISTANT_MAX_CHARS) throw new Error(`Cada mensagem deve ter de 1 a ${ASSISTANT_MAX_CHARS} caracteres.`);
    return { role: m.role, content };
  });
  if (clean[clean.length - 1].role !== 'user') throw new Error('A última mensagem precisa ser uma pergunta.');
  return clean;
}

// Contas que os comerciais pedem no dia a dia (autonomia, dias de gravação, PoE, bitola, link). O
// modelo roda sem raciocínio e erra aritmética solta — com a fórmula escrita ele segue o passo a
// passo e mostra a conta, que dá pra conferir. Valores típicos são referência de mercado, não ficha.
// ponytail: aritmética ainda é do modelo; se o log (assistant_logs) mostrar contas erradas, trocar
// por tool calling com funções JS.
const SIZING_FORMULAS = [
  'Nobreak: potência útil (W) ≈ VA × fator de potência (0,6 nos nobreaks comuns; conferir etiqueta). Carga acima disso não sustenta. Energia da bateria (Wh) = tensão (V) × Ah × nº de baterias (sem o modelo, supor bateria interna típica de nobreak nacional: até 800VA = 1 × 12V 7Ah; 1200-1500VA = 2 × 12V 7Ah; e avisar para conferir); útil ≈ 70% disso (perdas do inversor e descarga incompleta). Autonomia (h) ≈ Wh útil ÷ carga (W). Carga = soma do CONSUMO dos equipamentos, não da capacidade das fontes (fonte 12V/5A não significa 60W consumidos). Carga alta derruba a autonomia mais que o proporcional.',
  'Gravação (DVR/NVR): GB por dia por câmera ≈ bitrate (Mbps) × 10,8. Dias ≈ capacidade útil (GB; 1 TB ≈ 930 GB úteis) ÷ (nº de câmeras × GB/dia). Bitrate típico em H.265, gravação contínua: 1080p ≈ 2 Mbps, 4MP ≈ 3-4 Mbps, 8MP/4K ≈ 6 Mbps; H.264 ≈ o dobro; gravação só por movimento reduz bastante.',
  'PoE: soma do consumo das câmeras ≤ orçamento PoE total do switch (não só o por porta), com ~20% de folga. Porta 802.3af entrega até 15,4W, 802.3at até 30W. Cabo UTP no máximo 100 m por lance.',
  'Queda de tensão em 12V DC: ΔV = 2 × distância (m) × corrente (A) × 0,0172 ÷ bitola (mm²), para cobre puro. Cabo CCA (cobre-alumínio) ≈ 1,6× mais queda. Equipamento 12V tolera ~10% (1,2V); passou disso, aumentar a bitola, aproximar a fonte ou usar fonte local.',
  'Link de internet (acesso remoto): upload ≈ soma dos bitrates das câmeras vistas ao mesmo tempo (substream ≈ 0,5 Mbps por câmera, stream principal = bitrate de gravação) + 30% de folga.',
];

function buildAssistantSystemPrompt() {
  return [
    'Você é o assistente técnico-comercial do SPECIUM, usado por vendedores de segurança eletrônica.',
    'SEU FOCO PRINCIPAL são os sistemas ONE PORTARIA e SIAM: projeto, o que é preciso, quantidades, ligações, limites e cuidados de instalação. Conhecimento geral de segurança eletrônica (CFTV, rede, energia, cabeamento) vem DEPOIS, como apoio.',
    'Ordem de prioridade das fontes: 1) as fichas ONE/SIAM abaixo (fonte oficial; não invente número, modelo ou limite que não esteja nelas; cada ficha vale só para o modelo que ela nomeia — ex.: os 30 endpoints são do Córtex AG, não do V5/V6); 2) fórmulas de dimensionamento; 3) conhecimento geral, sempre dizendo que é referência de mercado e não dado do fabricante.',
    'Equipamento de terceiros usado junto com ONE/SIAM (ex.: antena UHF de tag veicular, leitor facial, leitora, fechadura, catraca, motor de portão de outra marca): responda pelo lado ONE/SIAM — em qual equipamento ONE/SIAM ele liga, por qual interface (Wiegand, contato seco, relé, rede) e quais limites das fichas se aplicam (ex.: Wiegand só no Endpoint 4 Portas/FULL, cabo Wiegand até 30 m, fonte separada). Na ONE, lembre que só vale equipamento homologado (lista no Blog de Equipamentos da ONE). Especificação do equipamento de terceiros que não está nas fichas: diga o que costuma ser e peça para confirmar no datasheet do fabricante.',
    'Regras que NÃO podem ser quebradas: (a) número que a ficha de um modelo não traz = diga "a ficha não informa, confirmar com a ONE/SIAM" — NUNCA use o limite de outro modelo como estimativa "segura"; (b) não afirme se um equipamento está ou não na lista de homologados da ONE — você não tem a lista, mande conferir; (c) regra de um fornecedor não vale para o outro (ex.: Wiegand até 30 m é do guia ONE, não do SIAM); (d) ONE = Córtex, Endpoints, Receptor 433, Mesa de Cadastro, sensores ONE; SIAM = iDBM+, rede RAS, LIVA, 1P4L, IPC, i8O2, IMU, leitoras Q101/LE 170 etc. — nunca atribua esses produtos a outra marca.',
    'Pergunta fora de ONE/SIAM: responda normalmente com conhecimento geral e, se fizer sentido, conecte com o sistema ONE/SIAM.',
    'Responda em português do Brasil, direto e prático (listas curtas quando ajudar).',
    'Se faltar dado para responder com número (carga em W, nº de câmeras, portas, portões, distância, modelo), PERGUNTE antes. Se der para estimar, estime deixando as premissas explícitas ("considerando X, ...") e diga o que mudaria o resultado.',
    'Em contas de dimensionamento, use as fórmulas e SEMPRE mostre a conta passo a passo, com unidades.',
    'Quando o comercial passar os requisitos de um projeto ou pedir um orçamento, monte um ORÇAMENTO SUGERIDO: uma linha por equipamento, no formato exato "- 2x Nome do equipamento" (quantidade, "x", nome; observação curta entre parênteses se precisar). Use esse formato "- Nx" SOMENTE nas linhas do orçamento — ele vira botão de importar para a tela de Orçamentos. Depois da lista, diga as premissas e o que falta confirmar. Faltando dado essencial (nº de portas, portões, câmeras), pergunte antes de montar.',
    'Regras do orçamento sugerido: (1) quantidade é a sua melhor estimativa pelo que foi pedido (4 pontos de acesso = 4 botoeiras), nunca "1" como marcador de "a definir"; (2) dimensione pelo MÍNIMO que atende usando os limites das fichas (ex.: 1 Endpoint 4 Portas tem 4 relés e 4 Wiegand — 3 acessos cabem num só); (3) item ONE/SIAM só com nome que existe nas fichas — não invente produto do fornecedor (ex.: não existe "câmera ONE"; câmera é genérica, ex.: "Câmera IP Full HD"); (4) inclua os itens de apoio que as fichas exigem (fonte de cada endpoint, fonte dos eletroímãs, switch, nobreak, cabo).',
    '',
    'Fichas técnicas ONE / SIAM (fonte principal):',
    EQUIPMENT_KNOWLEDGE.map((k) => `- ${k.text}`).join('\n'),
    '',
    'Fórmulas de dimensionamento (apoio):',
    SIZING_FORMULAS.map((f) => `- ${f}`).join('\n'),
    '',
    // No fim de propósito: modelo sem raciocínio obedece mais o que leu por último.
    'FORMATO OBRIGATÓRIO: a tela só mostra texto simples, listas com "-" e **negrito**. PROIBIDO: tabelas (|), LaTeX, títulos com #, linhas "---" e blocos de código. Contas em linha (ex.: 24 V × 7 Ah = 168 Wh).',
  ].join('\n');
}

async function askEquipmentAssistant(messages) {
  const history = validateAssistantMessages(messages);
  const { content, model } = await callOpenRouter({
    messages: [{ role: 'system', content: buildAssistantSystemPrompt() }, ...history],
    temperature: 0.3,
    maxTokens: 1200,
    models: candidateModels(process.env.OPENROUTER_MODEL_AUDIT || process.env.OPENROUTER_MODEL),
    reasoning: { enabled: false },
  });
  return { answer: content.trim(), model };
}

// "Criar orçamento" a partir de uma resposta do assistente: só as linhas "- 2x Item" (formato que o
// prompt pede) viram item — o resto do texto (premissas, observações) não entra. Quem casa o nome
// com a categoria do catálogo é o mesmo classificador da auditoria de PDF (classifyQuoteItems).
// O front usa a mesma regex pra decidir se mostra o botão.
const BUDGET_LINE = /^\s*[-*•]\s*(\d+)\s*x\s+(.+?)\s*$/i;

function extractBudgetLines(answer) {
  return String(answer || '').replace(/\*\*/g, '').split('\n')
    .map((line) => line.match(BUDGET_LINE))
    .filter(Boolean)
    .map((m) => `${m[1]}x ${m[2]}`);
}

// Uma linha = um card, mesmo com categoria repetida: o catálogo é genérico (Córtex, Endpoint 4
// Portas e Endpoint FULL caem todos em "Controladora de Acesso") e somar esconderia o que cada card
// é — separado, o comercial escolhe o produto certo em cada um. Posições em grade de 4 colunas pra
// não nascer tudo numa fila só no canvas.
const GRID_COLUMNS = 4;
function buildBudgetFromClassified(classified, categories) {
  const iconByValue = new Map(categories.map((c) => [c.value, c.icon || null]));
  const items = [];
  const skipped = [];
  for (const entry of classified) {
    if (!entry.category) { skipped.push(entry.name); continue; }
    items.push({ id: items.length + 1, title: entry.category, quantity: entry.quantity, icon: iconByValue.get(entry.category), containerId: null, containerOpen: true });
  }
  const positions = Object.fromEntries(items.map((item, i) => [
    `item-${item.id}`, { x: 60 + (i % GRID_COLUMNS) * 300, y: 60 + Math.floor(i / GRID_COLUMNS) * 200 },
  ]));
  return { items, positions, skipped };
}

module.exports = {
  EQUIPMENT_KNOWLEDGE, SIZING_FORMULAS, relevantKnowledge, validateAssistantMessages, buildAssistantSystemPrompt, askEquipmentAssistant,
  extractBudgetLines, buildBudgetFromClassified,
};
